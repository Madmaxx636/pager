package app.pager.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CallOutTest {
    private fun chat(network: String, name: String, others: List<String> = emptyList(), group: Boolean = false) =
        ChatState(id = "!r:s", name = name, network = network, heroes = others, joined = setOf("@me:s") + others, roomType = if (group) "group" else "dm", memberCount = if (group) 5 else 2)

    @Test fun normalizesNumbers() {
        assertEquals("+15551234567", CallOut.normalize("+1 (555) 123-4567"))
        assertEquals("+15551234567", CallOut.normalize("1 555 123 4567"))
        assertEquals("5551234567", CallOut.normalize("555-123-4567"))
        assertEquals("", CallOut.normalize("12"))
    }

    @Test fun readsTheNumberFromTheBridgeIdTheNameOrYourContacts() {
        assertEquals("+15551234567", CallOut.numberFor(chat("whatsapp", "Sam", listOf("@whatsapp_15551234567:s")), "@me:s", emptyList()))
        assertEquals("+15551234567", CallOut.numberFor(chat("gmessages", "+1 555 123 4567 (SMS)"), "@me:s", emptyList()))
        assertEquals("+15559998888", CallOut.numberFor(chat("signal", "Sam"), "@me:s", listOf("+15559998888" to "sam")))
        assertEquals("", CallOut.numberFor(chat("signal", "Sam", listOf("@signal_3f2a-uuid:s")), "@me:s", emptyList()))
    }

    @Test fun offersWhatIsPossibleForEachNetwork() {
        val wa = CallOut.options(chat("whatsapp", "Sam", listOf("@whatsapp_15551234567:s")), "@me:s", emptyList())
        assertEquals(listOf("whatsapp", "phone"), wa.map { it.id })
        val msgr = CallOut.options(chat("messenger", "Alex", listOf("@messenger_1000123456789:s")), "@me:s", emptyList())
        assertEquals(listOf("messenger"), msgr.map { it.id })
        assertEquals(listOf("phone"), CallOut.options(chat("gmessages", "+1 555 123 4567"), "@me:s", emptyList()).map { it.id })
        assertTrue(CallOut.options(chat("whatsapp", "555-123-4567"), "@me:s", emptyList()).none { it.id == "whatsapp" })
    }

    @Test fun groupsAndMatrixChatsGetNothing() {
        assertTrue(CallOut.options(chat("whatsapp", "Friends", listOf("@whatsapp_15551234567:s"), group = true), "@me:s", emptyList()).isEmpty())
        assertTrue(CallOut.options(chat("matrix", "+1 555 123 4567"), "@me:s", emptyList()).isEmpty())
    }
}
