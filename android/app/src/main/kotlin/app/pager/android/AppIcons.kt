package app.pager.android

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager

/** The app icons you can pick: id, name, and the two colours of its background (the pager drawing on top is the same). */
class AppIconChoice(val id: String, val name: String, val from: Long, val to: Long) { val alias get() = "app.pager.android.Icon" + id.replaceFirstChar { it.uppercase() } }

object AppIcons {
    val all = listOf(
        AppIconChoice("classic", "Classic", 0xFF6FF0DC, 0xFF0F9D90),
        AppIconChoice("sunset", "Sunset", 0xFFFFB36B, 0xFFE8408C),
        AppIconChoice("midnight", "Midnight", 0xFF4B5BD6, 0xFF0B1030),
        AppIconChoice("candy", "Candy", 0xFFFF9AD5, 0xFF8B5CF6),
        AppIconChoice("mint", "Mint", 0xFFC5F7D2, 0xFF2FA36B),
        AppIconChoice("retro", "Retro beige", 0xFFE4DEC9, 0xFF8C8670),
        AppIconChoice("graphite", "Graphite", 0xFF58626F, 0xFF0B0F14),
        AppIconChoice("sky", "Sky", 0xFF8FD8FF, 0xFF2563EB),
        AppIconChoice("lemon", "Lemon", 0xFFFFF0A6, 0xFFF59E0B),
        AppIconChoice("rose", "Rose", 0xFFFDA4AF, 0xFFBE123C),
    )

    /** The icon that is on now. */
    fun current(context: Context): String {
        val pm = context.packageManager
        return all.firstOrNull { pm.getComponentEnabledSetting(ComponentName(context.packageName, it.alias)).let { s -> s == PackageManager.COMPONENT_ENABLED_STATE_ENABLED || (s == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && it.id == "classic") } }?.id ?: "classic"
    }

    /** Switches the launcher icon: the chosen one on, the rest off. The app keeps running; the home screen may take a moment to redraw. */
    fun set(context: Context, id: String) {
        val pm = context.packageManager
        all.forEach { pm.setComponentEnabledSetting(ComponentName(context.packageName, it.alias), if (it.id == id) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP) }
    }
}
