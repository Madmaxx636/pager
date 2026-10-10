package app.pager.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TourTest {
    private fun steps(admin: Boolean = false, key: Boolean = true) = TourSteps.forFacts(admin, key, "https://chat.example.com")

    @Test fun startsWithHelloAndEndsWithGoodbye() { assertEquals("hello", steps().first().id); assertEquals("done", steps().last().id) }

    @Test fun onlyAdministratorsHearAboutInvitingPeople() {
        assertFalse(steps().any { it.id == "people" })
        assertEquals("settings/admin", steps(admin = true).first { it.id == "people" }.go)
    }

    @Test fun offersARecoveryKeyOnlyWhenThereIsNone() {
        assertNull(steps(key = true).first { it.id == "secure" }.go)
        assertEquals("settings/privacy", steps(key = false).first { it.id == "secure" }.go)
    }

    @Test fun showsTheServerAddressWithoutTheScheme() {
        val t = steps().first { it.id == "phone" }.text
        assertTrue(t.contains("chat.example.com")); assertFalse(t.contains("https://"))
    }

    @Test fun everyStepFitsInABubble() { for (s in steps(admin = true, key = false)) assertTrue(s.text.length < 190); assertNotNull(steps().first().text) }
}
