package app.pager.android

import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatSoundsTest {
    @Test fun everyChoiceRendersAudibleSamplesExceptNone() {
        for ((id, _) in ChatSounds.choices) {
            val pcm = ChatSounds.render(id)
            if (id == "none") assertNull(pcm) else {
                assertNotNull(id, pcm)
                assertTrue("$id has sound", pcm!!.any { it.toInt() != 0 })
                assertTrue("$id is short", pcm.size < 44100) // under a second
            }
        }
    }
}
