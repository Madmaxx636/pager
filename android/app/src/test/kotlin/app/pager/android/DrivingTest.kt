package app.pager.android

import org.junit.Assert.assertEquals
import org.junit.Test

class DrivingTest {
    @Test fun quickRepliesAreSplitOnBarsAndTrimmed() {
        val s = AppSettings(quickReplies = " On my way |  | OK |Call you later ")
        assertEquals(listOf("On my way", "OK", "Call you later"), Driving.quickReplies(s))
    }

    @Test fun thereAreNoMoreThanEightQuickReplies() {
        val s = AppSettings(quickReplies = (1..20).joinToString("|") { "r$it" })
        assertEquals(8, Driving.quickReplies(s).size)
    }

    @Test fun nothingAnswersOutsideTheCar() {
        assertEquals(false, Driving.inCar)
    }

    @Test fun drivingReplyIsOffAndNotSyncedByDefault() {
        assertEquals("off", AppSettings().drivingReply)
        assertEquals(false, SettingsStore.GROUPS.any { g -> g.keys.any { it.startsWith("driving") || it == "quickReplies" } })
    }
}
