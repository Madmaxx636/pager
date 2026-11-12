package app.pager.android

import org.junit.Test
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue

class EinkTuneTest {
    @Test fun contrastZeroIsIdentity() {
        val m = toneMatrixValues(0, 0)
        assertEquals(1f, m[0], 0f); assertEquals(0f, m[4], 0f)
    }
    @Test fun contrastKeepsMidGrayAndPushesEnds() {
        val m = toneMatrixValues(100, 0)
        val k = m[0]; val off = m[4]
        assertEquals(127.5f, k * 127.5f + off, 0.01f)
        assertTrue(k * 200f + off > 200f)
        assertTrue(k * 60f + off < 60f)
    }
    @Test fun brightnessLiftsAndDarkensTheWholePicture() {
        val up = toneMatrixValues(0, 50); val down = toneMatrixValues(0, -50)
        assertTrue(up[0] * 100f + up[4] > 100f)
        assertTrue(down[0] * 100f + down[4] < 100f)
        assertEquals(0f, toneMatrixValues(0, 0)[4], 0f)
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
