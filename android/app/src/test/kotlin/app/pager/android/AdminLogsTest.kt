package app.pager.android

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AdminLogsTest {
    private fun parse(s: String) = parseLogs(Json.parseToJsonElement(s).jsonObject)

    @Test fun readsWhatTheServerSends() {
        val a = parse("""{"available":true,"updated":1700000100.5,"counts":{"crash":1,"error":2,"attention":0,"warning":5},
            "incidents":[{"id":"a1","fp":"a","service":"discord","severity":"error","message":"boom","first":1700000000,"last":1700000100,"count":3,"before":["x","y"],"after":["z"]}]}""")
        assertTrue(a.available); assertFalse(a.unchanged)
        assertEquals(1700000100.5, a.updated, 0.0)
        assertEquals(5, a.counts["warning"]); assertEquals(1, a.incidents.size)
        val i = a.incidents[0]
        assertEquals("discord", i.service); assertEquals(3, i.count); assertEquals(listOf("x", "y"), i.before); assertEquals(listOf("z"), i.after)
    }

    @Test fun aShortAnswerMeansNothingChanged() {
        val a = parse("""{"available":true,"unchanged":true,"updated":5}""")
        assertTrue(a.unchanged); assertTrue(a.incidents.isEmpty())
    }

    @Test fun oddIncidentsAreSkippedNotFatal() {
        val a = parse("""{"available":true,"updated":1,"incidents":["nonsense",{"fp":"ok","severity":"error","message":"m","count":0}]}""")
        assertEquals(1, a.incidents.size); assertEquals(1, a.incidents[0].count)
    }

    @Test fun textShowsBeforeEventAfterInOrder() {
        val t = incidentText(Incident("i", "f", "signal", "crash", "it broke", 1.7e9, 1.7e9 + 60, 7, listOf("one"), listOf("three")))
        assertTrue(t.contains("Crash in signal (7 times)"))
        assertTrue(t.indexOf("one") < t.indexOf("it broke")); assertTrue(t.indexOf("it broke") < t.indexOf("three"))
        assertFalse(incidentText(Incident("i", "f", "api", "error", "m", 1.0, 1.0, 1, emptyList(), emptyList())).contains("Before:"))
    }
}
