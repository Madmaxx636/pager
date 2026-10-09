package app.pager.android

import android.app.Application
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
        // Remember what a crash was, so Settings can show it (there is no other way to see it on a phone).
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, e ->
            runCatching { getSharedPreferences("pager.crash", MODE_PRIVATE).edit().putString("last", (java.util.Date().toString() + "\n" + e.stackTraceToString()).take(3000)).commit() }
            previous?.uncaughtException(thread, e)
        }
        store = Store(this)
        Notifier.createChannels(this)

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
        const val CHANNEL_MESSAGES = Notifier.CH_ALL
        const val CHANNEL_SYNC = Notifier.CH_SYNC
    }
}
