package app.pager.android

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.ContextCompat

/** Phones (e-ink ones above all) stop apps that sit in the background. This wakes Pager every few minutes to check that sync is still running. */
object Watchdog {
    private const val EVERY_MS = 5 * 60 * 1000L
    private fun pending(context: Context) = PendingIntent.getBroadcast(context, 7, Intent(context, WatchdogReceiver::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    fun schedule(context: Context) {
        runCatching { context.getSystemService(AlarmManager::class.java).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + EVERY_MS, pending(context)) }
    }
    fun cancel(context: Context) { runCatching { context.getSystemService(AlarmManager::class.java).cancel(pending(context)) } }

    /** Is Pager allowed to run in the background without the phone's battery saver stopping it? */
    fun exempt(context: Context): Boolean = context.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(context.packageName)

    /** Asks the phone to let Pager run in the background (a system question the person answers). */
    fun requestExemption(context: Context) {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + context.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { context.startActivity(intent) }.onFailure { context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
    }
}

class WatchdogReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext as PagerApp
        if (app.store.session.value == null) return
        app.store.ensureSyncing()
        runCatching { ContextCompat.startForegroundService(context, Intent(context, SyncService::class.java)) }
        Watchdog.schedule(context)
    }
}
