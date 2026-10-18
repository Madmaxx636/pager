package app.pager.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LowModesTest {
    private fun eff(s: AppSettings) = effectiveSettings(s, 400, 800)

    @Test fun nothingChangesWhileBothAreOff() {
        val s = AppSettings()
        assertEquals(s.autoDownload, eff(s).autoDownload); assertEquals(s.screenEffects, eff(s).screenEffects)
    }

    @Test fun lowDataStopsDownloadsAndPreviewsButKeepsYourChoices() {
        val mine = AppSettings(lowData = true, autoDownload = "always", linkPreviews = true)
        val e = eff(mine)
        assertEquals("never", e.autoDownload); assertFalse(e.linkPreviews); assertFalse(e.autoPlayGifs); assertFalse(e.sendTyping)
        assertEquals("always", mine.autoDownload)
    }

    @Test fun lowEndDropsOnlyTheHeavyThings() {
        val e = eff(AppSettings(lowEnd = true, bubbleFill = "glass", screenEffects = true))
        assertFalse(e.screenEffects); assertEquals("solid", e.bubbleFill); assertFalse(e.autoPlayGifs)
    }

    @Test fun lowEndKeepsTheSmallThings() {
        val e = eff(AppSettings(lowEnd = true, wallpaper = "dusk", messageAnimation = "pop", bubbleDepth = "raised", reduceMotion = false, greetings = true))
        assertEquals("dusk", e.wallpaper); assertEquals("pop", e.messageAnimation); assertEquals("raised", e.bubbleDepth); assertFalse(e.reduceMotion); assertTrue(e.greetings)
    }
}
