package app.pager.android

/** A login (say your Google Messages) that stopped working: the other service ended it, or the bridge can't recover it. */
object AccountAlerts {
    class Lost(val key: String, val network: String, val account: String, val state: String)
    fun broken(state: String) = state == "BAD_CREDENTIALS" || state == "LOGGED_OUT" || state == "UNKNOWN_ERROR"

    /**
     * Compares the networks with the logins already reported as broken. Returns what to remember (logins that recovered drop out,
     * so a later failure alerts again) and the logins that just broke and have not been reported yet.
     */
    fun newlyLost(reported: Set<String>, nets: List<Network>): Pair<Set<String>, List<Lost>> {
        val now = nets.flatMap { n -> n.logins.filter { broken(it.state) }.map { Lost("${n.id}/${it.id}", n.name, it.name.ifBlank { it.profileName }, it.state) } }
        return now.map { it.key }.toSet() to now.filter { it.key !in reported }
    }

    fun title(l: Lost) = "${l.network} disconnected"
    fun body(l: Lost): String {
        val who = if (l.account.isNotBlank()) " (${l.account})" else ""
        val why = if (l.state == "BAD_CREDENTIALS" || l.state == "LOGGED_OUT") "The service ended the login, so Pager can't get your messages until you sign in again." else "Pager lost the connection and can't recover it on its own."
        return "$why$who Open Settings \u2192 Accounts to sign in again."
    }
}
