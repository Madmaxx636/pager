package app.pager.android

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable

val DEFAULT_QUICK_REACTIONS = listOf("👍", "❤️", "😂", "😮", "😢", "🙏")

/** Everything the user can tune. Defaults are the "good out of the box" choices; all of it persists as one JSON blob. */
@Serializable
data class AppSettings(
    // --- Appearance ---
    val themeMode: String = "system",          // system | light | dark | black
    val accent: String = "teal",               // teal | blue | purple | pink | orange | green | red | dynamic
    val fontScale: Float = 1f,
    val bubbleStyle: String = "round",         // round | soft | square | tail | outline | plain
    val bubbleFill: String = "solid",          // solid | gradient | tinted
    val bubbleDepth: String = "soft",          // flat | soft | raised
    val messageAnimation: String = "pop",      // none | pop | slide | fade
    val screenEffects: Boolean = true,
    val wallpaper: String = "none",            // none | dusk | forest | ocean | sand | graphite
    val timeFormat: String = "system",         // system | 12 | 24
    val colorSenderNames: Boolean = true,

    // --- Layout ---
    val density: String = "comfortable",       // comfortable | compact
    val showAvatars: Boolean = true,
    val showNetworkBadges: Boolean = true,
    val showNetworkNameInRows: Boolean = false,
    val showPreviews: Boolean = true,
    val showFilterBar: Boolean = true,
    val swipeRight: String = "read",           // none | archive | read | pin | mute | low | snooze
    val swipeLeft: String = "archive",
    val showReadTicks: Boolean = true,
    val showMessageTimes: Boolean = true,
    val inboxStyle: String = "pro",            // pro (unread counts + network badge) | minimal (titles only)
    val showPinsRow: Boolean = true,
    val sortUnreadFirst: Boolean = false,
    val defaultTab: String = "inbox",          // inbox | unread
    val avatarShape: String = "circle",        // circle | squircle
    val showLabelsInFilterBar: Boolean = true,
    val reduceMotion: Boolean = false,
    /** E-ink mode: black on white, no color, no animation, thick lines. */
    val eink: Boolean = false,
    /** Scales the whole interface (display size). */
    val uiScale: Float = 1f,
    val smallScreen: String = "auto",          // auto | on | off
    val haptics: Boolean = true,
    val doubleTapReact: Boolean = true,

    // --- Chats ---
    val enterSends: Boolean = true,            // Enter sends (Shift+Enter adds a line); on by default
    val sendReadReceipts: Boolean = true,
    val sendTyping: Boolean = true,
    val linkPreviews: Boolean = true,
    val autoDownload: String = "always",       // always | wifi | never
    val unarchiveOnMessage: Boolean = true,
    val confirmDelete: Boolean = true,
    val mentionSuggestions: Boolean = true,
    val markdown: Boolean = true,              // **bold**, _italic_, ~~strike~~, `code` on send
    val largeEmoji: Boolean = true,
    val autoPlayGifs: Boolean = true,
    val imageQuality: String = "original",     // original | high
    val swipeToReply: Boolean = true,
    val groupGapMin: Int = 5,
    val markReadMode: String = "scrolled",     // open | scrolled | manual
    val openAtFirstUnread: Boolean = true,
    val gifProvider: String = "giphy",         // giphy | tenor
    val gifKey: String = "",
    val quickReactions: List<String> = DEFAULT_QUICK_REACTIONS,
    val recentEmoji: List<String> = emptyList(),

    // --- Notifications ---
    val notifEnabled: Boolean = true,
    val notifPreview: String = "full",         // full | sender | hidden
    val notifSound: Boolean = true,
    val notifVibrate: Boolean = true,
    val notifActions: Boolean = true,          // Reply / Mark read buttons
    val notifGroupMentionsOnly: Boolean = false,
    val notifScope: String = "all",            // all | dm_mentions | favorites
    val notifMutedNetworks: Set<String> = emptySet(),
    val quietHoursEnabled: Boolean = false,
    val quietStartMin: Int = 22 * 60,
    val quietEndMin: Int = 7 * 60,

    // --- Networks ---
    val hiddenNetworks: Set<String> = emptySet(),

    // --- Privacy & security ---
    val appLock: Boolean = false,
    val lockAfterSec: Int = 0,
    val hideInRecents: Boolean = false,

    // --- Advanced ---
    val developerMode: Boolean = false,
    val backgroundSync: Boolean = true,
)

class SettingsStore(context: Context) {
    private val prefs = context.getSharedPreferences("pager-settings", Context.MODE_PRIVATE)
    private val _state = MutableStateFlow(load())
    val state: StateFlow<AppSettings> = _state.asStateFlow()
    val value get() = _state.value

    private fun load(): AppSettings = runCatching {
        json.decodeFromString(AppSettings.serializer(), prefs.getString("json", null) ?: return@runCatching AppSettings())
    }.getOrDefault(AppSettings())

    fun update(f: AppSettings.() -> AppSettings) {
        val next = _state.value.f()
        _state.value = next
        prefs.edit().putString("json", json.encodeToString(AppSettings.serializer(), next)).apply()
    }

    fun reset() = update { AppSettings() }
}

/** Is [minuteOfDay] inside a quiet-hours window that may wrap midnight? */
fun inQuietHours(s: AppSettings, minuteOfDay: Int): Boolean {
    if (!s.quietHoursEnabled || s.quietStartMin == s.quietEndMin) return false
    return if (s.quietStartMin < s.quietEndMin) minuteOfDay in s.quietStartMin until s.quietEndMin
    else minuteOfDay >= s.quietStartMin || minuteOfDay < s.quietEndMin
}
