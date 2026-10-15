package app.pager.android

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AttentionTest {
    private fun content(kind: String) = JsonObject(mapOf(Attention.FIELD to JsonObject(mapOf("kind" to JsonPrimitive(kind)))))
    @Test fun readsKnownKindsOnly() {
        assertEquals("ring", Attention.kindOf(content("ring")))
        assertNull(Attention.kindOf(content("boom")))
        assertNull(Attention.kindOf(JsonObject(emptyMap())))
    }
    @Test fun everyKindHasWordsForOtherApps() = Attention.kinds.forEach { assertTrue(Attention.text(it.id).length > 3) }
    @Test fun onlyFreshOnesRing() {
        assertTrue(Attention.fresh(System.currentTimeMillis() - 5_000))
        assertFalse(Attention.fresh(System.currentTimeMillis() - 10 * 60_000))
    }
    @Test fun callsAreRingAndVideo() { assertTrue(Attention.calling("ring")); assertTrue(Attention.calling("video")); assertFalse(Attention.calling("nudge")) }
}
