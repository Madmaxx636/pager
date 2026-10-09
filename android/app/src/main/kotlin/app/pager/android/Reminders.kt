package app.pager.android

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer

@Serializable
data class Reminder(val id: Int, val roomId: String, val chat: String, val whenMs: Long, val snooze: Boolean = false)

/** "Remind me about this page": local alarms that survive restarts. */
class Reminders(private val context: Context) {
    private val prefs = context.getSharedPreferences("pager-reminders", Context.MODE_PRIVATE)
    private val ser = ListSerializer(Reminder.serializer())

    fun all(): List<Reminder> = runCatching { json.decodeFromString(ser, prefs.getString("json", "[]")!!) }.getOrDefault(emptyList())
    private fun save(list: List<Reminder>) = prefs.edit().putString("json", json.encodeToString(ser, list)).apply()

    fun add(roomId: String, chat: String, whenMs: Long, snooze: Boolean = false) {
        val r = Reminder((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), roomId, chat, whenMs, snooze)
        save(all() + r)
        schedule(r)
    }

    fun cancel(r: Reminder) {
        save(all().filter { it.id != r.id })
        context.getSystemService(AlarmManager::class.java).cancel(pending(r))
    }

    fun due(id: Int): Reminder? = all().firstOrNull { it.id == id }.also { r -> if (r != null) save(all().filter { it.id != id }) }

    /** Re-arm everything (after a reboot). */
    fun rescheduleAll() = all().forEach { schedule(it) }

    private fun pending(r: Reminder) = PendingIntent.getBroadcast(
        context, r.id, Intent(context, ReminderReceiver::class.java).putExtra("id", r.id), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    private fun schedule(r: Reminder) {
        // Inexact-but-prompt alarm: needs no special permission and fires within a few minutes even in doze.
        context.getSystemService(AlarmManager::class.java).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, r.whenMs, pending(r))
    }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val store = (context.applicationContext as PagerApp).store
        val r = store.reminders.due(intent.getIntExtra("id", -1)) ?: return
        if (r.snooze) { store.setTag(r.roomId, "u.archived", false); store.markUnread(r.roomId, true) }
        val tap = PendingIntent.getActivity(
            context, r.id, Intent(context, MainActivity::class.java).putExtra("roomId", r.roomId), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = NotificationCompat.Builder(context, PagerApp.CHANNEL_MESSAGES)
            .setSmallIcon(R.drawable.ic_notif).setContentTitle(if (r.snooze) r.chat else "Reminder: ${r.chat}").setContentText(if (r.snooze) "Snoozed page is back in your inbox." else "You asked to be reminded about this page.")
            .setContentIntent(tap).setAutoCancel(true).build()
        runCatching { NotificationManagerCompat.from(context).notify(r.id, n) }
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) (context.applicationContext as PagerApp).store.reminders.rescheduleAll()
    }
}
