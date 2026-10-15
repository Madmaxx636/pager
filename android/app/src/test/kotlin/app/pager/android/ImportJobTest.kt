package app.pager.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ImportJobTest {
    private val base = ImportJob("whatsapp", "WhatsApp", "all", 0, 0)

    @Test fun finishesAfterAQuietSpell() {
        var j = base.advance(3, 40, 1000)
        assertEquals("importing", j.phase)
        j = j.advance(3, 40, 1000 + ImportJob.QUIET_MS - 1); assertEquals("importing", j.phase)
        j = j.advance(3, 40, 1000 + ImportJob.QUIET_MS); assertEquals("done", j.phase); assertFalse(j.busy)
    }

    @Test fun keepsGoingWhileMessagesArrive() {
        var j = base.advance(1, 1, 0)
        var t = 60_000L
        while (t < 600_000L) { j = j.advance(1, (t / 1000).toInt(), t); t += 60_000L }
        assertTrue(j.busy); assertEquals("importing", j.phase)
    }

    @Test fun waitsForThePickInChooseMode() {
        var j = base.copy(mode = "choose").advance(2, 5, 0)
        j = j.advance(2, 5, ImportJob.QUIET_MS); assertEquals("choosing", j.phase)
        assertEquals("choosing", j.advance(9, 9, ImportJob.QUIET_MS * 2).phase)
    }

    @Test fun offersAWayOutWhenNothingShowsUp() {
        assertFalse(base.stuck(ImportJob.NOTHING_MS - 1)); assertTrue(base.stuck(ImportJob.NOTHING_MS))
    }

    @Test fun anAccountLinkedAgainStillFinishes() {
        var j = base.advance(0, 0, 1000)
        assertEquals("linking", j.phase) // still waiting for the link itself
        j = j.linked(5000)
        assertEquals("importing", j.phase)
        assertFalse(j.stuck(5000 + ImportJob.NOTHING_MS)) // linked, so there is nothing to "stop waiting" for
        j = j.advance(0, 0, 5000 + ImportJob.QUIET_MS - 1); assertEquals("importing", j.phase)
        j = j.advance(0, 0, 5000 + ImportJob.QUIET_MS); assertEquals("done", j.phase); assertFalse(j.busy)
    }

    @Test fun chooseModeWithNothingNewSkipsThePick() {
        val j = base.copy(mode = "choose").linked(0).advance(0, 0, ImportJob.QUIET_MS)
        assertEquals("done", j.phase)
    }
}
