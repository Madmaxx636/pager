package app.pager.android

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.app.RemoteInput
import java.util.Calendar

/** Turns incoming messages into Android notifications, honouring every notification setting. */
object Notifier {
    const val CH_ALL = "messages"          // sound + vibration
    const val CH_SOUND = "messages_sound"
    const val CH_VIBRATE = "messages_vibrate"
    const val CH_SILENT = "messages_silent"
    const val CH_SYNC = "sync"
    private const val GROUP = "pager.messages"
    private const val KEY_REPLY = "reply"
    const val ACTION_REPLY = "app.pager.android.REPLY"
    const val ACTION_READ = "app.pager.android.MARK_READ"

    private class Line(val sender: String, val text: String, val ts: Long)
    private val history = HashMap<String, MutableList<Line>>()

    fun createChannels(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        fun ch(id: String, name: String, importance: Int, sound: Boolean, vibrate: Boolean) = NotificationChannel(id, name, importance).apply {
            if (!sound) setSound(null, null)
            enableVibration(vibrate)
        }
        nm.createNotificationChannel(ch(CH_ALL, "Messages", NotificationManager.IMPORTANCE_HIGH, true, true))
        nm.createNotificationChannel(ch(CH_SOUND, "Messages (sound only)", NotificationManager.IMPORTANCE_HIGH, true, false))
        nm.createNotificationChannel(ch(CH_VIBRATE, "Messages (vibrate only)", NotificationManager.IMPORTANCE_HIGH, false, true))
        nm.createNotificationChannel(ch(CH_SILENT, "Messages (silent)", NotificationManager.IMPORTANCE_LOW, false, false))
        nm.createNotificationChannel(ch(CH_SYNC, "Background sync", NotificationManager.IMPORTANCE_MIN, false, false))
    }

    private fun channelFor(s: AppSettings, quiet: Boolean, roomId: String): String {
        val vibrate = s.notifVibrate && s.notifChat[roomId]?.vibrate != "off"
        return when {
            quiet -> CH_SILENT
            s.notifSound && vibrate -> CH_ALL
            s.notifSound -> CH_SOUND
            vibrate -> CH_VIBRATE
            else -> CH_SILENT
        }
    }

    /** Shows a sample notification so you can check sound, vibration and what it looks like. */
    fun test(context: Context, store: Store) {
        show(context, store, Incoming("!pager-test", "Pager test", "Pager", "This is how a message will look.", "matrix", false, false, System.currentTimeMillis(), false, !store.settings.value.notifSound, store.settings.value.notifPreview))
    }

    fun show(context: Context, store: Store, m: Incoming) {
        val s = store.settings.value
        // Whether to show it at all was decided by NotifyPolicy; here is only how it looks and sounds.
        val quiet = m.silent
        val preview = m.preview

        val id = m.roomId.hashCode()
        val lines = history.getOrPut(m.roomId) { mutableListOf() }
        val shown = when (preview) { "hidden" -> "New message"; else -> m.text }
        lines.add(Line(if (preview == "hidden") m.chat else m.sender, shown, m.ts.takeIf { it > 0 } ?: System.currentTimeMillis()))
        while (lines.size > 6) lines.removeAt(0)

        val me = Person.Builder().setName("You").build()
        val style = NotificationCompat.MessagingStyle(me).setConversationTitle(if (m.isGroup) m.chat else null).setGroupConversation(m.isGroup)
        lines.forEach { style.addMessage(it.text, it.ts, Person.Builder().setName(it.sender).build()) }

        val open = PendingIntent.getActivity(
            context, id, Intent(context, MainActivity::class.java).putExtra("roomId", m.roomId), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val b = NotificationCompat.Builder(context, channelFor(s, quiet, m.roomId))
            .setSmallIcon(R.drawable.ic_notif).setContentTitle(m.chat)
            .setContentText(if (m.isGroup) "${lines.last().sender}: ${lines.last().text}" else lines.last().text)
            .setStyle(style).setContentIntent(open).setAutoCancel(true).setGroup(GROUP)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE).setOnlyAlertOnce(s.notifAlertOnce && lines.size > 1)
            .setVisibility(when (s.notifLockScreen) { "hide" -> NotificationCompat.VISIBILITY_SECRET; "hide_content" -> NotificationCompat.VISIBILITY_PRIVATE; else -> NotificationCompat.VISIBILITY_PUBLIC })
            .setColor(networkMeta(m.network).color.toArgb())
        if (quiet) b.setSilent(true)

        if (s.notifActions && preview != "hidden") {
            val reply = NotificationCompat.Action.Builder(
                R.drawable.ic_notif, "Reply",
                PendingIntent.getBroadcast(
                    context, id, Intent(context, NotificationActionReceiver::class.java).setAction(ACTION_REPLY).putExtra("roomId", m.roomId),
                    PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
                ),
            ).addRemoteInput(RemoteInput.Builder(KEY_REPLY).setLabel("Reply").build()).setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY).build()
            val read = NotificationCompat.Action.Builder(
                R.drawable.ic_notif, "Mark as read",
                PendingIntent.getBroadcast(
                    context, id, Intent(context, NotificationActionReceiver::class.java).setAction(ACTION_READ).putExtra("roomId", m.roomId),
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
                ),
            ).setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_MARK_AS_READ).build()
            b.addAction(reply).addAction(read)
        }

        val nm = NotificationManagerCompat.from(context)
        runCatching {
            nm.notify(id, b.build())
            nm.notify(0, NotificationCompat.Builder(context, CH_SILENT).setSmallIcon(R.drawable.ic_notif).setGroup(GROUP).setGroupSummary(true).setAutoCancel(true).build())
        }
    }

    fun clear(context: Context, roomId: String) {
        history.remove(roomId)
        NotificationManagerCompat.from(context).cancel(roomId.hashCode())
    }

    fun replyText(intent: Intent): String? = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(KEY_REPLY)?.toString()
}

private fun androidx.compose.ui.graphics.Color.toArgb() = android.graphics.Color.argb((alpha * 255).toInt(), (red * 255).toInt(), (green * 255).toInt(), (blue * 255).toInt())

class NotificationActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val store = (context.applicationContext as PagerApp).store
        val room = intent.getStringExtra("roomId") ?: return
        when (intent.action) {
            Notifier.ACTION_REPLY -> {
                Notifier.replyText(intent)?.takeIf { it.isNotBlank() }?.let { store.send(room, it.trim()) }
                store.markRead(room)
            }
            Notifier.ACTION_READ -> store.markRead(room)
        }
        Notifier.clear(context, room)
    }
}
