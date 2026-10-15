package app.pager.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CustomSoundTest {
    @Test fun aShortAudioFileIsFine() { assertNull(CustomSound.problemWith(true, 200_000, 3.0)) }

    @Test fun explainsWhatIsWrong() {
        assertEquals("That isn't a sound file.", CustomSound.problemWith(false, 100, 1.0))
        assertTrue(CustomSound.problemWith(true, CustomSound.MAX_BYTES + 1, 2.0)!!.contains("too big"))
        assertTrue(CustomSound.problemWith(true, 1000, 40.0)!!.contains("seconds long"))
        assertTrue(CustomSound.problemWith(true, 1000, Double.NaN)!!.startsWith("Couldn't read"))
    }

    @Test fun yourOwnSoundIsFirstInTheLists() { assertEquals("custom", ChatSounds.choices.first().first) }
}
