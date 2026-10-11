package app.pager.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdaterTest {
    private val json = """{"android":{"version":"0.4.1","code":401,"file":"pager-android-0.4.1.apk","sha256":"ABCDEF","notes":"Fixes"},"desktop":{}}"""

    @Test fun readsTheManifest() {
        val i = Updater.parse(json, "https://pager.example/")!!
        assertEquals(401L, i.code); assertEquals("0.4.1", i.version); assertEquals("abcdef", i.sha256)
        assertEquals("https://pager.example/updates/pager-android-0.4.1.apk", i.url)
    }

    @Test fun refusesFilesOutsideTheUpdatesFolder() {
        assertNull(Updater.parse(json.replace("pager-android-0.4.1.apk", "../x.apk"), "https://s"))
        assertNull(Updater.parse(json.replace("pager-android-0.4.1.apk", "a/b.apk"), "https://s"))
    }

    @Test fun needsAChecksum() { assertNull(Updater.parse(json.replace(""","sha256":"ABCDEF"""", ""), "https://s")); assertNotNull(Updater.parse(json, "https://s")) }

    @Test fun installsOnlyOverTheSameKey() {
        assertTrue(Updater.sameSigner(setOf("aa"), setOf("aa")))
        assertTrue(Updater.sameSigner(setOf("aa", "bb"), setOf("bb")))
        org.junit.Assert.assertFalse(Updater.sameSigner(setOf("aa"), setOf("cc")))
        org.junit.Assert.assertFalse(Updater.sameSigner(emptySet(), emptySet()))
    }

    @Test fun readsTheSignerFromTheManifest() {
        val i = Updater.parse(json.replace(""""notes":"Fixes"""", """"notes":"Fixes","signer":"23:F7:19:AB""""), "https://s")!!
        assertEquals("23f719ab", i.signer)
    }
}
