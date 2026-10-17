package app.pager.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AccountAlertsTest {
    private fun net(id: String, state: String) = Network(id, if (id == "gmessages") "Google Messages" else id, listOf(Login("a", "me@example.com", state)), false)

    @Test fun reportsALoginThatJustBrokeOnce() {
        val (remembered, fresh) = AccountAlerts.newlyLost(emptySet(), listOf(net("gmessages", "BAD_CREDENTIALS"), net("signal", "CONNECTED")))
        assertEquals(listOf("Google Messages"), fresh.map { it.network })
        assertTrue(AccountAlerts.newlyLost(remembered, listOf(net("gmessages", "BAD_CREDENTIALS"))).second.isEmpty())
    }
    @Test fun alertsAgainAfterItRecoveredAndBrokeAgain() {
        val (remembered, _) = AccountAlerts.newlyLost(setOf("gmessages/a"), listOf(net("gmessages", "CONNECTED")))
        assertTrue(remembered.isEmpty())
        assertEquals(1, AccountAlerts.newlyLost(remembered, listOf(net("gmessages", "LOGGED_OUT"))).second.size)
    }
    @Test fun ignoresHealthyAndTransientStates() {
        assertTrue(AccountAlerts.newlyLost(emptySet(), listOf(net("a", "CONNECTED"), net("b", "TRANSIENT_DISCONNECT"), net("c", "CONNECTING"))).second.isEmpty())
    }
    @Test fun saysWhatToDo() { val l = AccountAlerts.newlyLost(emptySet(), listOf(net("gmessages", "BAD_CREDENTIALS"))).second[0]; assertEquals("Google Messages disconnected", AccountAlerts.title(l)); assertTrue(AccountAlerts.body(l).contains("sign in again")) }
}
