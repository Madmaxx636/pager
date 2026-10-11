package app.pager.android

import org.junit.Assert.assertEquals
import org.junit.Test

class FacesTest {
    @Test fun fitsEveryFaceInsideTheCircle() {
        for (n in listOf(1, 2, 3, 4, 7)) faceLayout(n).forEach { (x, y, d) -> assert(x + d <= 1.001f && y + d <= 1.001f && x >= 0f && y >= 0f) }
        assertEquals(4, faceLayout(7).size); assertEquals(3, faceLayout(3).size)
    }

    @Test fun usesPeopleNotBotsOrYou() {
        val c = ChatState("!a:x", members = mapOf("@me:x" to "Me", "@signalbot:x" to "Signal bot", "@a:x" to "Amy", "@b:x" to "Ben", "@signal_8f2c:x" to "signal_8f2c"), memberAvatars = mapOf("@a:x" to "mxc://x/amy"))
        assertEquals(listOf(Face("Amy", "mxc://x/amy"), Face("Ben", null)), groupFaces(c, "@me:x"))
    }
}
