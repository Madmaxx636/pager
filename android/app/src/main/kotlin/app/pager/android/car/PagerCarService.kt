package app.pager.android.car

import android.content.Intent
import androidx.car.app.CarAppService
import androidx.car.app.Screen
import androidx.car.app.Session
import androidx.car.app.validation.HostValidator

/**
 * Pager in the car (Android Auto): your chats as a list. Tap one to read its latest messages aloud, answer by voice, or mark it read; "New" starts a
 * conversation. Messages still arrive as car notifications too (see Notifier).
 */
class PagerCarService : CarAppService() {
    // Only the real Android Auto (and the car makers' own hosts) may connect: the list holds your chats. A debuggable test build accepts any host, so the
    // desktop head unit works for development.
    override fun createHostValidator(): HostValidator =
        if (applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0) HostValidator.ALLOW_ALL_HOSTS_VALIDATOR
        else HostValidator.Builder(applicationContext).addAllowedHosts(androidx.car.app.R.array.hosts_allowlist_sample).build()

    override fun onCreateSession(): Session = object : Session() {
        override fun onCreateScreen(intent: Intent): Screen = CarChatListScreen(carContext)
    }
}
