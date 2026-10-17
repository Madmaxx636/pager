package app.pager.android

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/** Foreground service: keeps the sync loop running and turns incoming messages into notifications. */
class SyncService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val n: Notification = NotificationCompat.Builder(this, PagerApp.CHANNEL_SYNC)
            .setSmallIcon(R.drawable.ic_notif)
            .setContentTitle("Pager")
            .setContentText("Keeping your pages up to date")
            .setContentIntent(open)
            .setOngoing(true)
            .build()
        startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)

        val store = (application as PagerApp).store
        Watchdog.schedule(this)
        store.ensureSyncing()
        scope.launch {
            store.incoming.collect { m ->
                if (!store.appInForeground) Notifier.show(this@SyncService, store, m)
            }
        }
        // Every few minutes, also with the app closed: a lost login (Google ended the pairing) should reach you soon.
        scope.launch { while (true) { kotlinx.coroutines.delay(if (store.settings.value.lowData) 15 * 60_000L else 3 * 60_000L); store.refreshBridges() } }
        return START_STICKY
    }

    override fun onDestroy() {
        // The system may have stopped the service; the watchdog starts it again.
        scope.cancel()
        super.onDestroy()
    }
}
