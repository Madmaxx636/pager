package app.pager.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
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
}
