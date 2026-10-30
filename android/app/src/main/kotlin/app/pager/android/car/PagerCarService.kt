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
    // Sideloaded builds are checked by Android Auto's own "Unknown sources" switch; the host list only matters for Play releases.
    override fun createHostValidator(): HostValidator = HostValidator.ALLOW_ALL_HOSTS_VALIDATOR

    override fun onCreateSession(): Session = object : Session() {
        override fun onCreateScreen(intent: Intent): Screen = CarChatListScreen(carContext)
    }
}
