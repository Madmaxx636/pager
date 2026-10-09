package app.pager.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import androidx.compose.ui.graphics.luminance

class AccentTest {
    @Test fun hexRoundTrips() {
        assertEquals("#E11D48", parseHex("#e11d48")!!.toHex())
        assertEquals("#0D9488", parseHex("0d9488")!!.toHex())
        assertNull(parseHex("nope"))
    }

    @Test fun eachAccentGivesDifferentTones() {
        val tones = ACCENTS.keys.map { accentTones(it, "#000000")[1] }
        assertEquals(tones.size, tones.toSet().size)
    }

    @Test fun customAccentIsUsedAndStaysReadable() {
        val yellow = accentTones("custom", "#FFEB3B")
        val light = yellow[1]
        assertNotEquals(accentTones("teal", "")[1], light)
        // on a light theme the accent must be dark enough for white text, and on dark themes light enough for dark text
        assertTrue(light.luminance() < 0.45f || yellow[3] != androidx.compose.ui.graphics.Color.White)
        assertTrue(yellow[0].luminance() > 0.3f)
    }
}
