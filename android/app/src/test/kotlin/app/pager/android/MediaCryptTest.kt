package app.pager.android

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File

class MediaCryptTest {
    @Test fun attachmentRoundTripsAndDetectsTampering() {
        val plain = "a private photo, pretend".toByteArray()
        val (scrambled, file) = MediaCrypt.encrypt(plain)
        assertFalse(String(scrambled).contains("private"))
        val src = File.createTempFile("enc", ".bin").apply { writeBytes(scrambled); deleteOnExit() }
        val out = File.createTempFile("dec", ".bin").apply { deleteOnExit() }
        MediaCrypt.decrypt(src, out, file)
        assertArrayEquals(plain, out.readBytes())

        src.writeBytes(scrambled.also { it[0] = (it[0].toInt() xor 1).toByte() })
        try { MediaCrypt.decrypt(src, out, file); fail("tampering should be caught") } catch (e: java.io.IOException) { assertTrue(e.message!!.contains("checksum")) }
    }

    @Test fun webAndAndroidAgreeOnTheFormat() {
        // A file scrambled by the web app (mediacrypt.ts) uses the same fields: key (url-safe base64), iv and sha256 (unpadded base64).
        val (_, file) = MediaCrypt.encrypt(ByteArray(10))
        assertTrue(file.k.length == 43 && !file.k.contains('+') && !file.k.contains('/') && !file.k.contains('='))
        assertTrue(file.iv.length == 22 && !file.iv.endsWith("="))
        assertTrue(file.sha256.length == 43)
    }
}
