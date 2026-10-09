package app.pager.android

import org.junit.Test
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue

class NamesTest {
    @Test fun dropsNetworkTagsButKeepsRealParentheses() {
        assertEquals("Sam Rivera", Names.stripTag("Sam Rivera (WA)"))
        assertEquals("Sam", Names.stripTag("Sam (Signal)"))
        assertEquals("Sam (work)", Names.stripTag("Sam (work)"))
    }

    @Test fun recognisesPhoneNumbers() {
        assertTrue(Names.isPhone("+1 (555) 123-4567"))
        assertFalse(Names.isPhone("Sam"))
        assertFalse(Names.isPhone("12345"))
    }

    @Test fun replacesABareNumberWithTheContactsName() {
        Names.add(listOf("tel:+15551234567" to "Alex Kim (WA)"))
        assertEquals("Alex Kim", Names.pretty("+1 555-123-4567"))
        assertEquals("Alex Kim", Names.pretty("(555) 123 4567 (WA)"))
        assertEquals("+44 7700 900123", Names.pretty("+44 7700 900123"))
    }
}
