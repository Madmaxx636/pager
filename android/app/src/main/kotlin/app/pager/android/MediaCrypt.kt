package app.pager.android

import kotlinx.serialization.Serializable
import java.io.File
import java.security.MessageDigest
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

/** Encrypted attachments (Matrix "EncryptedFile"): AES-256-CTR with a random key, and a SHA-256 of the scrambled bytes. */
@Serializable
data class EncFile(val url: String, val k: String, val iv: String, val sha256: String)

object MediaCrypt {
    private val urlB64 = Base64.getUrlEncoder().withoutPadding()
    private val stdB64 = Base64.getEncoder().withoutPadding()
    private fun unb64(s: String): ByteArray = Base64.getUrlDecoder().decode(s.replace('+', '-').replace('/', '_').trimEnd('='))

    /** Scrambles bytes for sending: returns the scrambled bytes and the key material (url is filled in after upload). */
    fun encrypt(plain: ByteArray): Pair<ByteArray, EncFile> {
        val rnd = java.security.SecureRandom()
        val key = ByteArray(32).also(rnd::nextBytes)
        val iv = ByteArray(16).also { val half = ByteArray(8).also(rnd::nextBytes); System.arraycopy(half, 0, it, 0, 8) } // random first half; the counter half stays zero
        val cipher = Cipher.getInstance("AES/CTR/NoPadding").apply { init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), IvParameterSpec(iv)) }
        val scrambled = cipher.doFinal(plain)
        return scrambled to EncFile("", urlB64.encodeToString(key), stdB64.encodeToString(iv), stdB64.encodeToString(MessageDigest.getInstance("SHA-256").digest(scrambled)))
    }

    /** Scrambles a stream into [out] without holding it all in memory (big files). Returns the key material (url is filled in after upload). */
    fun encryptToFile(input: java.io.InputStream, out: File): EncFile {
        val rnd = java.security.SecureRandom()
        val key = ByteArray(32).also(rnd::nextBytes)
        val iv = ByteArray(16).also { val half = ByteArray(8).also(rnd::nextBytes); System.arraycopy(half, 0, it, 0, 8) }
        val cipher = Cipher.getInstance("AES/CTR/NoPadding").apply { init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), IvParameterSpec(iv)) }
        val digest = MessageDigest.getInstance("SHA-256")
        out.outputStream().use { fileOut ->
            val buf = ByteArray(64 * 1024)
            while (true) {
                val n = input.read(buf); if (n < 0) break
                val chunk = cipher.update(buf, 0, n) ?: continue
                digest.update(chunk); fileOut.write(chunk)
            }
            val last = cipher.doFinal()
            if (last.isNotEmpty()) { digest.update(last); fileOut.write(last) }
        }
        return EncFile("", urlB64.encodeToString(key), stdB64.encodeToString(iv), stdB64.encodeToString(digest.digest()))
    }

    /** Unscrambles a downloaded file into [out]. Throws if it was tampered with. */
    fun decrypt(scrambled: File, out: File, f: EncFile) {
        val digest = MessageDigest.getInstance("SHA-256")
        scrambled.inputStream().use { input -> val buf = ByteArray(64 * 1024); while (true) { val n = input.read(buf); if (n < 0) break; digest.update(buf, 0, n) } }
        if (stdB64.encodeToString(digest.digest()) != f.sha256.trimEnd('=')) throw java.io.IOException("This file does not match its checksum")
        val cipher = Cipher.getInstance("AES/CTR/NoPadding").apply { init(Cipher.DECRYPT_MODE, SecretKeySpec(unb64(f.k), "AES"), IvParameterSpec(unb64(f.iv))) }
        val tmp = File(out.path + ".tmp")
        scrambled.inputStream().use { input -> javax.crypto.CipherInputStream(input, cipher).use { c -> tmp.outputStream().use { c.copyTo(it) } } }
        tmp.renameTo(out)
    }

    // Messages that carry encrypted files register them here by mxc url, so the media loader knows to unscramble them.
    private val known = java.util.concurrent.ConcurrentHashMap<String, EncFile>()
    fun register(f: EncFile) { if (f.url.isNotEmpty()) known[f.url] = f }
    fun infoFor(mxc: String): EncFile? = known[mxc]
}
