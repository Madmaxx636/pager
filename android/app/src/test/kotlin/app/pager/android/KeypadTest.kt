package app.pager.android

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class KeypadTest {
    @Test fun keypadPhonesGetACalmInterface() {
        val e = effectiveSettings(AppSettings(), 320, 480, keypad = true)
        assertTrue(e.reduceMotion); assertFalse(e.screenEffects); assertFalse(e.autoPlayGifs)
    }

    @Test fun touchPhonesAreUntouched() {
        val s = AppSettings(reduceMotion = false, screenEffects = true, autoPlayGifs = true)
        val e = effectiveSettings(s, 411, 891, keypad = false)
        assertFalse(e.reduceMotion); assertTrue(e.screenEffects); assertTrue(e.autoPlayGifs)
    }

    @Test fun theKeypadSettingStartsOnAutomatic() { assertTrue(AppSettings().keypad == "auto") }
}
