package app.pager.android

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import org.matrix.rustcomponents.sdk.crypto.BackupRecoveryKey
import org.matrix.rustcomponents.sdk.crypto.DeviceLists
import org.matrix.rustcomponents.sdk.crypto.EncryptionSettings
import org.matrix.rustcomponents.sdk.crypto.EventEncryptionAlgorithm
import org.matrix.rustcomponents.sdk.crypto.HistoryVisibility
import org.matrix.rustcomponents.sdk.crypto.OlmMachine
import org.matrix.rustcomponents.sdk.crypto.ProgressListener
import org.matrix.rustcomponents.sdk.crypto.Request
import org.matrix.rustcomponents.sdk.crypto.RequestType
import uniffi.matrix_sdk_crypto.DecryptionSettings
import uniffi.matrix_sdk_crypto.TrustRequirement
import java.io.File
import java.net.URLEncoder

/**
 * End-to-end encryption (Matrix Olm/Megolm) for Android, using the matrix-rust-sdk crypto library: the same one the web app uses.
 * This class is the glue: it feeds sync data in, sends the library's own requests (keys, to-device messages), decrypts incoming
 * events and encrypts outgoing ones. It knows nothing about the rest of the app.
 */
class E2ee private constructor(
    private val machine: OlmMachine,
    private val tx: suspend (method: String, path: String, body: JsonElement?) -> JsonObject,
    val userId: String,
    val deviceId: String,
) {
    /** Called when a key arrives that may unlock messages we could not read before. */
    var onKeys: ((List<String>) -> Unit)? = null
    @Volatile private var closed = false
    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")
    private val trust get() = DecryptionSettings(TrustRequirement.UNTRUSTED)

    companion object {
        suspend fun create(context: Context, tx: suspend (String, String, JsonElement?) -> JsonObject, userId: String, deviceId: String): E2ee = withContext(Dispatchers.IO) {
            val dir = File(context.filesDir, "e2ee/" + (userId + "_" + deviceId).replace(Regex("[^A-Za-z0-9._-]"), "_")).apply { mkdirs() }
            E2ee(OlmMachine(userId, deviceId, dir.path, null), tx, userId, deviceId)
        }

        /** JSON with sorted keys and no spaces, the form Matrix signs. */
        fun canonicalJson(v: JsonElement): String = when (v) {
            is JsonObject -> v.entries.sortedBy { it.key }.joinToString(",", "{", "}") { "${JsonPrimitive(it.key)}:${canonicalJson(it.value)}" }
            is JsonArray -> v.joinToString(",", "[", "]") { canonicalJson(it) }
            else -> v.toString()
        }
    }

    // ---- Requests the library wants sent ---------------------------------------------------------------------------

    /** Sends everything the library has queued (key uploads, device queries, key sharing) and reports the answers back. */
    suspend fun pump() {
        if (closed) return
        for (round in 0 until 5) {
            val requests = withContext(Dispatchers.IO) { machine.outgoingRequests() }
            if (requests.isEmpty()) break
            for (r in requests) send(r)
        }
        if (withContext(Dispatchers.IO) { machine.backupEnabled() }) {
            for (i in 0 until 20) { val r = withContext(Dispatchers.IO) { machine.backupRoomKeys() } ?: break; send(r) }
        }
    }

    private suspend fun send(r: Request) {
        if (closed) return
        val parsed = { s: String -> kotlinx.serialization.json.Json.parseToJsonElement(s) }
        val (id, type, response) = try {
            when (r) {
                is Request.KeysUpload -> Triple(r.requestId, RequestType.KEYS_UPLOAD, tx("POST", "/_matrix/client/v3/keys/upload", parsed(r.body)))
                is Request.KeysQuery -> Triple(r.requestId, RequestType.KEYS_QUERY, tx("POST", "/_matrix/client/v3/keys/query", buildJsonObject {
                    put("timeout", 10000); putJsonObject("device_keys") { r.users.forEach { put(it, JsonArray(emptyList())) } }
                }))
                is Request.KeysClaim -> Triple(r.requestId, RequestType.KEYS_CLAIM, tx("POST", "/_matrix/client/v3/keys/claim", buildJsonObject {
                    put("timeout", 10000)
                    putJsonObject("one_time_keys") { r.oneTimeKeys.forEach { (u, devs) -> putJsonObject(u) { devs.forEach { (d, alg) -> put(d, alg) } } } }
                }))
                is Request.ToDevice -> Triple(r.requestId, RequestType.TO_DEVICE, tx("PUT", "/_matrix/client/v3/sendToDevice/${enc(r.eventType)}/${enc(r.requestId)}", parsed(r.body)))
                is Request.SignatureUpload -> Triple(r.requestId, RequestType.SIGNATURE_UPLOAD, tx("POST", "/_matrix/client/v3/keys/signatures/upload", parsed(r.body)))
                is Request.KeysBackup -> Triple(r.requestId, RequestType.KEYS_BACKUP, tx("PUT", "/_matrix/client/v3/room_keys/keys?version=${enc(r.version)}", buildJsonObject { put("rooms", parsed(r.rooms)) }))
                is Request.RoomMessage -> Triple(r.requestId, RequestType.ROOM_MESSAGE, tx("PUT", "/_matrix/client/v3/rooms/${enc(r.roomId)}/send/${enc(r.eventType)}/${enc(r.requestId)}", parsed(r.content)))
            }
        } catch (_: Exception) { return /* the library will offer the request again */ }
        runCatching { withContext(Dispatchers.IO) { machine.markRequestAsSent(id, type, response.toString()) } }
    }

    // ---- Sync ---------------------------------------------------------------------------------------------------------

    /** Hands the encryption parts of a /sync response to the library. Call before decrypting that response's events. */
    suspend fun receiveSync(sync: JsonObject) {
        val toDevice = (sync["to_device"] as? JsonObject)?.get("events") ?: JsonArray(emptyList())
        val lists = (sync["device_lists"] as? JsonObject)
        fun strings(e: JsonElement?) = (e as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull } ?: emptyList()
        val counts = (sync["device_one_time_keys_count"] as? JsonObject)?.mapValues { (it.value as? JsonPrimitive)?.intOrNull ?: 0 } ?: emptyMap()
        val fallback = strings(sync["device_unused_fallback_key_types"] ?: sync["org.matrix.msc2732.device_unused_fallback_key_types"]).takeIf { sync.containsKey("device_unused_fallback_key_types") || sync.containsKey("org.matrix.msc2732.device_unused_fallback_key_types") }
        val changes = withContext(Dispatchers.IO) {
            machine.receiveSyncChanges(toDevice.toString(), DeviceLists(strings(lists?.get("changed")), strings(lists?.get("left"))), counts, fallback, (sync["next_batch"] as? JsonPrimitive)?.contentOrNull ?: "", trust)
        }
        pump()
        val rooms = changes.roomKeyInfos.map { it.roomId }.distinct()
        if (rooms.isNotEmpty()) onKeys?.invoke(rooms)
    }

    // ---- Reading ------------------------------------------------------------------------------------------------------

    /** Decrypts one m.room.encrypted event. Returns the readable event, or null if we do not have the key (yet). */
    suspend fun decrypt(roomId: String, event: JsonObject): JsonObject? {
        if ((event["type"] as? JsonPrimitive)?.contentOrNull != "m.room.encrypted") return event
        return try {
            val clear = withContext(Dispatchers.IO) { machine.decryptRoomEvent(event.toString(), roomId, false, false, trust) }
            val c = kotlinx.serialization.json.Json.parseToJsonElement(clear.clearEvent).jsonObject
            // Keep the envelope (id, sender, time, relations) and take what was hidden: the real type and content.
            JsonObject(event + mapOf("type" to (c["type"] ?: JsonPrimitive("m.room.message")), "content" to (c["content"] ?: JsonObject(emptyMap())), "pagerEncrypted" to JsonPrimitive(true)))
        } catch (_: Exception) { null }
    }

    // ---- Writing ------------------------------------------------------------------------------------------------------

    /** Encrypts an event for a room. [members] is everyone in the room, so their devices all get the key. */
    suspend fun encrypt(roomId: String, type: String, content: JsonObject, members: List<String>): JsonObject {
        withContext(Dispatchers.IO) { machine.updateTrackedUsers(members) }
        pump() // learn their devices
        withContext(Dispatchers.IO) { machine.getMissingSessions(members) }?.let { send(it) }
        val settings = EncryptionSettings(EventEncryptionAlgorithm.MEGOLM_V1_AES_SHA2, 604_800_000uL, 100uL, HistoryVisibility.SHARED, false, false) // the bridges' devices are not cross-signed, and they are the ones we write to
        withContext(Dispatchers.IO) { machine.shareRoomKey(roomId, members, settings) }.forEach { send(it) }
        val encrypted = withContext(Dispatchers.IO) { machine.encrypt(roomId, type, content.toString()) }
        return kotlinx.serialization.json.Json.parseToJsonElement(encrypted).jsonObject
    }

    // ---- Recovery key (online key backup) -------------------------------------------------------------------------
    // Your message keys are copied, themselves encrypted, to your server. Only the recovery key can open that copy, so a new device
    // (or a reinstall) with the recovery key gets its history back, and the server learns nothing.

    suspend fun backupVersion(): Pair<String, String>? = try {
        val v = tx("GET", "/_matrix/client/v3/room_keys/version", null)
        val version = (v["version"] as? JsonPrimitive)?.contentOrNull
        val pub = ((v["auth_data"] as? JsonObject)?.get("public_key") as? JsonPrimitive)?.contentOrNull
        if (version != null && pub != null) version to pub else null
    } catch (_: Exception) { null }

    suspend fun backupOn(): Boolean = withContext(Dispatchers.IO) { machine.backupEnabled() }

    fun fingerprint(): String = machine.identityKeys()["ed25519"].orEmpty()

    /** Starts a new backup and returns the recovery key to show the person once. */
    suspend fun createBackup(): String {
        val key = withContext(Dispatchers.IO) { BackupRecoveryKey() }
        val pub = key.megolmV1PublicKey()
        val authData = buildJsonObject { put("public_key", pub.publicKey) }
        val signatures = withContext(Dispatchers.IO) { machine.sign(canonicalJson(authData)) }
        val created = tx("POST", "/_matrix/client/v3/room_keys/version", buildJsonObject {
            put("algorithm", "m.megolm_backup.v1.curve25519-aes-sha2")
            putJsonObject("auth_data") { put("public_key", pub.publicKey); putJsonObject("signatures") { signatures.forEach { (u, m) -> putJsonObject(u) { m.forEach { (id, s) -> put(id, s) } } } } }
        })
        val version = (created["version"] as? JsonPrimitive)?.contentOrNull ?: throw java.io.IOException("The server did not start a backup")
        // A new backup starts empty: turn the old one off so every key this device has is saved again under the new key.
        withContext(Dispatchers.IO) { machine.disableBackup(); machine.saveRecoveryKey(key, version); machine.enableBackupV1(pub, version) }
        pump()
        return spaced(key.toBase58())
    }

    /** Reads the backup with a recovery key, imports every key into this device, and keeps saving to that backup. Returns how many keys came back. */
    suspend fun restoreBackup(recoveryKey: String, onProgress: (Int, Int) -> Unit = { _, _ -> }): Int {
        val key = try { withContext(Dispatchers.IO) { BackupRecoveryKey.fromBase58(recoveryKey.filterNot { it.isWhitespace() }) } } catch (_: Exception) { throw java.io.IOException("That recovery key has a typo or is incomplete") }
        val (version, serverPublic) = backupVersion() ?: throw java.io.IOException("There is no backup to restore from")
        val pub = key.megolmV1PublicKey()
        if (pub.publicKey != serverPublic) throw java.io.IOException("That recovery key doesn't match this account's backup")
        val data = tx("GET", "/_matrix/client/v3/room_keys/keys?version=${enc(version)}", null)
        var total = 0
        val rooms = buildJsonObject {
            (data["rooms"] as? JsonObject)?.forEach { (roomId, room) ->
                val sessions = ((room as? JsonObject)?.get("sessions") as? JsonObject) ?: return@forEach
                val out = buildJsonObject {
                    sessions.forEach { (sessionId, s) ->
                        val sd = ((s as? JsonObject)?.get("session_data") as? JsonObject) ?: return@forEach
                        val eph = (sd["ephemeral"] as? JsonPrimitive)?.contentOrNull; val mac = (sd["mac"] as? JsonPrimitive)?.contentOrNull; val ct = (sd["ciphertext"] as? JsonPrimitive)?.contentOrNull
                        if (eph == null || mac == null || ct == null) return@forEach
                        val clear = runCatching { key.decryptV1(eph, mac, ct) }.getOrNull() ?: return@forEach
                        put(sessionId, kotlinx.serialization.json.Json.parseToJsonElement(clear)); total++
                    }
                }
                if (out.isNotEmpty()) put(roomId, out)
            }
        }
        val listener = object : ProgressListener { override fun onProgress(progress: Int, total: Int) = onProgress(progress, total) }
        val result = withContext(Dispatchers.IO) { machine.importRoomKeysFromBackup(rooms.toString(), version, listener) }
        withContext(Dispatchers.IO) { machine.saveRecoveryKey(key, version); machine.enableBackupV1(pub, version) }
        pump()
        val rooms2 = result.keys.keys.toList()
        if (rooms2.isNotEmpty()) onKeys?.invoke(rooms2)
        return total
    }

    /** True when every bridge bot among [bots] has encryption keys on the server, so it can read and write encrypted messages. */
    suspend fun botsCanEncrypt(bots: List<String>): Boolean {
        if (bots.isEmpty()) return true
        val r = tx("POST", "/_matrix/client/v3/keys/query", buildJsonObject { put("timeout", 10000); putJsonObject("device_keys") { bots.forEach { put(it, JsonArray(emptyList())) } } })
        val keys = r["device_keys"] as? JsonObject
        return bots.all { ((keys?.get(it) as? JsonObject)?.size ?: 0) > 0 }
    }

    // ---- Key file (a second way back in) ------------------------------------------------------------------------
    // Every message key this device has, scrambled with a passphrase you choose, as text you can store anywhere. If the recovery key is
    // ever lost, this file and its passphrase read your history; and it works without the server.

    suspend fun exportKeys(passphrase: String): String = withContext(Dispatchers.IO) { machine.exportRoomKeys(passphrase, 200_000) }

    /** Reads a key file made by exportKeys (or by Element). Returns how many keys were new to this device. */
    suspend fun importKeys(text: String, passphrase: String): Int {
        val listener = object : ProgressListener { override fun onProgress(progress: Int, total: Int) {} }
        val result = try { withContext(Dispatchers.IO) { machine.importRoomKeys(text.trim(), passphrase, listener) } }
        catch (_: Exception) { throw java.io.IOException("That passphrase doesn't open this file, or the file is damaged") }
        pump() // new keys also go into the backup
        val rooms = result.keys.keys.toList()
        if (rooms.isNotEmpty()) onKeys?.invoke(rooms)
        return result.imported.toInt()
    }

    private fun spaced(s: String) = if (s.contains(' ')) s else s.chunked(4).joinToString(" ")

    fun close() { closed = true; runCatching { machine.close() } }
}
