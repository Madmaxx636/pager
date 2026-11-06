package app.pager.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.put

class KeyVaultTest {
    private val key = "EsTc 4xYz abcd efgh jkmn pqrs tuvw xyz1 2345 6789 ABCD EFGH"

    @Test fun opensWithThePasswordItWasLockedWith() {
        val v = KeyVault.seal(key, "correct horse battery", "7")
        assertEquals(key, KeyVault.open(v, "correct horse battery"))
        assertEquals("7", KeyVault.backupOf(v))
    }

    @Test fun refusesAWrongPassword() {
        val v = KeyVault.seal(key, "correct horse battery", "7")
        try { KeyVault.open(v, "correct horse batterz"); fail() } catch (e: java.io.IOException) { assertTrue(e.message!!.contains("isn't right")) }
    }

    @Test fun readsACopyMadeByTheWebApp() {
        // Made by keyvault.test.ts: salt 0..15, iv 100..111, password "correct horse battery", backup "9", key = the 32 bytes i*7+1 as a recovery key.
        val webKey = "EsT1 HT7u 2D8e RJ5J Xpm5 QiQG RLzx hTZJ mA5Y F4nN CHD4 4593"
        val ct = "XIdO/b2mjuHVlrvg2dGma5glTvWfRIzVvGgDNoj1PxqKA94pFH5Gj4rQxa4pJRY/Ni2RwLO9ohBmewKmN+OJ9avhYrTvqq1Iwequ"
        val v = kotlinx.serialization.json.buildJsonObject {
            put("v", 1); put("kdf", "pbkdf2-sha256"); put("iter", 600_000)
            put("salt", java.util.Base64.getEncoder().encodeToString(ByteArray(16) { it.toByte() }))
            put("iv", java.util.Base64.getEncoder().encodeToString(ByteArray(12) { (100 + it).toByte() }))
            put("ct", ct); put("backup", "9"); put("at", 0)
        }
        assertEquals(webKey, KeyVault.open(v, "correct horse battery"))
    }

    @Test fun passwordInADifferentUnicodeFormIsTheSame() {
        val v = KeyVault.seal(key, "café au lait 2026", "1")
        assertEquals(key, KeyVault.open(v, "café au lait 2026"))
    }

    @Test fun rejectsShortPasswordsAndDamagedCopies() {
        try { KeyVault.seal(key, "short", "1"); fail() } catch (e: java.io.IOException) { assertTrue(e.message!!.contains("at least")) }
        val v = KeyVault.seal(key, "correct horse battery", "1")
        val low = kotlinx.serialization.json.JsonObject(v + mapOf("iter" to JsonPrimitive(10)))
        try { KeyVault.open(low, "correct horse battery"); fail() } catch (e: java.io.IOException) { assertTrue(e.message!!.contains("damaged")) }
        assertNull(KeyVault.backupOf(kotlinx.serialization.json.JsonObject(emptyMap())))
        assertNull(KeyVault.backupOf(null))
        assertNotNull(KeyVault.backupOf(v))
    }

    @Test fun judgesAPasswordWhileTyping() {
        assertTrue(KeyVault.problem("abc")!!.startsWith("At least"))
        assertTrue(KeyVault.problem("aaaaaaaaaaaa")!!.contains("repetitive"))
        assertNull(KeyVault.problem("tulip river 88 lantern"))
    }

    @Test fun findsTheKeyInTheSavedTextFile() {
        val ok = { s: String -> s == key }
        assertEquals(key, KeyVault.find(key, ok))
        assertEquals(key, KeyVault.find("Pager recovery key\r\n\r\n$key\r\n", ok))
        assertNull(KeyVault.find("hello\nnot a key", ok))
    }
}
