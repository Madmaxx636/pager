package app.pager.android

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import java.text.Normalizer
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * The master password: a copy of the recovery key, locked with a password you choose, kept in your account on your server. Any device that
 * knows the password can read the recovery key back. Same format as the web and desktop apps (keyvault.ts).
 *
 * The server holds only the locked copy, but whoever runs it could try passwords against it offline: the key derivation is slow on purpose,
 * and a long password (several random words) is what keeps it safe.
 */
object KeyVault {
    const val TYPE = "app.pager.key_vault"
    const val MIN_PASSWORD = 10
    private const val ITERATIONS = 600_000
    private val AAD = "pager-key-vault-v1".toByteArray()

    /** The key is derived with PBKDF2-HMAC-SHA256 written out here, so the password is always read as UTF-8 whatever the phone's own provider does. */
    private fun pbkdf2(password: String, salt: ByteArray, iterations: Int): ByteArray {
        val mac = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(Normalizer.normalize(password, Normalizer.Form.NFKC).toByteArray(Charsets.UTF_8), "HmacSHA256")) }
        mac.update(salt); mac.update(byteArrayOf(0, 0, 0, 1))
        var u = mac.doFinal(); val t = u.copyOf()
        repeat(iterations - 1) { u = mac.doFinal(u); for (i in t.indices) t[i] = (t[i].toInt() xor u[i].toInt()).toByte() }
        return t
    }

    private fun cipher(mode: Int, password: String, salt: ByteArray, iv: ByteArray, iterations: Int) =
        Cipher.getInstance("AES/GCM/NoPadding").apply { init(mode, SecretKeySpec(pbkdf2(password, salt, iterations), "AES"), GCMParameterSpec(128, iv)); updateAAD(AAD) }

    /** Locks [recoveryKey] with [password]. [salt] and [iv] are for tests only. */
    fun seal(recoveryKey: String, password: String, backup: String, salt: ByteArray = randomBytes(16), iv: ByteArray = randomBytes(12)): JsonObject {
        if (password.length < MIN_PASSWORD) throw java.io.IOException("Use at least $MIN_PASSWORD characters")
        val ct = cipher(Cipher.ENCRYPT_MODE, password, salt, iv, ITERATIONS).doFinal(recoveryKey.toByteArray(Charsets.UTF_8))
        val b64 = Base64.getEncoder()
        return buildJsonObject {
            put("v", 1); put("kdf", "pbkdf2-sha256"); put("iter", ITERATIONS)
            put("salt", b64.encodeToString(salt)); put("iv", b64.encodeToString(iv)); put("ct", b64.encodeToString(ct))
            put("backup", backup); put("at", System.currentTimeMillis())
        }
    }

    /** The backup version a stored copy unlocks, or null when [v] is not a usable copy (nothing stored, or an empty one). */
    fun backupOf(v: JsonObject?): String? =
        if (v == null || (v["v"] as? JsonPrimitive)?.intOrNull != 1 || str(v, "ct") == null || str(v, "salt") == null || str(v, "iv") == null) null else str(v, "backup")

    /** Reads the recovery key back. Throws "That master password isn't right" when the password does not open it. */
    fun open(v: JsonObject, password: String): String {
        if (backupOf(v) == null || str(v, "kdf") != "pbkdf2-sha256") throw java.io.IOException("This master password was made by a newer Pager. Update the app")
        val iter = (v["iter"] as? JsonPrimitive)?.longOrNull ?: 0
        if (iter !in 100_000..5_000_000) throw java.io.IOException("The master password on your server looks damaged")
        if (password.isEmpty()) throw java.io.IOException("That master password isn't right")
        return try {
            val b64 = Base64.getDecoder()
            String(cipher(Cipher.DECRYPT_MODE, password, b64.decode(str(v, "salt")), b64.decode(str(v, "iv")), iter.toInt()).doFinal(b64.decode(str(v, "ct"))), Charsets.UTF_8)
        } catch (_: Exception) { throw java.io.IOException("That master password isn't right") }
    }

    /** Quick check shown while typing: long enough, and not just one repeated run. */
    fun problem(p: String): String? = when {
        p.length < MIN_PASSWORD -> "At least $MIN_PASSWORD characters. Four or more random words works well"
        p.lowercase().toSet().size < 5 -> "Too repetitive. Use a longer, less predictable password"
        else -> null
    }

    /**
     * Finds the recovery key in what a person pasted or picked: the key itself, or the text file Pager saved ("Pager recovery key", a blank
     * line, the key). Null when nothing in it passes [valid].
     */
    fun find(text: String, valid: (String) -> Boolean): String? =
        (listOf(text) + text.lines()).map { it.trim() }.filter { it.isNotEmpty() }.firstOrNull { valid(it) }

    private fun str(o: JsonObject, k: String) = (o[k] as? JsonPrimitive)?.contentOrNull
    private fun randomBytes(n: Int) = ByteArray(n).also { java.security.SecureRandom().nextBytes(it) }
}
