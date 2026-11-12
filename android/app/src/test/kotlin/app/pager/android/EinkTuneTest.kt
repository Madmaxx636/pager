package app.pager.android

import org.junit.Test
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue

class EinkTuneTest {
    @Test fun contrastZeroIsIdentity() {
        val m = contrastMatrixValues(0)
        assertEquals(1f, m[0], 0f); assertEquals(0f, m[4], 0f)
    }
    @Test fun contrastKeepsMidGrayAndPushesEnds() {
        val m = contrastMatrixValues(100)
        val k = m[0]; val off = m[4]
        assertEquals(127.5f, k * 127.5f + off, 0.01f)
        assertTrue(k * 200f + off > 200f)
        assertTrue(k * 60f + off < 60f)
    }
    @Test fun brightnessZeroMeansSystem() {
        assertNull(windowBrightness(0)); assertEquals(0.5f, windowBrightness(50)!!, 0f); assertEquals(1f, windowBrightness(999)!!, 0f)
    }
    @Test fun deepRefreshEndsOnWhite() {
        val st = deepRefreshSteps(2)
        assertEquals(4, st.size); assertEquals(false, st.last().first); assertEquals(true, st.first().first)
    }
    @Test fun everyNth() {
        val e = EveryNth { 3 }
        assertEquals(listOf(false, false, true, false, false, true), List(6) { e.hit() })
    }
}
