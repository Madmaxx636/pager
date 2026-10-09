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
import androidx.core.content.LocusIdCompat
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

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

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

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

    /**
     * Every page becomes an Android *conversation*: a long-lived shortcut with the page's picture, plus a notification that names it.
     * That puts it in the "Conversations" section of the shade and adds the system's own Priority, Bubble and Silent options
     * to each page (long-press the notification, or Settings → Notifications → Conversations).
     */
    fun show(context: Context, store: Store, m: Incoming) {
        scope.launch {
            val avatar = store.inbox.value.firstOrNull { it.id == m.roomId }?.avatarMxc
            val bitmap = avatar?.let { withTimeoutOrNull(2500) { runCatching { store.media.bitmap(it, 128) }.getOrNull() } } ?: letterAvatar(m.chat, networkMeta(m.network).color.toArgb())
            post(context, store, m, IconCompat.createWithAdaptiveBitmap(padded(bitmap)))
        }
    }

    private fun letterAvatar(name: String, color: Int): android.graphics.Bitmap {
        val bmp = android.graphics.Bitmap.createBitmap(128, 128, android.graphics.Bitmap.Config.ARGB_8888)
        val c = android.graphics.Canvas(bmp)
        c.drawColor(color)
        val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { this.color = android.graphics.Color.WHITE; textSize = 64f; textAlign = android.graphics.Paint.Align.CENTER; isFakeBoldText = true }
        c.drawText(name.trim().take(1).uppercase().ifEmpty { "?" }, 64f, 64f - (paint.descent() + paint.ascent()) / 2, paint)
        return bmp
    }

    /** Android crops conversation pictures to its own shape: give it a square with a safe margin (an "adaptive" bitmap). */
    private fun padded(src: android.graphics.Bitmap): android.graphics.Bitmap {
        val size = 216
        val out = android.graphics.Bitmap.createBitmap(size, size, android.graphics.Bitmap.Config.ARGB_8888)
        val c = android.graphics.Canvas(out)
        val inner = (size * 72 / 108f)
        val off = (size - inner) / 2f
        c.drawBitmap(src, null, android.graphics.RectF(off, off, off + inner, off + inner), android.graphics.Paint(android.graphics.Paint.FILTER_BITMAP_FLAG))
        return out
    }

    /** What Android says about this app's conversation features, in plain words (for the "Check priority & bubbles" button). */
    fun diagnose(context: Context): String {
        val nm = context.getSystemService(NotificationManager::class.java)
        val sdk = android.os.Build.VERSION.SDK_INT
        val out = StringBuilder("Android ${android.os.Build.VERSION.RELEASE} (API $sdk)\n\n")
        if (sdk < 30) return out.append("Priority conversations and bubbles need Android 11 or newer. This phone can't show them; Pager's own Priority setting (in each page's notification settings) still works.").toString()
        out.append("Notifications: ").append(if (nm.areNotificationsEnabled()) "on" else "OFF in system settings").append('\n')
        out.append("Message channel: ").append(nm.getNotificationChannel(CH_ALL)?.importance?.let { if (it >= NotificationManager.IMPORTANCE_DEFAULT) "ok" else "set too low (raise it to High)" } ?: "not created yet").append('\n')
        out.append("Bubbles: ").append(
            if (sdk >= 31) when (nm.bubblePreference) { NotificationManager.BUBBLE_PREFERENCE_ALL -> "allowed for all conversations"; NotificationManager.BUBBLE_PREFERENCE_SELECTED -> "allowed for selected conversations"; else -> "OFF for Pager (Settings → Apps → Pager → Notifications → Bubbles)" }
            else if (nm.areBubblesAllowed()) "allowed" else "OFF for Pager (Settings → Apps → Pager → Notifications → Bubbles)",
        ).append('\n')
        val shortcuts = runCatching { ShortcutManagerCompat.getDynamicShortcuts(context).size }.getOrDefault(-1)
        out.append("Conversation shortcuts: ").append(if (shortcuts > 0) "$shortcuts ready" else "none yet. They are made when a page sends you a notification. Use \"Send a test notification\" first").append("\n\n")
        out.append("Then long-press the notification: Android shows Priority, Bubble and Silent only for conversations.")
        return out.toString()
    }

    /** Opens Android's own settings for one conversation (Priority, Bubble, sound), where the system offers them. */
    fun openSystemSettings(context: Context, roomId: String) {
        val intent = Intent(android.provider.Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
            .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, context.packageName)
            .putExtra(android.provider.Settings.EXTRA_CHANNEL_ID, CH_ALL)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (android.os.Build.VERSION.SDK_INT >= 30) intent.putExtra(android.provider.Settings.EXTRA_CONVERSATION_ID, roomId)
        runCatching { context.startActivity(intent) }.onFailure {
            runCatching { context.startActivity(Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, context.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
        }
    }

    private fun post(context: Context, store: Store, m: Incoming, icon: IconCompat) {
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
        val chatPerson = Person.Builder().setName(m.chat).setKey(m.roomId).setIcon(icon).setImportant(s.notifChat[m.roomId]?.level == "priority").build()
        val openIntent = Intent(context, MainActivity::class.java).setAction(Intent.ACTION_VIEW).putExtra("roomId", m.roomId)
        runCatching {
            ShortcutManagerCompat.pushDynamicShortcut(
                context,
                ShortcutInfoCompat.Builder(context, m.roomId).setShortLabel(m.chat).setLongLived(true).setIsConversation().setPerson(chatPerson).setIcon(icon).setIntent(openIntent).build(),
            )
        }
        val style = NotificationCompat.MessagingStyle(me).setConversationTitle(if (m.isGroup) m.chat else null).setGroupConversation(m.isGroup)
        val prio = s.notifChat[m.roomId]?.level == "priority"
        lines.forEach { style.addMessage(it.text, it.ts, if (m.isGroup) Person.Builder().setName(it.sender).setKey(it.sender).build() else chatPerson) }

        val open = PendingIntent.getActivity(
            context, id, Intent(context, MainActivity::class.java).putExtra("roomId", m.roomId), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val parent = channelFor(s, quiet, m.roomId)
        val b = NotificationCompat.Builder(context, parent)
            .setShortcutId(m.roomId).setLocusId(LocusIdCompat(m.roomId)).setLargeIcon(icon.let { runCatching { it.loadDrawable(context)?.let { d -> (d as? android.graphics.drawable.BitmapDrawable)?.bitmap } }.getOrNull() })
            .setSmallIcon(R.drawable.ic_notif).setContentTitle(m.chat)
            .setContentText(if (m.isGroup) "${lines.last().sender}: ${lines.last().text}" else lines.last().text)
            .setStyle(style).setContentIntent(open).setAutoCancel(true).setGroup(GROUP)
            .setPriority(if (prio) NotificationCompat.PRIORITY_MAX else NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE).setOnlyAlertOnce(s.notifAlertOnce && lines.size > 1)
            .setVisibility(when (s.notifLockScreen) { "hide" -> NotificationCompat.VISIBILITY_SECRET; "hide_content" -> NotificationCompat.VISIBILITY_PRIVATE; else -> NotificationCompat.VISIBILITY_PUBLIC })
            .setColor(networkMeta(m.network).color.toArgb())
        if (quiet) b.setSilent(true)
        if (android.os.Build.VERSION.SDK_INT >= 30) b.setBubbleMetadata(
            NotificationCompat.BubbleMetadata.Builder(
                PendingIntent.getActivity(context, id + 1, openIntent, PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT), icon,
            ).setDesiredHeight(600).setSuppressNotification(false).build(),
        )

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
