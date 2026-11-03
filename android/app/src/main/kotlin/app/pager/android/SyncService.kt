package app.pager.android

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
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
        // The form with a service type exists from Android 10; on Android 8 and 9 it is not there and calling it stopped the service from starting.
        if (android.os.Build.VERSION.SDK_INT >= 29) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC) else startForeground(1, n)

        val store = (application as PagerApp).store
        Watchdog.schedule(this)
        store.ensureSyncing()
        watchNetwork(store)
        // Alerts are posted by the store itself (see Store.alertFor); this service only keeps the process, the network and sync alive.
        scope.launch { checkLoop(store) }
        // Every few minutes, also with the app closed: a lost login (Google ended the pairing) should reach you soon.
        scope.launch { while (true) { kotlinx.coroutines.delay(if (store.settings.value.lowData) 15 * 60_000L else 3 * 60_000L); store.refreshBridges() } }
        return START_STICKY
    }

    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var lastKick = 0L

    /** The moment a network (back) comes up, sync starts again: a request left waiting on the old connection could otherwise hold messages back for minutes. */
    private fun watchNetwork(store: Store) {
        val cm = getSystemService(ConnectivityManager::class.java) ?: return
        networkCallback?.let { runCatching { cm.unregisterNetworkCallback(it) } }
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                val now = System.currentTimeMillis()
                if (now - lastKick < 5_000) return
                lastKick = now
                store.ensureSyncing(force = store.syncAgeMs() > 20_000)
            }
        }
        networkCallback = cb
        runCatching { cm.registerDefaultNetworkCallback(cb) }
    }

    private fun online(): Boolean {
        val cm = getSystemService(ConnectivityManager::class.java) ?: return true
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    /** Every 45 seconds: make sure sync is running; if it has been failing a long time while the phone is online, say so. */
    private suspend fun checkLoop(store: Store) {
        var told = false
        while (true) {
            kotlinx.coroutines.delay(45_000)
            store.ensureSyncing()
            val age = store.syncAgeMs()
            if (online() && age > 10 * 60_000L) { if (!told) { Notifier.cantSync(this, (age / 60_000).toInt()); told = true } }
            else if (age < 2 * 60_000L && told) { Notifier.syncOk(this); told = false }
        }
    }

    override fun onDestroy() {
        // The system may have stopped the service; the watchdog starts it again.
        networkCallback?.let { runCatching { getSystemService(ConnectivityManager::class.java)?.unregisterNetworkCallback(it) } }
        scope.cancel()
        super.onDestroy()
    }
}
