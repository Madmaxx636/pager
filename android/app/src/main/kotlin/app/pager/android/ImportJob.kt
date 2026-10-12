package app.pager.android

import kotlinx.serialization.Serializable

/** One bridge import at a time: from linking an account until its chats have stopped arriving. Kept on this device. */
@Serializable
data class ImportJob(
    val network: String,
    val name: String,
    /** "all" brings everything in; "choose" lets the user pick the chats to keep once they have arrived. */
    val mode: String,
    val startedAt: Long,
    /** Chats of this network that existed before linking, so only new ones count. */
    val baseChats: Int,
    val chats: Int = 0,
    val messages: Int = 0,
    val changedAt: Long = startedAt,
    /** linking, importing, choosing or done. */
    val phase: String = "linking",
) {
    val busy get() = phase != "done"

    /** A rough fraction for the bar: the bridges never say how much is coming, so it fills as the pace slows down. */
    fun fraction(now: Long): Float = when {
        phase == "done" || phase == "choosing" -> 1f
        phase == "linking" || chats == 0 -> 0f
        else -> ((now - changedAt).toFloat() / QUIET_MS).coerceIn(0.05f, 0.95f)
    }

    /** True when the wait for chats to show up has gone on for too long, so the user is offered a way out. */
    fun stuck(now: Long) = phase != "done" && chats == 0 && now - startedAt >= NOTHING_MS

    /** Advances the job given how many chats and messages the network has now. */
    fun advance(chatsNow: Int, messagesNow: Int, now: Long): ImportJob {
        if (phase == "choosing" || phase == "done") return this
        var next = this
        if (chatsNow != chats || messagesNow != messages) next = copy(chats = chatsNow, messages = messagesNow, changedAt = now, phase = if (chatsNow > 0) "importing" else phase)
        if (next.phase == "importing" && now - next.changedAt >= QUIET_MS) return next.copy(phase = if (mode == "choose") "choosing" else "done")
        return next
    }

    companion object {
        /** The import counts as finished when nothing new has arrived for this long. */
        const val QUIET_MS = 2 * 60_000L
        /** Longest the screen waits without any chats showing up before it lets the user move on. */
        const val NOTHING_MS = 10 * 60_000L
    }
}
