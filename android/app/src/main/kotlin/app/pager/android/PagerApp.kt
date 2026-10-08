package app.pager.android

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.launch

class PagerApp : Application() {
    lateinit var store: Store
        private set

    override fun onCreate() {
        super.onCreate()
        store = Store(this)
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL_MESSAGES, "Messages", NotificationManager.IMPORTANCE_HIGH))
        nm.createNotificationChannel(NotificationChannel(CHANNEL_SYNC, "Background sync", NotificationManager.IMPORTANCE_MIN))

        // Keep the process alive while signed in so messages arrive with the app closed.
        CoroutineScope(SupervisorJob() + Dispatchers.Main).launch {
            store.session.collect { s ->
                val intent = Intent(this@PagerApp, SyncService::class.java)
                if (s != null) runCatching { ContextCompat.startForegroundService(this@PagerApp, intent) }
                else stopService(intent)
            }
        }
    }

    companion object {
        const val CHANNEL_MESSAGES = "messages"
        const val CHANNEL_SYNC = "sync"
    }
}
