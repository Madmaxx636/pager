package app.pager.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class LooksTest {
    @Test fun noLookChangesNothing() { val s = AppSettings(); assertSame(s, withLook(s)) }
    @Test fun eachLookSetsItsColoursAndShapes() {
        val i = withLook(AppSettings(look = "imessage")); assertEquals("tail", i.bubbleStyle); assertEquals("#0A84FF", i.bubbleMine)
        val h = withLook(AppSettings(look = "hangouts")); assertEquals(4, h.bubbleRadius); assertTrue(h.showAvatars)
        val g = withLook(AppSettings(look = "gmessages")); assertEquals(20, g.bubbleRadius); assertEquals("#0B57D0", g.accentCustom)
    }
    @Test fun yourOwnChoicesStayUnderneath() {
        val mine = AppSettings(look = "imessage", bubbleMine = "#123456", bubbleRadius = 9)
        withLook(mine)
        assertEquals("#123456", mine.bubbleMine); assertEquals(9, mine.bubbleRadius)
    }
}
