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
