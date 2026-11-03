package app.pager.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class NamesSyncTest {
    @Test fun theSameAddressBookHasTheSameSignatureInAnyOrder() {
        val a = listOf("+1 (555) 123-4567" to "Mom", "555-987-6543" to "Sam (WA)")
        val b = listOf("5559876543" to "Sam", "15551234567" to "Mom")
        assertEquals(Names.deviceSignature(a), Names.deviceSignature(b))
    }

    @Test fun aChangedNameOrANewContactChangesIt() {
        val base = listOf("5551234567" to "Mom")
        assertNotEquals(Names.deviceSignature(base), Names.deviceSignature(listOf("5551234567" to "Mother")))
        assertNotEquals(Names.deviceSignature(base), Names.deviceSignature(base + ("5559876543" to "Sam")))
    }

    @Test fun entriesWithoutARealNumberAreLeftOut() {
        assertEquals(Names.deviceSignature(listOf("5551234567" to "Mom")), Names.deviceSignature(listOf("5551234567" to "Mom", "Home" to "Landline")))
    }
}
