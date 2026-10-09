package app.pager.android

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class E2eeBodiesTest {
    private fun parse(s: String) = Json.parseToJsonElement(s)

    @Test fun nullsAreRemovedEverywhere() {
        val clean = E2eeBodies.stripNulls(parse("""{"device_keys":null,"one_time_keys":{"a":{"k":"v","x":null}},"list":[{"n":null,"m":1}]}""")) as JsonObject
        assertFalse(clean.containsKey("device_keys"))
        assertEquals("""{"one_time_keys":{"a":{"k":"v"}},"list":[{"m":1}]}""", clean.toString())
    }

    @Test fun toDeviceBodiesAreWrappedOnce() {
        val inner = """{"@bob:x":{"DEV":{"algorithm":"m.olm.v1"}}}"""
        assertEquals("""{"messages":$inner}""", E2eeBodies.toDevice(parse(inner)).toString())
        assertEquals("""{"messages":$inner}""", E2eeBodies.toDevice(parse("""{"messages":$inner}""")).toString())
        assertTrue(E2eeBodies.toDevice(parse("""{"messages":{"@a:x":{"D":null}}}""")).toString().contains("\"D\"").not())
    }

    @Test fun aBackupBecomesAListOfKeysThatNameTheirRoomAndSession() {
        val backup = parse("""{"!r1:x":{"S1":{"session_key":"a","algorithm":"m.megolm.v1.aes-sha2"},"S2":{"session_key":"b"}},"!r2:x":{"S3":{"session_key":"c"}}}""") as JsonObject
        val out = E2eeBodies.backupToExport(backup)
        assertEquals(3, out.size)
        assertEquals("""{"session_key":"a","algorithm":"m.megolm.v1.aes-sha2","room_id":"!r1:x","session_id":"S1"}""", out[0].toString())
        assertEquals("""{"session_key":"c","room_id":"!r2:x","session_id":"S3"}""", out[2].toString())
    }
}
