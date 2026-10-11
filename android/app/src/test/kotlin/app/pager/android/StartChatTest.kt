package app.pager.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StartChatTest {
    @Test fun keepsDigitsAndAPlus() {
        assertEquals("+19125550100", dialable("+1 (912) 555-0100"))
        assertEquals("+19125550100", dialable("tel:+19125550100"))
    }

    @Test fun rejectsWhatIsNotANumber() { assertEquals("", dialable("ann@example.com")); assertEquals("", dialable("1.431")) }

    @Test fun recognisesTheBridgesWording() {
        assertTrue(couldNotResolve("Internal error resolving identifier"))
        assertTrue(couldNotResolve("phone number of ghost 1.431 not known"))
        assertFalse(couldNotResolve("Signal bridge is unreachable"))
    }

    @Test fun explainsWhatToDoInstead() {
        assertTrue(startError("Internal error resolving identifier").contains("phone number"))
        assertEquals("Signal bridge is unreachable", startError("Signal bridge is unreachable"))
    }
}

class UnreadableMessageTest {
    private fun chat(vararg m: Msg) = ChatState(id = "!r:x", messages = m.toList())
    private fun waiting(ts: Long) = Msg(id = "\$a", sender = "@x:y", ts = ts, type = "m.text", body = SyncReducer.WAITING_TEXT, sealed = "{}")

    @org.junit.Test fun saysWaitingFirstThenHonestAfterTenMinutes() {
        val fresh = chat(waiting(1_000_000))
        org.junit.Assert.assertSame(fresh, SyncReducer.relabelUnreadable(fresh, 1_000_000 + 5 * 60_000))
        org.junit.Assert.assertEquals(SyncReducer.STUCK_TEXT, SyncReducer.relabelUnreadable(fresh, 1_000_000 + 11 * 60_000).messages[0].body)
    }

    @org.junit.Test fun leavesOtherMessagesAlone() {
        val ok = chat(waiting(0).copy(sealed = null), waiting(0).copy(body = "hello"))
        org.junit.Assert.assertSame(ok, SyncReducer.relabelUnreadable(ok, 99_999_999))
    }
}
