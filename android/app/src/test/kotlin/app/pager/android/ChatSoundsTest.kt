package app.pager.android

import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatSoundsTest {
    @Test fun everyChoiceRendersAudibleSamplesExceptNone() {
        for ((id, _) in ChatSounds.choices.filterNot { it.first.startsWith("android_") }) {
            val pcm = ChatSounds.render(id)
            if (id == "none") assertNull(pcm) else {
                assertNotNull(id, pcm)
                assertTrue("$id has sound", pcm!!.any { it.toInt() != 0 })
                assertTrue("$id is short", pcm.size < 44100) // under a second
            }
        }
    }

    @Test fun androidSoundsShipAsRawFiles() {
        val dir = java.io.File("src/main/res/raw")
        for ((id, _) in ANDROID_SOUNDS) org.junit.Assert.assertTrue("$id.ogg", java.io.File(dir, "$id.ogg").exists())
        assertTrue(ANDROID_SOUNDS.size >= 50)
        assertTrue(ChatSounds.choices.last().first == "none")
    }
}
