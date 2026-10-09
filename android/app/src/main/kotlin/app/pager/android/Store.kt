package app.pager.android

import kotlinx.serialization.json.longOrNull
import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.builtins.nullable
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import java.io.File
import java.util.UUID

data class Session(val baseUrl: String, val token: String, val userId: String)

@Serializable
private data class Cache(val userId: String, val since: String?, val chats: Map<String, ChatState>)

@Serializable
data class Star(val roomId: String, val eventId: String, val chat: String, val sender: String, val text: String, val ts: Long)

@Serializable
data class Scheduled(val delayId: String, val roomId: String, val chat: String, val text: String, val whenMs: Long)

/** Process-wide state: the signed-in session, all chats, and the sync loop that keeps them current. */
class Store(private val context: Context) {
    init { Names.init(context) }
    private val prefs = context.getSharedPreferences("pager", Context.MODE_PRIVATE)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val http = Http(prefs.getString("baseUrl", "") ?: "")
    val pager = PagerApi(http)
    private val _isAdmin = MutableStateFlow(false)
    /** This account is an administrator of the server. */
    val isAdmin: StateFlow<Boolean> = _isAdmin.asStateFlow()
    val matrix = MatrixApi(http)
    val media = MediaLoader(context, http)
    val audio = AudioController(media)
    val settings = SettingsStore(context).also { s -> s.onLocalChange = { pushSettingsRef?.invoke() } }
    private var pushSettingsRef: (() -> Unit)? = null
    val reminders = Reminders(context)
    private val cacheFile = File(context.filesDir, "chats.json")
    private val cacheSerializer = Cache.serializer()

    private val _session = MutableStateFlow<Session?>(null)
    val session: StateFlow<Session?> = _session.asStateFlow()
    private val _chats = MutableStateFlow<Map<String, ChatState>>(emptyMap())
    val chats: StateFlow<Map<String, ChatState>> = _chats.asStateFlow()
    private val _synced = MutableStateFlow(false)
    val synced: StateFlow<Boolean> = _synced.asStateFlow()
    private val _muted = MutableStateFlow<Set<String>>(emptySet())
    val muted: StateFlow<Set<String>> = _muted.asStateFlow()
    private val _incoming = MutableSharedFlow<Incoming>(extraBufferCapacity = 64)
    val incoming: SharedFlow<Incoming> = _incoming

    // Small things kept on the device.
    private val _drafts = MutableStateFlow(readJson("drafts", MapSerializer(String.serializer(), String.serializer()), emptyMap()))
    val drafts: StateFlow<Map<String, String>> = _drafts.asStateFlow()
    private val _stars = MutableStateFlow(readJson("stars", ListSerializer(Star.serializer()), emptyList()))
    val stars: StateFlow<List<Star>> = _stars.asStateFlow()
    private val _scheduled = MutableStateFlow(readJson("scheduled", ListSerializer(Scheduled.serializer()), emptyList()))
    val scheduled: StateFlow<List<Scheduled>> = _scheduled.asStateFlow()
    private val _favoriteGifs = MutableStateFlow(readJson("favoriteGifs", kotlinx.serialization.builtins.ListSerializer(Gif.serializer()), emptyList()))
    /** GIFs you starred, saved in your account so every device has them. */
    val favoriteGifs: StateFlow<List<Gif>> = _favoriteGifs.asStateFlow()
    private val _userStickers = MutableStateFlow(readJson("userStickers", StickerPack.serializer().nullable, null))
    val userStickers: StateFlow<StickerPack?> = _userStickers.asStateFlow()
    val gifs = GifClient(http.client)
    private val muteUntil = MutableStateFlow(readJson("muteUntil", MapSerializer(String.serializer(), Long.serializer()), emptyMap()))
    private val _bridges = MutableStateFlow<List<Network>>(emptyList())
    val bridges: StateFlow<List<Network>> = _bridges.asStateFlow()

    @Volatile var appInForeground = false
    /** The page you are looking at: sending and receiving make a little sound there (and only there). */
    @Volatile var openRoom: String? = null
    private var syncJob: Job? = null
    private var since: String? = null
    private val loadingOlder = HashSet<String>()
    private val previews = HashMap<String, LinkPreview?>()
    private var lastTyping = 0L

    private fun <T> readJson(key: String, ser: kotlinx.serialization.KSerializer<T>, default: T): T =
        runCatching { json.decodeFromString(ser, prefs.getString("local.$key", null) ?: return default) }.getOrDefault(default)

    private fun <T> writeJson(key: String, ser: kotlinx.serialization.KSerializer<T>, value: T) {
        prefs.edit().putString("local.$key", json.encodeToString(ser, value)).apply()
    }

    /** The inbox list, computed off the main thread whenever chats or settings change. */
    private data class InboxInputs(val chats: Map<String, ChatState>, val muted: Set<String>, val s: Session?, val drafts: Map<String, String>, val st: AppSettings)
    val inbox: StateFlow<List<ChatSummary>> = combine(combine(_chats, _muted, _session, _drafts, settings.state) { a, b, c, d, e -> InboxInputs(a, b, c, d, e) }, Names.version) { (chats, muted, s, drafts, st), _ ->
        val me = s?.userId ?: ""
        chats.values.filter { !it.isBotRoom(me) && it.network !in st.hiddenNetworks }.map {
            val last = it.messages.lastOrNull()
            ChatSummary(
                it.id, SyncReducer.displayName(it, me), it.network, it.avatarMxc, it.preview, it.lastTs, it.unread,
                it.markedUnread, it.pinned, it.archived, it.id in muted, it.isGroup, drafts[it.id]?.takeIf { d -> d.isNotBlank() },
                lowPriority = it.lowPriority, labels = it.labels, pinOrder = it.pinOrder ?: Double.MAX_VALUE,
                unanswered = last != null && last.sender != me, lastFromMe = last?.sender == me, typing = it.typing.isNotEmpty(), stories = it.isStories,
            )
        }.sortedWith(
            compareByDescending<ChatSummary> { it.pinned }.thenBy { if (it.pinned) it.pinOrder else 0.0 }
                .thenByDescending { st.sortUnreadFirst && (it.unread > 0 || it.markedUnread) }.thenByDescending { it.ts },
        )
    }.flowOn(Dispatchers.Default).stateIn(scope, SharingStarted.Eagerly, emptyList())

    /** Every label (custom folder) that any chat carries. */
    val labels: StateFlow<List<String>> = _chats.map { all -> all.values.flatMap { it.labels }.distinct().sorted() }
        .distinctUntilChanged().flowOn(Dispatchers.Default).stateIn(scope, SharingStarted.Eagerly, emptyList())

    fun chat(roomId: String): Flow<ChatState?> = _chats.map { it[roomId] }.distinctUntilChanged()
    fun chatNow(roomId: String): ChatState? = _chats.value[roomId]
    val me get() = _session.value?.userId ?: ""

    init {
        val base = prefs.getString("baseUrl", null)
        val token = prefs.getString("token", null)
        val user = prefs.getString("userId", null)
        if (base != null && token != null && user != null) begin(Session(base, token, user))
        scope.launch { persistLoop() }
        scope.launch { bridgeLoop() }
    }

    val savedServer get() = prefs.getString("baseUrl", "") ?: ""

    fun normalizeServer(input: String): String {
        val t = input.trim().trimEnd('/')
        return if (t.startsWith("http://") || t.startsWith("https://")) t else "https://$t"
    }

    suspend fun signIn(server: String, username: String, password: String) {
        http.baseUrl = normalizeServer(server)
        http.token = null
        val (token, userId, _) = matrix.login(username, password)
        prefs.edit().putString("baseUrl", http.baseUrl).putString("token", token).putString("userId", userId).apply()
        begin(Session(http.baseUrl, token, userId))
    }

    private fun begin(s: Session) {
        http.baseUrl = s.baseUrl
        http.token = s.token
        restoreIdentity()
        loadCache(s.userId)
        _session.value = s
        syncJob?.cancel()
        syncJob = scope.launch { kotlinx.coroutines.withTimeoutOrNull(8_000) { startE2ee(s) }; syncLoop(s) } // messages wait a moment for encryption, never for long
        scope.launch { refreshBridges() }
        scope.launch { runCatching { pager.isAdmin() }.onSuccess { _isAdmin.value = it } }
    }

    // --- Settings that follow your account ---------------------------------------------
    /** Settings belong to one device, found by its name: two phones never share them. */
    private val settingsType: String = "app.pager.settings.android." +
        (android.os.Build.MANUFACTURER + "-" + android.os.Build.MODEL).lowercase().replace(Regex("[^a-z0-9]+"), "-").trim('-').take(40).ifEmpty { "device" }
    private var settingsPush: Job? = null
    private var settingsChecked = false

    init { pushSettingsRef = { pushSettings() } }

    private fun pushSettings() {
        val me = _session.value?.userId ?: return
        settingsPush?.cancel()
        settingsPush = scope.launch {
            kotlinx.coroutines.delay(1500)
            runCatching { matrix.putAccountData(me, settingsType, settings.payload()) }
        }
    }

    /** Runs on every sync: takes newer settings from the account, or uploads ours if the account has none or older ones. */
    private fun handleSettingsSync(remote: JsonObject?, userId: String) {
        val first = !settingsChecked
        settingsChecked = true
        if (remote != null) {
            val applied = settings.applyRemote(remote)
            val remoteAt = (remote["updatedAt"] as? kotlinx.serialization.json.JsonPrimitive)?.longOrNull ?: 0L
            if (!applied && first && settings.updatedAt > remoteAt) pushSettings()
        } else if (first && settings.updatedAt > 0) pushSettings()
    }

    // --- Cache -------------------------------------------------------------------

    private fun loadCache(userId: String) {
        runCatching {
            // Bump when the way messages are read changes (e.g. pictures that arrive as edits), so old saved chats are read again.
            if (prefs.getInt("cacheV", 0) != 3) { cacheFile.delete(); prefs.edit().putInt("cacheV", 3).apply(); return }
            if (!cacheFile.exists()) return
            val c = json.decodeFromString(cacheSerializer, cacheFile.readText())
            if (c.userId != userId) return
            // Caches from before room types were tracked can't tell DMs from groups: resync from scratch.
            if (c.chats.values.any { it.network != "matrix" && it.roomType == null }) { cacheFile.delete(); return }
            c.chats.values.forEach { ch -> ch.messages.forEach { m -> m.enc?.let(MediaCrypt::register) } } // after a restart, saved pictures still need their keys
            _chats.value = c.chats
            since = c.since
            _synced.value = true
        }.onFailure { cacheFile.delete() }
    }

    @OptIn(FlowPreview::class)
    private suspend fun persistLoop() {
        _chats.debounce(3000).collect { chats ->
            val me = _session.value?.userId ?: return@collect
            withContext(Dispatchers.IO) {
                runCatching {
                    // Keep the file small: recent messages only, nothing still in flight.
                    val trimmed = chats.mapValues { (_, c) ->
                        val sent = c.messages.filter { it.status == STATUS_SENT }
                        if (sent.size <= 120) c.copy(messages = sent) else c.copy(messages = sent.takeLast(60), prevBatch = null)
                    }
                    cacheFile.writeText(json.encodeToString(cacheSerializer, Cache(me, since, trimmed)))
                }
            }
        }
    }

    // --- End-to-end encryption -----------------------------------------------------

    /** [error] says why encryption could not start, if it could not. */
    data class EncryptionStatus(val ready: Boolean = false, val backupHere: Boolean = false, val backupOnServer: Boolean = false, val deviceId: String = "", val fingerprint: String = "", val error: String? = null)
    private var startError: String? = null
    private val _encryption = MutableStateFlow(EncryptionStatus())
    val encryption: StateFlow<EncryptionStatus> = _encryption.asStateFlow()
    private var e2ee: E2ee? = null
    private var retryJob: Job? = null
    /** Messages we could not read yet (their key has not arrived), by event id. */
    private val waiting = java.util.concurrent.ConcurrentHashMap<String, Pair<String, JsonObject>>()
    private val memberCache = java.util.concurrent.ConcurrentHashMap<String, Pair<Long, List<String>>>()

    private suspend fun startE2ee(s: Session) {
        e2ee?.close(); e2ee = null; waiting.clear(); startError = null
        try {
            val device = prefs.getString("deviceId", null)?.takeIf { it.isNotEmpty() }
                ?: (http.request("GET", "/_matrix/client/v3/account/whoami")["device_id"] as? JsonPrimitive)?.contentOrNull?.also { prefs.edit().putString("deviceId", it).apply() }
                ?: throw java.io.IOException("the server did not say which device this is. Sign out and in again")
            val c = E2ee.create(context, { m, p, b -> http.request(m, p, b) }, s.userId, device)
            c.onKeys = { rooms -> scope.launch { retryWaiting(rooms) } }
            e2ee = c
            kotlinx.coroutines.withTimeoutOrNull(15_000) { c.pump() } // upload this device's keys (it keeps trying in the background if slow)
            scope.launch { retryWaiting() } // messages saved while waiting for a key may have their key now
            retryJob?.cancel()
            retryJob = scope.launch { while (isActive) { delay(45_000); retryWaiting() } } // and keys can turn up later, from the backup
        } catch (e: Throwable) { startError = e.message ?: e.toString(); android.util.Log.w("Pager", "encryption could not start", e) }
        refreshEncryptionStatus()
    }

    /** Tries again (from the settings screen) after a failed start. */
    suspend fun retryEncryptionStart() { _session.value?.let { startE2ee(it) } }

    suspend fun refreshEncryptionStatus() {
        val e = e2ee ?: run { _encryption.value = EncryptionStatus(error = startError); return }
        _encryption.value = EncryptionStatus(true, e.backupOn(), e.backupVersion() != null, e.deviceId, e.fingerprint())
    }

    /** Starts the recovery backup and returns the recovery key to show once. */
    suspend fun createRecoveryKey(): String {
        val e = e2ee ?: throw java.io.IOException("Encryption is not ready yet")
        return e.createBackup().also { refreshEncryptionStatus() }
    }

    /** Reads the backup with a recovery key; returns how many message keys were restored. */
    suspend fun restoreWithRecoveryKey(key: String): Int {
        val e = e2ee ?: throw java.io.IOException("Encryption is not ready yet")
        return e.restoreBackup(key).also { refreshEncryptionStatus(); retryWaiting() }
    }

    /**
     * Turns on end-to-end encryption for a page. From then on its messages are encrypted. Older messages stay as they were on the server,
     * and encryption can't be turned off again. Refuses when the page's app (bridge) can't read encrypted messages, which would break the page.
     */
    suspend fun enableEncryption(roomId: String) {
        val e = e2ee ?: throw java.io.IOException("Encryption is not ready yet. Try again in a moment.")
        if (_chats.value[roomId]?.encrypted == true) return
        val bots = matrix.joinedMembers(roomId).keys.filter { Regex("^@[a-z]*bot:").containsMatchIn(it) }
        if (!e.botsCanEncrypt(bots)) throw java.io.IOException("This page's app isn't set up for encryption on your server yet (the server admin turns it on)")
        try {
            matrix.setState(roomId, "m.room.encryption", buildJsonObject { put("algorithm", "m.megolm.v1.aes-sha2"); put("rotation_period_ms", 604_800_000L); put("rotation_period_msgs", 100) })
        } catch (x: ApiException) { throw java.io.IOException(if (x.status == 403) "Your account isn't allowed to change this page's settings" else (x.message ?: "Couldn't turn on encryption")) }
        update(roomId) { it.copy(encrypted = true) }
    }

    /** Turns encryption on for every page that can take it. Returns how many were turned on and the pages that could not (name to reason). */
    suspend fun enableEncryptionForAll(onProgress: (Int, Int) -> Unit = { _, _ -> }): Pair<Int, List<Pair<String, String>>> {
        val me = _session.value?.userId ?: return 0 to emptyList()
        val todo = _chats.value.values.filter { !it.encrypted && !it.isBotRoom(me) && !it.isStories }
        var done = 0; val failed = mutableListOf<Pair<String, String>>()
        todo.forEachIndexed { i, c ->
            try { enableEncryption(c.id); done++ } catch (x: Exception) { failed.add(SyncReducer.displayName(c, me) to (x.message ?: "Failed")) }
            onProgress(i + 1, todo.size)
        }
        return done to failed
    }

    /** Every message key on this device, scrambled with a passphrase, as text for a file. */
    suspend fun exportKeyFile(passphrase: String): String = (e2ee ?: throw java.io.IOException("Encryption is not ready yet")).exportKeys(passphrase)

    /** Reads a key file; returns how many keys were new here. */
    suspend fun importKeyFile(text: String, passphrase: String): Int = (e2ee ?: throw java.io.IOException("Encryption is not ready yet")).importKeys(text, passphrase).also { retryWaiting() }

    private fun unreadable(e: JsonObject) = JsonObject(e + mapOf(
        "type" to JsonPrimitive("m.room.message"),
        "content" to buildJsonObject { put("msgtype", "m.text"); put("body", "\uD83D\uDD12 Waiting for the key to read this message…"); put("pagerWaiting", true); put("pagerRaw", e) },
    ))

    /** Replaces m.room.encrypted events with what they say. Unreadable ones become a placeholder and are tried again when keys arrive. */
    private suspend fun decryptEvents(roomId: String, events: List<JsonObject>): List<JsonObject> {
        val e = e2ee ?: return events
        if (events.none { (it["type"] as? JsonPrimitive)?.contentOrNull == "m.room.encrypted" }) return events
        return events.map { ev ->
            if ((ev["type"] as? JsonPrimitive)?.contentOrNull != "m.room.encrypted") ev
            else e.decrypt(roomId, ev) ?: unreadable(ev).also { scope.launch { delay(4_000); retryWaiting(listOf(roomId)) } }
        }
    }

    private suspend fun decryptSync(res: JsonObject): JsonObject {
        val e = e2ee ?: return res
        e.receiveSync(res)
        val rooms = res["rooms"] as? JsonObject ?: return res
        val join = rooms["join"] as? JsonObject ?: return res
        val newJoin = JsonObject(join.mapValues { (roomId, room) ->
            val r = room as? JsonObject ?: return@mapValues room
            val tl = r["timeline"] as? JsonObject ?: return@mapValues room
            val events = (tl["events"] as? JsonArray)?.mapNotNull { it as? JsonObject } ?: return@mapValues room
            JsonObject(r + ("timeline" to JsonObject(tl + ("events" to JsonArray(decryptEvents(roomId, events))))))
        })
        return JsonObject(res + ("rooms" to JsonObject(rooms + ("join" to newJoin))))
    }

    /** Opens messages that were waiting for a key, in the pages whose keys just arrived (or everywhere with no list). They are kept on the message itself, so this also works after a restart. */
    private val askedBackup = java.util.concurrent.ConcurrentHashMap<String, Long>()
    private suspend fun retryWaiting(rooms: List<String>? = null) {
        val e = e2ee ?: return
        for ((roomId, chat) in _chats.value.entries.toList()) {
            if (rooms != null && roomId !in rooms) continue
            for (m in chat.messages.filter { it.sealed != null }) {
                val raw = runCatching { kotlinx.serialization.json.Json.parseToJsonElement(m.sealed!!) as? JsonObject }.getOrNull() ?: continue
                // The recovery backup may hold this message's key (another device of yours saved it there): ask, at most once a minute per key.
                val sid = ((raw["content"] as? JsonObject)?.get("session_id") as? JsonPrimitive)?.contentOrNull
                if (sid != null && System.currentTimeMillis() - (askedBackup[roomId + sid] ?: 0L) > 60_000L) { askedBackup[roomId + sid] = System.currentTimeMillis(); e.fetchKeyFromBackup(roomId, sid) }
                val clear = e.decrypt(roomId, raw) ?: continue
                update(roomId) { SyncReducer.replaceDecrypted(it, clear) }
            }
        }
    }

    private suspend fun roomMembers(roomId: String): List<String> {
        memberCache[roomId]?.takeIf { System.currentTimeMillis() - it.first < 5 * 60_000L }?.let { return it.second }
        val ids = matrix.joinedMembers(roomId).keys.toList()
        memberCache[roomId] = System.currentTimeMillis() to ids
        return ids
    }

    init {
        matrix.sendHook = { roomId, type, content ->
            if (_chats.value[roomId]?.encrypted != true) type to content
            else {
                val e = e2ee ?: throw java.io.IOException("Encryption is not ready yet. Try again in a moment.")
                val encrypted = e.encrypt(roomId, type, content, roomMembers(roomId))
                // Relations (edits, replies, reactions) stay visible outside the encryption so the server can group them.
                "m.room.encrypted" to (content["m.relates_to"]?.let { JsonObject(encrypted + ("m.relates_to" to it)) } ?: encrypted)
            }
        }
    }

    /** Uploads a file for a page: scrambled first when the page is encrypted. Returns the address and, if scrambled, the key material. */
    private suspend fun uploadFor(roomId: String, name: String, mime: String, size: Long, open: () -> java.io.InputStream): Pair<String, EncFile?> {
        if (_chats.value[roomId]?.encrypted != true) return http.upload(name, mime, size, open) to null
        // Scramble to a temporary file, so even a 30 MB file never sits in memory more than a little at a time.
        val tmp = File(context.cacheDir, "enc-upload-${System.nanoTime()}")
        try {
            val ef = withContext(Dispatchers.IO) { open().use { MediaCrypt.encryptToFile(it, tmp) } }
            val mxc = http.upload("encrypted", "application/octet-stream", tmp.length()) { tmp.inputStream() }
            return mxc to ef.copy(url = mxc)
        } finally { tmp.delete() }
    }

    private fun JsonObjectBuilder.putMedia(mxc: String, enc: EncFile?) {
        if (enc == null) { put("url", mxc); return }
        putJsonObject("file") {
            put("url", mxc)
            putJsonObject("key") { put("kty", "oct"); put("key_ops", JsonArray(listOf(JsonPrimitive("encrypt"), JsonPrimitive("decrypt")))); put("alg", "A256CTR"); put("k", enc.k); put("ext", true) }
            put("iv", enc.iv); putJsonObject("hashes") { put("sha256", enc.sha256) }; put("v", "v2")
        }
    }

    // --- Sync --------------------------------------------------------------------

    /** The last thing that went wrong while reading an update from the server, for the Encryption settings (cleared by the next good update). */
    private val _syncProblem = MutableStateFlow<String?>(null)
    val syncProblem: StateFlow<String?> = _syncProblem.asStateFlow()
    private fun noteSyncProblem(what: String, e: Throwable) {
        android.util.Log.w("Pager", "problem $what", e)
        _syncProblem.value = "$what: ${e::class.java.simpleName}: ${e.message ?: ""}".take(300)
    }

    private suspend fun syncLoop(s: Session) {
        var backoff = 1000L
        while (scope.isActive) {
            try {
                val raw = matrix.sync(since)
                // If reading the encrypted parts goes wrong, show the update with those messages still locked rather than never moving on.
                val res = try { decryptSync(raw) } catch (e: CancellationException) { throw e } catch (e: Throwable) { noteSyncProblem("decrypting", e); raw }
                val initial = since == null
                val r = try { SyncReducer.apply(_chats.value, res, s.userId, initial) } catch (e: CancellationException) { throw e } catch (e: Throwable) {
                    noteSyncProblem("reading messages", e)
                    if (res === raw) throw e
                    SyncReducer.apply(_chats.value, raw, s.userId, initial)
                }
                _chats.value = r.chats
                r.muted?.let { _muted.value = it }
                handleSettingsSync(r.accountData[settingsType], s.userId)
                for ((type, c) in r.accountData) if (type.startsWith("app.pager.contacts.")) {
                    val rows = ((c["rows"] as? JsonArray) ?: JsonArray(emptyList())).mapNotNull { row ->
                        val a = row as? JsonArray
                        val n = (a?.getOrNull(0) as? JsonPrimitive)?.takeIf { p -> p.isString }?.content; val nm = (a?.getOrNull(1) as? JsonPrimitive)?.takeIf { p -> p.isString }?.content
                        if (n != null && nm != null) n to nm else null
                    }
                    Names.add(rows, override = true, mine = true)
                    (c["chunks"] as? JsonPrimitive)?.content?.toIntOrNull()?.let { contactChunks = maxOf(contactChunks, it) }
                }
                r.accountData["app.pager.favorite_gifs"]?.let { c ->
                    runCatching { json.decodeFromJsonElement(kotlinx.serialization.builtins.ListSerializer(Gif.serializer()), c["gifs"] ?: JsonArray(emptyList())) }
                        .onSuccess { _favoriteGifs.value = it; writeJson("favoriteGifs", kotlinx.serialization.builtins.ListSerializer(Gif.serializer()), it) }
                }
                r.userStickers?.let { _userStickers.value = it; writeJson("userStickers", StickerPack.serializer().nullable, it) }
                r.invites.forEach { id -> scope.launch { runCatching { matrix.join(id) } } }
                val muted = _muted.value
                val st = settings.value
                // Beeper-style: muted and low-priority chats stay quiet except for @mentions and replies to you.
                val cal = java.util.Calendar.getInstance()
                val nowMin = cal.get(java.util.Calendar.HOUR_OF_DAY) * 60 + cal.get(java.util.Calendar.MINUTE)
                val day = cal.get(java.util.Calendar.DAY_OF_WEEK) - 1
                for (m in r.incoming) {
                    val c = r.chats[m.roomId]
                    // Inside that page you get a small sound instead of a notification.
                    if (st.convoSounds && appInForeground && m.roomId == openRoom) { ChatSounds.play(st.receiveSound, st.convoSoundVolume); continue }
                    val d = NotifyPolicy.decide(m, quiet = m.roomId in muted || c?.lowPriority == true, pinned = c?.pinned == true, nowMin = nowMin, day = day, s = st)
                    if (!d.show) continue
                    val out = m.copy(silent = d.silent, preview = d.preview)
                    if (st.notifDelaySec > 0) {
                        // Wait, and drop the alert if you read the chat somewhere else in the meantime.
                        scope.launch {
                            delay(st.notifDelaySec * 1000L)
                            val cc = _chats.value[m.roomId]
                            if (cc != null && (cc.unread > 0 || cc.markedUnread)) _incoming.tryEmit(out)
                        }
                    } else _incoming.tryEmit(out)
                }
                if (settings.value.unarchiveOnMessage) {
                    r.incoming.map { it.roomId }.distinct().filter { it !in muted && r.chats[it]?.archived == true }.forEach { setTag(it, "u.archived", false) }
                }
                expireMutes()
                since = (res["next_batch"] as? JsonPrimitive)?.content ?: since
                _synced.value = true
                backoff = 1000L
                if (res === raw) _syncProblem.value = null
            } catch (e: ApiException) {
                if (e.status == 401) { signOutLocal(); return }
                if (e.status == 400 && since != null) { since = null; _chats.value = emptyMap(); continue } // stale cache token
                delay(backoff); backoff = (backoff * 2).coerceAtMost(30_000)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                noteSyncProblem("updating", e)
                delay(backoff); backoff = (backoff * 2).coerceAtMost(30_000)
            }
        }
    }

    // --- Messaging ---------------------------------------------------------------

    private fun update(roomId: String, f: (ChatState) -> ChatState) {
        _chats.update { m -> m[roomId]?.let { m + (roomId to f(it)) } ?: m }
    }

    private fun addLocal(roomId: String, m: Msg) {
        val s = settings.value
        if (s.convoSounds && appInForeground && roomId == openRoom) ChatSounds.play(s.sendSound, s.convoSoundVolume)
        update(roomId) { it.copy(messages = it.messages + m) }
    }
    private fun setStatus(roomId: String, id: String, status: Int, newId: String? = null) = update(roomId) { c ->
        // If sync already delivered the real event it replaced the local echo, and this finds nothing.
        c.copy(messages = c.messages.map { if (it.id == id) it.copy(status = status, id = newId ?: it.id) else it })
    }

    private fun textContent(text: String, replyTo: String?, mentions: List<String>, html: String? = null) = buildJsonObject {
        put("msgtype", "m.text"); put("body", text)
        if (html != null) { put("format", "org.matrix.html"); put("formatted_body", html) }
        if (replyTo != null) putJsonObject("m.relates_to") { putJsonObject("m.in_reply_to") { put("event_id", replyTo) } }
        if (mentions.isNotEmpty()) putJsonObject("m.mentions") { put("user_ids", JsonArray(mentions.map { JsonPrimitive(it) })) }
    }

    fun send(roomId: String, text: String, replyTo: String? = null, mentions: List<String> = emptyList()) {
        val me = _session.value?.userId ?: return
        val txn = UUID.randomUUID().toString()
        val localId = "local-$txn"
        val html = if (settings.value.markdown) Format.markdownToHtml(text) else null
        addLocal(roomId, Msg(localId, me, System.currentTimeMillis(), "m.text", text, replyTo = replyTo, txn = txn, status = STATUS_SENDING, mentions = mentions, html = html))
        setDraft(roomId, "")
        scope.launch {
            runCatching { matrix.send(roomId, "m.room.message", txn, textContent(text, replyTo, mentions, html)) }
                .onSuccess { setStatus(roomId, localId, STATUS_SENT, it) }
                .onFailure { setStatus(roomId, localId, STATUS_FAILED) }
        }
    }

    fun retry(roomId: String, msg: Msg) {
        update(roomId) { c -> c.copy(messages = c.messages.filter { it.id != msg.id }) }
        send(roomId, msg.body, msg.replyTo, msg.mentions)
    }

    fun discard(roomId: String, msg: Msg) = update(roomId) { c -> c.copy(messages = c.messages.filter { it.id != msg.id }) }

    fun edit(roomId: String, eventId: String, newText: String) {
        update(roomId) { c -> c.copy(messages = c.messages.map { if (it.id == eventId) it.copy(body = newText, edited = true) else it }) }
        scope.launch {
            runCatching {
                matrix.send(roomId, "m.room.message", UUID.randomUUID().toString(), buildJsonObject {
                    put("msgtype", "m.text"); put("body", "* $newText")
                    putJsonObject("m.new_content") { put("msgtype", "m.text"); put("body", newText) }
                    putJsonObject("m.relates_to") { put("rel_type", "m.replace"); put("event_id", eventId) }
                })
            }
        }
    }

    fun delete(roomId: String, eventId: String) {
        update(roomId) { c -> c.copy(messages = c.messages.filter { it.id != eventId }) }
        _stars.update { l -> l.filterNot { it.eventId == eventId } }.also { writeJson("stars", ListSerializer(Star.serializer()), _stars.value) }
        scope.launch { runCatching { matrix.redact(roomId, eventId, UUID.randomUUID().toString()) } }
    }

    /** Adds your reaction, or removes it if you already used that emoji. */
    fun react(roomId: String, eventId: String, key: String) {
        val me = _session.value?.userId ?: return
        val chat = _chats.value[roomId] ?: return
        rememberEmoji(key)
        val existing = chat.reactionRefs.entries.firstOrNull { it.value.target == eventId && it.value.key == key && it.value.sender == me }
        if (existing != null) {
            scope.launch { runCatching { matrix.redact(roomId, existing.key, UUID.randomUUID().toString()) } }
            update(roomId) { c ->
                c.copy(
                    reactionRefs = c.reactionRefs - existing.key,
                    reactions = c.reactions.mapValues { (t, byKey) -> if (t == eventId) byKey.mapValues { (k, v) -> if (k == key) v - me else v }.filterValues { it.isNotEmpty() } else byKey },
                )
            }
        } else {
            val localRef = "local-react-${UUID.randomUUID()}"
            update(roomId) { c ->
                val byKey = c.reactions[eventId].orEmpty()
                c.copy(reactions = c.reactions + (eventId to (byKey + (key to (byKey[key].orEmpty() + me)))), reactionRefs = c.reactionRefs + (localRef to ReactionRef(eventId, key, me)))
            }
            scope.launch {
                runCatching {
                    val id = matrix.send(roomId, "m.reaction", UUID.randomUUID().toString(), buildJsonObject {
                        putJsonObject("m.relates_to") { put("rel_type", "m.annotation"); put("event_id", eventId); put("key", key) }
                    })
                    update(roomId) { c -> c.copy(reactionRefs = c.reactionRefs - localRef + (id to ReactionRef(eventId, key, me))) }
                }
            }
        }
    }

    private fun rememberEmoji(e: String) = settings.update { copy(recentEmoji = (listOf(e) + recentEmoji.filter { it != e }).take(24)) }

    fun forward(msg: Msg, toRoom: String) {
        if (msg.enc != null && msg.mxc != null) { // an encrypted attachment: read it, and send it again as the destination page wants it (encrypted or not)
            scope.launch {
                val file = media.fetch(msg.mxc) ?: return@launch
                sendBytes(toRoom, withContext(Dispatchers.IO) { file.readBytes() }, msg.body, msg.mime ?: "application/octet-stream", msg.type, msg.w, msg.h)
            }
            return
        }
        val me = _session.value?.userId ?: return
        val txn = UUID.randomUUID().toString()
        val localId = "local-$txn"
        addLocal(toRoom, msg.copy(id = localId, sender = me, ts = System.currentTimeMillis(), txn = txn, status = STATUS_SENDING, replyTo = null, edited = false))
        scope.launch {
            runCatching {
                matrix.send(toRoom, "m.room.message", txn, buildJsonObject {
                    put("msgtype", msg.type); put("body", msg.body)
                    msg.mxc?.let { put("url", it) }
                    msg.geo?.let { put("geo_uri", it) }
                    if (msg.mime != null || msg.size != null || msg.w != null) putJsonObject("info") {
                        msg.mime?.let { put("mimetype", it) }; msg.size?.let { put("size", it) }; msg.w?.let { put("w", it) }; msg.h?.let { put("h", it) }
                    }
                })
            }.onSuccess { setStatus(toRoom, localId, STATUS_SENT, it) }.onFailure { setStatus(toRoom, localId, STATUS_FAILED) }
        }
    }

    // --- Typing, read state ------------------------------------------------------

    fun typing(roomId: String, on: Boolean) {
        if (!settings.value.sendTyping) return
        val now = System.currentTimeMillis()
        if (on && now - lastTyping < 4000) return
        lastTyping = if (on) now else 0L
        val me = _session.value?.userId ?: return
        scope.launch { runCatching { matrix.typing(me, roomId, on) } }
    }

    fun markRead(roomId: String) {
        val c = _chats.value[roomId] ?: return
        val last = c.messages.lastOrNull { it.status == STATUS_SENT } ?: return
        val me = _session.value?.userId ?: return
        if (c.unread == 0 && !c.markedUnread) return
        update(roomId) { it.copy(unread = 0, markedUnread = false) }
        Notifier.clear(context, roomId)
        val private = !settings.value.sendReadReceipts
        scope.launch {
            runCatching { matrix.markRead(roomId, last.id, private) }
            if (c.markedUnread) runCatching { matrix.setMarkedUnread(me, roomId, false) }
        }
    }

    fun markUnread(roomId: String, unread: Boolean) {
        val me = _session.value?.userId ?: return
        update(roomId) { it.copy(markedUnread = unread) }
        scope.launch { runCatching { matrix.setMarkedUnread(me, roomId, unread) } }
    }

    fun markAllRead() { _chats.value.values.filter { it.unread > 0 || it.markedUnread }.forEach { markRead(it.id) } }

    // --- Media -------------------------------------------------------------------

    fun describe(uri: Uri): Picked {
        val cr = context.contentResolver
        var name = "file"; var size = 0L
        cr.query(uri, null, null, null, null)?.use { c ->
            if (c.moveToFirst()) {
                c.getColumnIndex(OpenableColumns.DISPLAY_NAME).takeIf { it >= 0 }?.let { name = c.getString(it) ?: name }
                c.getColumnIndex(OpenableColumns.SIZE).takeIf { it >= 0 }?.let { size = c.getLong(it) }
            }
        }
        val mime = cr.getType(uri) ?: "application/octet-stream"
        var w: Int? = null; var h: Int? = null
        if (mime.startsWith("image/")) runCatching {
            val o = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
            cr.openInputStream(uri)?.use { android.graphics.BitmapFactory.decodeStream(it, null, o) }
            w = o.outWidth.takeIf { it > 0 }; h = o.outHeight.takeIf { it > 0 }
        }
        return Picked(uri, name, mime, size, w, h)
    }

    fun sendFile(roomId: String, uri: Uri) {
        val me = _session.value?.userId ?: return
        val p = describe(uri)
        // "High" quality shrinks big photos (2048px, JPEG) before upload; GIFs, WebP and other files are never touched.
        if (settings.value.imageQuality == "high" && (p.mime == "image/jpeg" || p.mime == "image/png")) {
            scope.launch {
                val shrunk = runCatching { shrink(uri) }.getOrNull()
                if (shrunk != null) sendBytes(roomId, shrunk.first, p.name.substringBeforeLast('.') + ".jpg", "image/jpeg", "m.image", shrunk.second, shrunk.third)
                else sendOriginal(roomId, uri, p)
            }
            return
        }
        sendOriginal(roomId, uri, p)
    }

    private fun shrink(uri: Uri): Triple<ByteArray, Int, Int> {
        val opts = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri)!!.use { android.graphics.BitmapFactory.decodeStream(it, null, opts) }
        var sample = 1
        while (opts.outWidth / (sample * 2) >= 2048 || opts.outHeight / (sample * 2) >= 2048) sample *= 2
        val bmp = context.contentResolver.openInputStream(uri)!!.use { android.graphics.BitmapFactory.decodeStream(it, null, android.graphics.BitmapFactory.Options().apply { inSampleSize = sample }) }!!
        val out = java.io.ByteArrayOutputStream()
        bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 85, out)
        return Triple(out.toByteArray(), bmp.width, bmp.height)
    }

    private fun sendOriginal(roomId: String, uri: Uri, p: Picked) {
        val me = _session.value?.userId ?: return
        val type = when { p.mime.startsWith("image/") -> "m.image"; p.mime.startsWith("video/") -> "m.video"; p.mime.startsWith("audio/") -> "m.audio"; else -> "m.file" }
        val txn = UUID.randomUUID().toString()
        val localId = "local-$txn"
        addLocal(roomId, Msg(localId, me, System.currentTimeMillis(), type, p.name, mxc = null, mime = p.mime, size = p.size, w = p.w, h = p.h, txn = txn, status = STATUS_SENDING))
        scope.launch {
            runCatching {
                val (mxc, enc) = uploadFor(roomId, p.name, p.mime, p.size) { context.contentResolver.openInputStream(uri)!! }
                matrix.send(roomId, "m.room.message", txn, buildJsonObject {
                    put("msgtype", type); put("body", p.name); putMedia(mxc, enc)
                    putJsonObject("info") {
                        put("mimetype", p.mime); put("size", p.size)
                        p.w?.let { put("w", it) }; p.h?.let { put("h", it) }
                    }
                })
            }.onSuccess { setStatus(roomId, localId, STATUS_SENT, it) }.onFailure { setStatus(roomId, localId, STATUS_FAILED) }
        }
    }

    fun sendVoice(roomId: String, file: File, durationMs: Long) {
        val me = _session.value?.userId ?: return
        val mime = if (file.extension == "ogg") "audio/ogg" else "audio/mp4"
        val txn = UUID.randomUUID().toString()
        val localId = "local-$txn"
        addLocal(roomId, Msg(localId, me, System.currentTimeMillis(), "m.audio", "Voice message", mime = mime, size = file.length(), durationMs = durationMs, voice = true, txn = txn, status = STATUS_SENDING))
        scope.launch {
            runCatching {
                val (mxc, enc) = uploadFor(roomId, "voice-message.${file.extension}", mime, file.length()) { file.inputStream() }
                matrix.send(roomId, "m.room.message", txn, buildJsonObject {
                    put("msgtype", "m.audio"); put("body", "Voice message"); putMedia(mxc, enc)
                    putJsonObject("info") { put("mimetype", mime); put("size", file.length()); put("duration", durationMs) }
                    putJsonObject("org.matrix.msc1767.audio") { put("duration", durationMs) }
                    putJsonObject("org.matrix.msc3245.voice") {}
                })
            }.onSuccess { setStatus(roomId, localId, STATUS_SENT, it) }.onFailure { setStatus(roomId, localId, STATUS_FAILED) }
            file.delete()
        }
    }

    fun sendLocation(roomId: String, lat: Double, lon: Double) {
        val me = _session.value?.userId ?: return
        val geo = "geo:%.6f,%.6f".format(java.util.Locale.US, lat, lon)
        val txn = UUID.randomUUID().toString()
        val localId = "local-$txn"
        addLocal(roomId, Msg(localId, me, System.currentTimeMillis(), "m.location", "Location", geo = geo, txn = txn, status = STATUS_SENDING))
        scope.launch {
            runCatching {
                matrix.send(roomId, "m.room.message", txn, buildJsonObject { put("msgtype", "m.location"); put("body", "Location"); put("geo_uri", geo) })
            }.onSuccess { setStatus(roomId, localId, STATUS_SENT, it) }.onFailure { setStatus(roomId, localId, STATUS_FAILED) }
        }
    }

    // --- Scheduled send ------------------------------------------------------------

    /** Returns null on success, or a user-facing reason it failed. */
    suspend fun schedule(roomId: String, text: String, delayMs: Long): String? = try {
        val id = matrix.sendDelayed(roomId, "m.room.message", UUID.randomUUID().toString(), textContent(text, null, emptyList()), delayMs)
        val chat = _chats.value[roomId]?.let { SyncReducer.displayName(it, me) } ?: "chat"
        _scheduled.update { it + Scheduled(id, roomId, chat, text, System.currentTimeMillis() + delayMs) }
        writeJson("scheduled", ListSerializer(Scheduled.serializer()), _scheduled.value)
        setDraft(roomId, "")
        null
    } catch (e: ApiException) {
        if (e.status == 400 || e.status == 404 || e.status == 405) "Your server doesn't support scheduled messages yet (it needs Synapse with delayed events enabled)." else e.message
    } catch (e: Exception) { "Couldn't schedule: ${e.message}" }

    fun cancelScheduled(s: Scheduled) {
        _scheduled.update { l -> l.filter { it.delayId != s.delayId } }
        writeJson("scheduled", ListSerializer(Scheduled.serializer()), _scheduled.value)
        scope.launch { runCatching { matrix.cancelDelayed(s.delayId) } }
    }

    fun pruneScheduled() {
        val now = System.currentTimeMillis()
        if (_scheduled.value.any { it.whenMs < now - 60_000 }) {
            _scheduled.update { l -> l.filter { it.whenMs >= now - 60_000 } }
            writeJson("scheduled", ListSerializer(Scheduled.serializer()), _scheduled.value)
        }
    }

    // --- Drafts, stars, reminders ------------------------------------------------

    fun setDraft(roomId: String, text: String) {
        _drafts.update { if (text.isBlank()) it - roomId else it + (roomId to text) }
        writeJson("drafts", MapSerializer(String.serializer(), String.serializer()), _drafts.value)
    }

    fun draftFor(roomId: String) = _drafts.value[roomId].orEmpty()

    fun toggleStar(roomId: String, msg: Msg) {
        val chat = _chats.value[roomId]
        _stars.update { l ->
            if (l.any { it.eventId == msg.id }) l.filterNot { it.eventId == msg.id }
            else l + Star(roomId, msg.id, chat?.let { SyncReducer.displayName(it, me) } ?: "", chat?.nameOf(msg.sender) ?: msg.sender, previewOf(msg), msg.ts)
        }
        writeJson("stars", ListSerializer(Star.serializer()), _stars.value)
    }

    fun remind(roomId: String, atMs: Long) {
        val name = _chats.value[roomId]?.let { SyncReducer.displayName(it, me) } ?: "a page"
        reminders.add(roomId, name, atMs)
    }

    // --- Search & link previews --------------------------------------------------

    suspend fun search(term: String, roomId: String? = null): List<SearchHit> = runCatching { matrix.search(term, roomId) }.getOrDefault(emptyList())

    /** Searches everything already on the device. [kind] narrows by media type: all, images, videos, links, files. */
    fun searchLocal(term: String, roomId: String?, kind: String): List<SearchHit> {
        val t = term.trim().lowercase()
        val url = Regex("https?://\\S+|www\\.\\S+")
        return _chats.value.values.filter { roomId == null || it.id == roomId }.flatMap { c ->
            c.messages.filter { m ->
                m.status == STATUS_SENT && when (kind) {
                    "images" -> m.type == "m.image" && !m.sticker
                    "videos" -> m.type == "m.video"
                    "files" -> m.type == "m.file"
                    "links" -> url.containsMatchIn(m.body)
                    else -> m.type != "m.poll" || true
                } && (t.isEmpty() || m.body.lowercase().contains(t))
            }.map { SearchHit(c.id, it.id, it.sender, previewOf(it).takeIf { _ -> it.type != "m.text" && it.type != "m.notice" } ?: it.body, it.ts) }
        }.sortedByDescending { it.ts }.take(200)
    }

    suspend fun preview(url: String): LinkPreview? {
        synchronized(previews) { if (previews.containsKey(url)) return previews[url] }
        val p = runCatching { matrix.previewUrl(url) }.getOrNull()
        synchronized(previews) { previews[url] = p }
        return p
    }

    // --- History & chat management -----------------------------------------------

    fun loadOlder(roomId: String) {
        val chat = _chats.value[roomId] ?: return
        if (chat.reachedStart) return
        // After a restart the saved token may be gone; paginate back from the last sync point instead.
        val token = chat.prevBatch ?: since ?: return
        if (!synchronized(loadingOlder) { loadingOlder.add(roomId) }) return
        scope.launch {
            try {
                val (rawEvents, end, state) = matrix.messages(roomId, token)
                val events = decryptEvents(roomId, rawEvents)
                update(roomId) { SyncReducer.applyHistory(it, events, end, state, me) }
            } catch (_: Exception) {
            } finally {
                synchronized(loadingOlder) { loadingOlder.remove(roomId) }
            }
        }
    }

    fun setTag(roomId: String, tag: String, on: Boolean, order: Double? = null) {
        val me = _session.value?.userId ?: return
        update(roomId) { c ->
            val t = if (on) c.tags + tag else c.tags - tag
            if (tag == "m.favourite") c.copy(tags = t, pinOrder = if (on) order ?: c.pinOrder else null) else c.copy(tags = t)
        }
        scope.launch { runCatching { matrix.setTag(me, roomId, tag, on, order) } }
    }

    private fun pinned() = _chats.value.values.filter { it.pinned }.sortedBy { it.pinOrder ?: Double.MAX_VALUE }

    /** Pins a chat at the end of the pin row, or unpins it. */
    fun pin(roomId: String, on: Boolean) {
        if (!on) { setTag(roomId, "m.favourite", false); return }
        val last = pinned().filter { it.id != roomId }.mapNotNull { it.pinOrder }.maxOrNull() ?: 0.0
        setTag(roomId, "m.favourite", true, last + 1.0)
    }

    /** Moves a pinned chat to [toIndex] within the pin row. */
    fun movePin(roomId: String, toIndex: Int) {
        val others = pinned().filter { it.id != roomId }
        val i = toIndex.coerceIn(0, others.size)
        val before = others.getOrNull(i - 1)?.pinOrder
        val after = others.getOrNull(i)?.pinOrder
        val order = when {
            before == null && after == null -> 1.0
            before == null -> after!! - 1.0
            after == null -> before + 1.0
            else -> (before + after) / 2
        }
        setTag(roomId, "m.favourite", true, order)
    }

    fun setLowPriority(roomId: String, on: Boolean) = setTag(roomId, "m.lowpriority", on)
    fun addLabel(roomId: String, name: String) = setTag(roomId, ChatState.LABEL_PREFIX + name.trim(), true)
    fun removeLabel(roomId: String, name: String) = setTag(roomId, ChatState.LABEL_PREFIX + name, false)
    fun renameLabel(old: String, new: String) {
        if (new.isBlank() || new == old) return
        _chats.value.values.filter { old in it.labels }.forEach { removeLabel(it.id, old); addLabel(it.id, new) }
    }
    fun deleteLabel(name: String) = _chats.value.values.filter { name in it.labels }.forEach { removeLabel(it.id, name) }

    /** Beeper-style snooze: tuck the chat into the archive and bring it back, unread, at [atMs]. */
    fun snooze(roomId: String, atMs: Long) {
        setTag(roomId, "u.archived", true)
        val name = _chats.value[roomId]?.let { SyncReducer.displayName(it, me) } ?: "a page"
        reminders.add(roomId, name, atMs, snooze = true)
    }

    // --- Polls, GIFs, stickers, contacts ---------------------------------------------

    fun sendPoll(roomId: String, question: String, answers: List<String>, maxSelections: Int, disclosed: Boolean) {
        val me = _session.value?.userId ?: return
        val txn = UUID.randomUUID().toString()
        val localId = "local-$txn"
        val pollAnswers = answers.mapIndexed { i, a -> PollAnswer("a${i + 1}", a) }
        addLocal(roomId, Msg(localId, me, System.currentTimeMillis(), "m.poll", question, txn = txn, status = STATUS_SENDING, poll = PollInfo(question, pollAnswers, maxSelections, disclosed)))
        scope.launch {
            runCatching {
                matrix.send(roomId, "org.matrix.msc3381.poll.start", txn, buildJsonObject {
                    putJsonObject("org.matrix.msc3381.poll.start") {
                        put("kind", if (disclosed) "org.matrix.msc3381.poll.disclosed" else "org.matrix.msc3381.poll.undisclosed")
                        put("max_selections", maxSelections)
                        putJsonObject("question") { put("org.matrix.msc1767.text", question); put("body", question); put("msgtype", "m.text") }
                        put("answers", JsonArray(pollAnswers.map { a -> buildJsonObject { put("id", a.id); put("org.matrix.msc1767.text", a.text) } }))
                    }
                    put("org.matrix.msc1767.text", question + "\n" + pollAnswers.mapIndexed { i, a -> "${i + 1}. ${a.text}" }.joinToString("\n"))
                })
            }.onSuccess { setStatus(roomId, localId, STATUS_SENT, it) }.onFailure { setStatus(roomId, localId, STATUS_FAILED) }
        }
    }

    fun votePoll(roomId: String, pollId: String, answerIds: List<String>) {
        val me = _session.value?.userId ?: return
        update(roomId) { c -> c.copy(pollVotes = c.pollVotes + (pollId to ((c.pollVotes[pollId] ?: emptyMap()) + (me to answerIds)))) }
        scope.launch {
            runCatching {
                matrix.send(roomId, "org.matrix.msc3381.poll.response", UUID.randomUUID().toString(), buildJsonObject {
                    putJsonObject("m.relates_to") { put("rel_type", "m.reference"); put("event_id", pollId) }
                    putJsonObject("org.matrix.msc3381.poll.response") { put("answers", JsonArray(answerIds.map { JsonPrimitive(it) })) }
                })
            }
        }
    }

    fun endPoll(roomId: String, pollId: String) {
        update(roomId) { it.copy(pollEnded = it.pollEnded + pollId) }
        scope.launch {
            runCatching {
                matrix.send(roomId, "org.matrix.msc3381.poll.end", UUID.randomUUID().toString(), buildJsonObject {
                    putJsonObject("m.relates_to") { put("rel_type", "m.reference"); put("event_id", pollId) }
                    put("org.matrix.msc1767.text", "The poll has ended.")
                })
            }
        }
    }

    private fun sendBytes(roomId: String, bytes: ByteArray, name: String, mime: String, type: String, w: Int? = null, h: Int? = null) {
        val me = _session.value?.userId ?: return
        val txn = UUID.randomUUID().toString()
        val localId = "local-$txn"
        addLocal(roomId, Msg(localId, me, System.currentTimeMillis(), type, name, mime = mime, size = bytes.size.toLong(), w = w, h = h, txn = txn, status = STATUS_SENDING))
        scope.launch {
            runCatching {
                val (mxc, enc) = uploadFor(roomId, name, mime, bytes.size.toLong()) { java.io.ByteArrayInputStream(bytes) }
                matrix.send(roomId, "m.room.message", txn, buildJsonObject {
                    put("msgtype", type); put("body", name); putMedia(mxc, enc)
                    putJsonObject("info") { put("mimetype", mime); put("size", bytes.size.toLong()); w?.let { put("w", it) }; h?.let { put("h", it) } }
                })
            }.onSuccess { setStatus(roomId, localId, STATUS_SENT, it) }.onFailure { setStatus(roomId, localId, STATUS_FAILED) }
        }
    }

    fun sendGif(roomId: String, gif: Gif) {
        scope.launch {
            runCatching { gifs.download(gif.url) }.onSuccess { sendBytes(roomId, it, "${gif.title.ifBlank { "gif" }.take(40)}.gif", "image/gif", "m.image", gif.w.takeIf { w -> w > 0 }, gif.h.takeIf { h -> h > 0 }) }
        }
    }

    fun sendContact(roomId: String, name: String, phone: String) {
        val vcard = "BEGIN:VCARD\nVERSION:3.0\nFN:$name\nTEL;TYPE=CELL:$phone\nEND:VCARD\n"
        sendBytes(roomId, vcard.toByteArray(), "${name.replace(Regex("[^A-Za-z0-9 ._-]"), "")}.vcf", "text/vcard", "m.file")
    }

    fun stickerPacks(roomId: String?): List<StickerPack> =
        listOfNotNull(_userStickers.value?.takeIf { it.stickers.isNotEmpty() }) + (roomId?.let { _chats.value[it]?.stickerPacks }.orEmpty().filter { it.stickers.isNotEmpty() })

    fun sendSticker(roomId: String, s: Sticker) {
        val me = _session.value?.userId ?: return
        val txn = UUID.randomUUID().toString()
        val localId = "local-$txn"
        addLocal(roomId, Msg(localId, me, System.currentTimeMillis(), "m.image", s.body, mxc = s.url, mime = s.mime, w = s.w, h = s.h, sticker = true, txn = txn, status = STATUS_SENDING))
        scope.launch {
            runCatching {
                matrix.send(roomId, "m.sticker", txn, buildJsonObject {
                    put("body", s.body); put("url", s.url)
                    putJsonObject("info") { s.mime?.let { put("mimetype", it) }; s.w?.let { put("w", it) }; s.h?.let { put("h", it) } }
                })
            }.onSuccess { setStatus(roomId, localId, STATUS_SENT, it) }.onFailure { setStatus(roomId, localId, STATUS_FAILED) }
        }
    }

    /** Uploads images and adds them to your personal sticker pack. */
    suspend fun addStickers(uris: List<Uri>) {
        val me = _session.value?.userId ?: return
        val existing = _userStickers.value?.stickers.orEmpty()
        val added = uris.mapNotNull { uri ->
            runCatching {
                val p = describe(uri)
                val mxc = http.upload(p.name, p.mime, p.size) { context.contentResolver.openInputStream(uri)!! }
                Sticker(p.name.substringBeforeLast('.').replace(Regex("[^A-Za-z0-9_-]"), "_").ifEmpty { "sticker" } + "_" + (System.currentTimeMillis() % 100000), mxc, p.name.substringBeforeLast('.'), p.w, p.h, p.mime)
            }.getOrNull()
        }
        if (added.isEmpty()) return
        val all = existing + added
        _userStickers.value = StickerPack("user", "My stickers", all)
        writeJson("userStickers", StickerPack.serializer().nullable, _userStickers.value)
        runCatching {
            matrix.putAccountData(me, "im.ponies.user_emotes", buildJsonObject {
                putJsonObject("pack") { put("display_name", "My stickers") }
                putJsonObject("images") {
                    all.forEach { st ->
                        putJsonObject(st.shortcode) {
                            put("url", st.url); put("body", st.body); put("usage", JsonArray(listOf(JsonPrimitive("sticker"))))
                            putJsonObject("info") { st.mime?.let { put("mimetype", it) }; st.w?.let { put("w", it) }; st.h?.let { put("h", it) } }
                        }
                    }
                }
            })
        }
    }

    /** Stars or un-stars a GIF; the list lives in your Matrix account. */
    fun toggleFavoriteGif(g: Gif) {
        val me = _session.value?.userId ?: return
        val have = _favoriteGifs.value.any { it.url == g.url }
        val next = if (have) _favoriteGifs.value.filter { it.url != g.url } else (listOf(g) + _favoriteGifs.value).take(200)
        _favoriteGifs.value = next
        writeJson("favoriteGifs", kotlinx.serialization.builtins.ListSerializer(Gif.serializer()), next)
        scope.launch { runCatching { matrix.putAccountData(me, "app.pager.favorite_gifs", buildJsonObject { put("gifs", json.encodeToJsonElement(kotlinx.serialization.builtins.ListSerializer(Gif.serializer()), next)) }) } }
    }

    /** Adds a picture from a chat to your own stickers: no re-upload, it just points at the same file. */
    fun saveAsSticker(m: Msg) {
        val me = _session.value?.userId ?: return
        val mxc = m.mxc ?: return
        val existing = _userStickers.value?.stickers.orEmpty()
        if (existing.any { it.url == mxc }) return
        val base = m.body.substringBeforeLast('.').take(40).ifEmpty { "sticker" }
        val added = Sticker(base.replace(Regex("[^A-Za-z0-9_-]"), "_") + "_" + (System.currentTimeMillis() % 100000), mxc, base, m.w, m.h, m.mime)
        val all = existing + added
        _userStickers.value = StickerPack("user", "My stickers", all)
        writeJson("userStickers", StickerPack.serializer().nullable, _userStickers.value)
        scope.launch {
            runCatching {
                matrix.putAccountData(me, "im.ponies.user_emotes", buildJsonObject {
                    putJsonObject("pack") { put("display_name", "My stickers") }
                    putJsonObject("images") {
                        all.forEach { st ->
                            putJsonObject(st.shortcode) {
                                put("url", st.url); put("body", st.body); put("usage", JsonArray(listOf(JsonPrimitive("sticker"))))
                                putJsonObject("info") { st.mime?.let { put("mimetype", it) }; st.w?.let { put("w", it) }; st.h?.let { put("h", it) } }
                            }
                        }
                    }
                })
            }
        }
    }

    fun openUrl(uri: android.net.Uri) {
        context.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, uri).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    // --- Settings backup ---------------------------------------------------------------

    fun exportSettings(): String = json.encodeToString(AppSettings.serializer(), settings.value)
    fun importSettings(text: String): Boolean = runCatching {
        val s = json.decodeFromString(AppSettings.serializer(), text)
        settings.update { s }
    }.isSuccess

    fun setMuted(roomId: String, muted: Boolean, forMs: Long? = null) {
        _muted.update { if (muted) it + roomId else it - roomId }
        muteUntil.update { if (muted && forMs != null) it + (roomId to System.currentTimeMillis() + forMs) else it - roomId }
        writeJson("muteUntil", MapSerializer(String.serializer(), Long.serializer()), muteUntil.value)
        scope.launch { runCatching { matrix.setMuted(roomId, muted) } }
    }

    private fun expireMutes() {
        val now = System.currentTimeMillis()
        muteUntil.value.filterValues { it <= now }.keys.forEach { setMuted(it, false) }
    }

    fun muteLeft(roomId: String): Long? = muteUntil.value[roomId]?.let { it - System.currentTimeMillis() }

    suspend fun members(roomId: String): Map<String, String> = runCatching { matrix.joinedMembers(roomId) }.getOrDefault(emptyMap())

    fun rename(roomId: String, name: String) {
        update(roomId) { it.copy(name = name) }
        scope.launch { runCatching { matrix.rename(roomId, name) } }
    }

    fun leave(roomId: String) {
        _chats.update { it - roomId }
        scope.launch { runCatching { matrix.leave(roomId) } }
    }

    // --- Bridges -------------------------------------------------------------------

    suspend fun refreshBridges() {
        if (_session.value == null) return
        runCatching { pager.networks() }.onSuccess { applyIdentity(it); _bridges.value = it; scope.launch { loadPhonebook(it) } }
    }

    // Names for bare phone numbers come from your phone's contacts and your bridges' contact lists (WhatsApp, Signal and Google Messages know your address book).
    private var bookAt = 0L
    private var contactChunks = 0

    /** Contacts you bring (your phone's) sync to your account in chunks, so web and desktop show the same names. */
    suspend fun syncContacts() {
        val me = _session.value?.userId ?: return
        val rows = Names.ownContacts(); val size = 500
        val count = maxOf(1, (rows.size + size - 1) / size)
        for (i in 0 until maxOf(count, contactChunks)) {
            runCatching {
                matrix.putAccountData(me, "app.pager.contacts.$i", buildJsonObject {
                    put("rows", JsonArray(rows.drop(i * size).take(size).map { (n, nm) -> JsonArray(listOf(JsonPrimitive(n), JsonPrimitive(nm))) }))
                    put("chunks", count)
                })
            }
        }
        contactChunks = count
    }
    private suspend fun loadPhonebook(nets: List<Network>) {
        if (Names.loadDevice(context)) syncContacts()
        if (System.currentTimeMillis() - bookAt < 30 * 60_000L) return
        bookAt = System.currentTimeMillis()
        for (n in nets) for (l in n.logins) runCatching { pager.contacts(n.id, l.id) }.onSuccess { cs -> Names.add(cs.mapNotNull { c -> c.detail?.let { it to c.name } }) }
    }

    /** localpart escaping used by the bridges for ghost user ids (uppercase and odd characters are escaped). */
    private fun escLocalpart(s: String) = buildString {
        for (c in s) when {
            c in 'a'..'z' || c in '0'..'9' || c in "-./=" -> append(c)
            c == '_' -> append("__")
            c in 'A'..'Z' -> append('_').append(c.lowercaseChar())
            else -> append('=').append(c.code.toString(16).padStart(2, '0'))
        }
    }

    private fun restoreIdentity() {
        val names = prefs.getStringSet("identity.names", null) ?: return
        SyncReducer.setOwnIdentity(names, prefs.getStringSet("identity.ids", emptySet()).orEmpty())
    }

    private fun applyIdentity(nets: List<Network>) {
        val domain = _session.value?.userId?.substringAfter(':', "") ?: ""
        val names = sortedSetOf<String>(); val ids = sortedSetOf<String>()
        for (n in nets) for (l in n.logins) {
            ids.add("@${n.id}_${escLocalpart(l.id)}:$domain")
            if (l.name.isNotBlank()) names.add(l.name)
            if (l.profileName.isNotBlank()) names.add(l.profileName)
        }
        val key = names.joinToString("|") + "##" + ids.joinToString("|")
        if (key == prefs.getString("identity.key", "")) return
        prefs.edit().putString("identity.key", key).putStringSet("identity.names", names).putStringSet("identity.ids", ids).apply()
        SyncReducer.setOwnIdentity(names, ids)
        // Messages already loaded were attributed before we knew who you are on each network: start over once.
        val s = _session.value ?: return
        syncJob?.cancel()
        since = null; _chats.value = emptyMap(); _synced.value = false; cacheFile.delete()
        syncJob = scope.launch { kotlinx.coroutines.withTimeoutOrNull(8_000) { startE2ee(s) }; syncLoop(s) } // messages wait a moment for encryption, never for long
    }

    private suspend fun bridgeLoop() {
        while (scope.isActive) {
            if (appInForeground) refreshBridges()
            pruneScheduled()
            delay(120_000)
        }
    }

    // --- Session -----------------------------------------------------------------

    /** Deletes the account (needs the password) and clears this phone. */
    suspend fun deleteProfile(password: String): Result<Unit> = runCatching {
        val me = _session.value?.userId ?: error("Not signed in")
        matrix.deactivate(me, password)
        signOutLocal()
    }

    fun signOut() {
        scope.launch { kotlinx.coroutines.withTimeoutOrNull(2500) { runCatching { matrix.logout() } }; signOutLocal() }
    }

    private fun signOutLocal() {
        syncJob?.cancel()
        retryJob?.cancel(); e2ee?.close(); e2ee = null; waiting.clear(); memberCache.clear()
        runCatching { File(context.filesDir, "e2ee").deleteRecursively() }
        _encryption.value = EncryptionStatus()
        prefs.edit().remove("token").remove("userId").remove("deviceId").remove("identity.key").remove("identity.names").remove("identity.ids").apply()
        SyncReducer.setOwnIdentity(emptyList(), emptyList())
        http.token = null
        since = null
        cacheFile.delete()
        media.clear()
        _chats.value = emptyMap()
        _muted.value = emptySet()
        _bridges.value = emptyList()
        _isAdmin.value = false
        _synced.value = false
        _session.value = null
    }

    fun clearCache() { media.clear() }
    fun cacheSize(): Long = File(context.cacheDir, "media").walkTopDown().filter { it.isFile }.sumOf { it.length() }
}
