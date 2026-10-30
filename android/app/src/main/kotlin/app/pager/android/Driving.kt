package app.pager.android

import android.content.Context
import androidx.car.app.connection.CarConnection
import androidx.lifecycle.Observer

/**
 * Driving: an automatic "I'm driving" answer, and ready-made quick replies. Both live on this phone only (they are not synced to your other devices,
 * or each phone would answer).
 */
object Driving {
    /** The phone is connected to Android Auto. */
    @Volatile var inCar = false
        private set

    fun watch(context: Context) {
        runCatching { CarConnection(context).type.observeForever(Observer { inCar = it == CarConnection.CONNECTION_TYPE_PROJECTION }) }
    }

    /** The quick replies you set, one per "|" in the setting. */
    fun quickReplies(s: AppSettings): List<String> = s.quickReplies.split('|').map { it.trim() }.filter { it.isNotEmpty() }.take(8)

    private const val COOLDOWN_MS = 3 * 60 * 60_000L        // one answer per chat every three hours, not one per message
    private const val FRESH_MS = 3 * 60_000L                // only for a message that has just come in, never for one found later

    /** Called for each new message: answers it when driving mode is on for it. Returns whether it answered. */
    fun maybeReply(store: Store, context: Context, s: AppSettings, m: Incoming, muted: Set<String>, lowPriority: Boolean): Boolean {
        if (s.drivingReply == "off" || (s.drivingReply == "car" && !inCar)) return false
        if (m.attention != null || m.reaction || m.roomId in muted || lowPriority) return false
        if (m.isGroup && !s.drivingReplyGroups) return false
        if (System.currentTimeMillis() - m.ts > FRESH_MS) return false
        val text = s.drivingReplyText.trim().ifEmpty { return false }
        val prefs = context.getSharedPreferences("pager.driving", Context.MODE_PRIVATE)
        val last = prefs.getLong(m.roomId, 0L)
        if (System.currentTimeMillis() - last < COOLDOWN_MS) return false
        prefs.edit().putLong(m.roomId, System.currentTimeMillis()).apply()
        store.send(m.roomId, text)
        return true
    }
}
