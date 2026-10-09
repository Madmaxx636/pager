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

class MediaCryptWebCompatTest {
    // Made by the web app's mediacrypt.ts (WebCrypto) with a fixed key: the same bytes must open on Android, and what Android makes must open there.
    private val file = EncFile("mxc://x/y", "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA", "CQgHBgUEAwIAAAAAAAAAAA", "U8kiecLG66fRQpG6zHEv4ueJq0JCXAJ6efMwCfWJp/0")
    private val cipherHex = "429fb5cee38163a4f5e389ce1856a975ed1dc8ab45ca3526cb660301c41a0b1b8b6376dba1f5e97c33291a462e78da3409dc236049a6580139304257387f76"

    @Test fun androidOpensWhatTheWebAppScrambled() {
        val src = File.createTempFile("web", ".bin").apply { writeBytes(cipherHex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()); deleteOnExit() }
        val out = File.createTempFile("dec", ".bin").apply { deleteOnExit() }
        MediaCrypt.decrypt(src, out, file)
        org.junit.Assert.assertEquals("hello from the spec, with enough bytes to span two AES blocks!!", out.readText())
    }

    @Test fun streamedEncryptionMatchesAndRoundTrips() {
        val plain = ByteArray(300_000) { (it % 251).toByte() } // several chunks
        val enc = File.createTempFile("enc", ".bin").apply { deleteOnExit() }
        val ef = MediaCrypt.encryptToFile(plain.inputStream(), enc)
        org.junit.Assert.assertEquals(plain.size.toLong(), enc.length())
        val out = File.createTempFile("dec", ".bin").apply { deleteOnExit() }
        MediaCrypt.decrypt(enc, out, ef)
        org.junit.Assert.assertArrayEquals(plain, out.readBytes())
    }
}
