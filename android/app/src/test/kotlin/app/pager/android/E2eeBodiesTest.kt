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
}
