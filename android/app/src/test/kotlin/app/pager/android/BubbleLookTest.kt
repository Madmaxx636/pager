package app.pager.android

import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class BubbleLookTest {
    @Test fun olderShapesBecomeTheNearestOne() {
        assertEquals("round", migrateBubbleStyle("soft")); assertEquals("round", migrateBubbleStyle("plain")); assertEquals("round", migrateBubbleStyle("square"))
        assertEquals("curved", migrateBubbleStyle("cloud")); assertEquals("tail", migrateBubbleStyle("tail")); assertEquals("outline", migrateBubbleStyle("outline"))
    }

    @Test fun outgoingFollowsIncomingUntilItIsSet() {
        val s = AppSettings(bubbleStyle = "curved", bubbleRadius = 12, bubbleBorder = "dashed", bubbleBorderColor = "#FF0000")
        assertEquals(SideLook("curved", 12, "dashed", "#FF0000"), s.look(true))
        val own = s.copy(outStyle = "tail", outRadius = 0, outBorder = "none", outBorderColor = "#00FF00")
        assertEquals(SideLook("tail", 0, "none", "#00FF00"), own.look(true))
        assertEquals(SideLook("curved", 12, "dashed", "#FF0000"), own.look(false))
    }

    @Test fun darkThemeUsesItsOwnColoursAndFallsBackToTheLightOnes() {
        val s = AppSettings(bubbleMine = "#112233", bubbleMineDark = "#445566", bubbleMineText = "#FFFFFF")
        assertEquals("#112233", s.bubbleColors(true, false).first!!.toHex())
        assertEquals("#445566", s.bubbleColors(true, true).first!!.toHex())
        assertEquals("#FFFFFF", s.bubbleColors(true, true).second!!.toHex()) // no dark text colour set: the light one is used
        assertNull(s.bubbleColors(false, true).first)
    }

    @Test fun tailsKeepASmallCornerNextToTheSender() {
        val tail = bubbleShape(SideLook("tail", 0, "none", ""), mine = true, first = true, last = true, tailed = true)
        // Mine: the bottom corner on the right is the small one; the others are the full 18.
        assertEquals(androidx.compose.foundation.shape.CornerSize(4.dp), tail.bottomEnd)
        assertEquals(androidx.compose.foundation.shape.CornerSize(18.dp), tail.bottomStart)
        val plain = bubbleShape(SideLook("round", 0, "none", ""), mine = false, first = false, last = false, tailed = false)
        assertEquals(androidx.compose.foundation.shape.CornerSize(6.dp), plain.topStart) // joined to the bubble above: a tight corner
    }

    @Test fun everyBorderStyleIsListed() {
        assertEquals(listOf("none", "solid", "dotted", "dashed", "thick", "edge", "dashdot"), BORDER_STYLES.map { it.first })
    }
}
