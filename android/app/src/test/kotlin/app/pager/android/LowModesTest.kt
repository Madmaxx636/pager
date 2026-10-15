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

    @Test fun lowEndStopsMotionAndEffects() {
        val e = eff(AppSettings(lowEnd = true, bubbleFill = "glass", wallpaper = "dusk", messageAnimation = "pop", bubbleDepth = "raised"))
        assertTrue(e.reduceMotion); assertFalse(e.screenEffects)
        assertEquals("none", e.messageAnimation); assertEquals("flat", e.bubbleDepth); assertEquals("solid", e.bubbleFill); assertEquals("none", e.wallpaper)
    }
}
