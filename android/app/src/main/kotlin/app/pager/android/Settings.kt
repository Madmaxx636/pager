package app.pager.android

import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable

val DEFAULT_QUICK_REACTIONS = listOf("👍", "❤️", "😂", "😮", "😢", "🙏")

/** Everything the user can tune. Defaults are the "good out of the box" choices; all of it persists as one JSON blob. */
@Serializable
data class ChatNotifPrefs(
    val mode: String = "default",       // default | all | mentions | none
    val preview: String = "default",    // default | show | hide
    val sound: String = "default",      // default | off
    val vibrate: String = "default",    // default | off
    val level: String = "default",      // default | priority | silent (like Android conversations)
) {
    val isDefault get() = mode == "default" && preview == "default" && sound == "default" && vibrate == "default" && level == "default"
}

@Serializable
data class AppSettings(
    // --- Appearance ---
    val themeMode: String = "system",          // system | light | dark | black
    val accent: String = "teal",               // teal | blue | purple | pink | orange | green | red | dynamic | custom
    val accentCustom: String = "#0D9488",      // the colour used when accent is "custom"
    val fontScale: Float = 1f,
    val bubbleStyle: String = "round",         // round (no tail) | curved | tail (pointed) | outline
    val bubbleFill: String = "solid",          // solid | gradient | tinted | glass
    val bubbleBorder: String = "none",         // none | solid | dotted | dashed: the line around bubbles
    val bubbleBorderColor: String = "",        // its colour; empty follows the theme
    /** Outgoing side, when it differs from the incoming side above ("" and -1 mean the same as incoming). Beeper keeps a full set for each side. */
    val outStyle: String = "",
    val outRadius: Int = -1,
    val outBorder: String = "",
    val outBorderColor: String = "",
    /** Bubble colours for the dark theme and the text on them, and for the light theme's text; the plain bubbleMine/bubbleTheirs are the light-theme colours. */
    val bubbleMineDark: String = "",
    val bubbleTheirsDark: String = "",
    val bubbleMineText: String = "",
    val bubbleTheirsText: String = "",
    val bubbleMineTextDark: String = "",
    val bubbleTheirsTextDark: String = "",
    /** Incoming bubbles take each network's own colour. */
    val bubbleNative: Boolean = false,
    val bubbleMine: String = "",               // colour of your own bubbles; empty follows the theme
    val bubbleTheirs: String = "",             // colour of their bubbles; empty follows the theme
    val bubbleRadius: Int = 0,                 // corner roundness in dp; 0 = what the style says
    val bubbleWidth: Int = 0,                  // widest a bubble gets, percent of the screen; 0 = default
    val wallpaperDim: Int = 0,                 // how much the wallpaper is darkened, 0..70 percent
    val bubbleDepth: String = "soft",          // flat | soft | raised
    val messageAnimation: String = "pop",      // none | pop | slide | fade
    val screenEffects: Boolean = true,
    val wallpaper: String = "none",            // none | one of the wallpaper names | custom (your own photo)
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
    /** How dark E-ink text and lines are, from 1 (dark gray) to 4 (pure black). Darker, never thicker. */
    val einkDark: Int = 4,
    /** E-ink "Darker": on top of the darkest level, nothing is ever faint, lines and marks are heavier. */
    val einkDarker: Boolean = false,
    /** How much detail E-ink screens get, for the refresh modes that wash it out: 0 normal (slow mode) | 1 higher (middle modes) | 2 ultra (the fastest mode). More detail = bigger, bolder marks, clearer emoji, words next to the sent/delivered/read marks. */
    val einkDetail: Int = 0,
    /** A quick white flash that clears ghosting on e-ink: off | chats (when opening or leaving a chat) | timed. */
    val screenClean: String = "off",
    val screenCleanSec: Int = 20,
    val palette: String = "none",              // a ready-made look (see Palettes.kt), or none
    val fontFamily: String = "system",
    /** A whole messenger look (see Looks.kt): none | imessage | hangouts | gmessages. */
    val look: String = "none",
    val reactionStyle: String = "filled",      // filled | outline
    val hideStories: Boolean = false,
    /** Deleting a chat in Pager also deletes it on its own network (Signal, WhatsApp, Google Messages). Off unless you turn it on, because it cannot be undone. */
    val deleteAtSource: Boolean = false,
    /** Turn voice messages into text as you see them (needs transcription switched on at your server). */
    val autoTranscribe: Boolean = false,
    val reactionSound: String = "tick",
    /** Scales the whole interface (display size). */
    val keypad: String = "auto",               // d-pad and keypad phones: auto (when the phone has a d-pad or number keys) | on | off
    val smallScreen: String = "auto",          // tighter rows: auto (small screens only) | on | off
    val scaleMode: String = "auto",            // auto: from the screen's size and density | manual: your slider
    val uiScale: Float = 1f,                   // manual scale, in small steps
    val haptics: Boolean = true,
    val doubleTapReact: Boolean = true,
    /** Reaction added by a double tap; empty = your first quick reaction. */
    val doubleTapEmoji: String = "",
    val tripleTapReact: Boolean = false,
    val tripleTapEmoji: String = "😂",

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
    /** For a slow or limited connection: nothing downloads by itself, smaller pictures, less background traffic. */
    val lowData: Boolean = false,
    /** For an older or slower phone: no animation or effects, plain bubbles, fewer messages kept in memory. */
    val lowEnd: Boolean = false,
    val imageQuality: String = "original",     // original | high
    val swipeToReply: Boolean = true,
    val greetings: Boolean = true,            // a silly pager message when the app opens
    val groupGapMin: Int = 5,
    val markReadMode: String = "scrolled",     // open | scrolled | manual
    /** Open a chat at its 'New messages' line instead of at the newest message. */
    val openAtUnread: Boolean = false,
    val gifProvider: String = "giphy",         // giphy | tenor
    val gifKey: String = "",
    /** Your GIF search keys by provider (giphy, klipy). gifProvider and gifKey are from before there were several sources. */
    val gifKeys: Map<String, String> = emptyMap(),
    val quickReactions: List<String> = DEFAULT_QUICK_REACTIONS,
    val recentEmoji: List<String> = emptyList(),

    // --- Notifications ---
    val notifEnabled: Boolean = true,
    /** A notification when one of your accounts (Google Messages, WhatsApp…) loses its login. */
    val accountAlerts: Boolean = true,
    /** Admins: a notification when the weekly bridge update changed something. */
    val updateAlerts: Boolean = true,
    val notifPreview: String = "full",         // full | sender | hidden
    /** The alert sound: "system" (Android's own, set in its notification settings) or "custom" (the file you chose). */
    val alertSound: String = "system",
    val notifSound: Boolean = true,
    /** Sounds for sending and receiving, only while you are inside that page. */
    val convoSounds: Boolean = true,
    /** A message for another page while you are in the app slides in at the top (instead of only a sound). */
    val inAppPopups: Boolean = true,
    val sendSound: String = "swoosh",
    val receiveSound: String = "pop",
    val convoSoundVolume: Float = 0.5f,
    val notifVibrate: Boolean = true,
    val notifActions: Boolean = true,          // Reply / Mark read buttons
    val notifGroupMentionsOnly: Boolean = false,
    val notifScope: String = "all",            // all | dm_mentions | favorites
    val notifMutedNetworks: Set<String> = emptySet(),
    /** Per network: all | mentions | none. */
    val notifNetworkMode: Map<String, String> = emptyMap(),
    /** Per chat overrides, set from the chat's info page. */
    val notifChat: Map<String, ChatNotifPrefs> = emptyMap(),
    /** How direct messages and group chats notify when nothing more specific is set: all | mentions | none. */
    val notifDirectMode: String = "all",
    val notifGroupMode: String = "all",
    /** Words that always notify (even in muted chats), like a name or a nickname. */
    val notifKeywords: List<String> = emptyList(),
    /** Days of the week quiet hours apply on (0 = Sunday). */
    val notifQuietDays: Set<Int> = setOf(0, 1, 2, 3, 4, 5, 6),
    /** Pinned chats and mentions can still make a sound during quiet hours. */
    val notifQuietBreakThrough: Boolean = false,
    /** Wait this long before alerting, and skip it if you read the chat somewhere else meanwhile. */
    val notifDelaySec: Int = 0,
    val notifLockScreen: String = "show",      // show | hide_content | hide
    /** Only the first message of a burst makes a sound. */
    val notifAlertOnce: Boolean = false,
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
    /** Android Go phones and other very small ones (a couple of GB of memory) report themselves as "low RAM". */
    private val lowRam = runCatching { (context.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager).isLowRamDevice }.getOrDefault(false)
    private val _state = MutableStateFlow(load())
    val state: StateFlow<AppSettings> = _state.asStateFlow()
    val value get() = _state.value

    private fun load(): AppSettings = runCatching {
        // The alert delay and the per-network settings were taken out of Settings, so whatever was saved for them is switched off.
        json.decodeFromString(AppSettings.serializer(), prefs.getString("json", null) ?: return@runCatching AppSettings(lowEnd = lowRam)).copy(notifDelaySec = 0, notifNetworkMode = emptyMap(), notifMutedNetworks = emptySet()).let { x ->
            // One GIPHY key from before several sources existed moves into the new place. (A Tenor key is dropped: that service no longer exists.)
            if (x.gifKey.isNotBlank() && x.gifProvider != "tenor" && x.gifKeys["giphy"].isNullOrBlank()) x.copy(gifKeys = x.gifKeys + ("giphy" to x.gifKey)) else x
        }.let { it.copy(bubbleStyle = migrateBubbleStyle(it.bubbleStyle), outStyle = if (it.outStyle.isEmpty()) "" else migrateBubbleStyle(it.outStyle)) }
    }.getOrDefault(AppSettings())

    // ---- Syncing settings between your devices: only when you press the button -----------------------------------
    // Nothing here is copied automatically. "Sync settings" lets you pick which groups of settings to save from this phone, and which to load onto it.
    // Phones and tablets share one saved set; computers keep their own.
    private val full = kotlinx.serialization.json.Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private fun asObject(s: AppSettings) = full.encodeToJsonElement(AppSettings.serializer(), s).jsonObject

    class Group(val id: String, val label: String, val hint: String, val keys: List<String>)
    companion object {
        const val TYPE = "app.pager.sync.mobile"
        val GROUPS = listOf(
            Group("look", "Colours and theme", "Mode, accent, looks, wallpaper, font, text size, avatars", listOf("themeMode", "look", "accent", "accentCustom", "palette", "wallpaper", "fontFamily", "fontScale", "avatarShape", "colorSenderNames", "largeEmoji", "timeFormat")),
            Group("bubbles", "Bubbles and messages", "Bubble style, fill, depth, animations, effects", listOf("bubbleStyle", "bubbleFill", "bubbleBorder", "bubbleBorderColor", "outStyle", "outRadius", "outBorder", "outBorderColor", "bubbleMineDark", "bubbleTheirsDark", "bubbleMineText", "bubbleTheirsText", "bubbleMineTextDark", "bubbleTheirsTextDark", "bubbleNative", "bubbleMine", "bubbleTheirs", "bubbleRadius", "bubbleWidth", "wallpaperDim", "bubbleDepth", "messageAnimation", "screenEffects", "reactionStyle")),
            Group("reactions", "Reactions", "Double-tap and triple-tap reactions, swipe to reply", listOf("doubleTapReact", "doubleTapEmoji", "tripleTapReact", "tripleTapEmoji", "swipeToReply")),
            Group("list", "Chat list", "What each row shows, filters, swipes, hidden networks", listOf("showAvatars", "showFilterBar", "showLabelsInFilterBar", "showMessageTimes", "showNetworkBadges", "showNetworkNameInRows", "showPinsRow", "showPreviews", "showReadTicks", "sortUnreadFirst", "inboxStyle", "defaultTab", "hiddenNetworks", "hideStories", "swipeLeft", "swipeRight")),
            Group("notifications", "Notifications", "What alerts you, quiet hours, previews", listOf("notifEnabled", "accountAlerts", "updateAlerts", "notifPreview", "notifSound", "notifScope", "notifGroupMentionsOnly", "notifMutedNetworks", "notifNetworkMode", "notifKeywords", "notifQuietDays", "notifQuietBreakThrough", "notifDelaySec", "notifDirectMode", "notifGroupMode", "quietHoursEnabled", "quietStartMin", "quietEndMin", "notifVibrate", "notifLockScreen", "notifAlertOnce", "notifActions")),
            Group("sounds", "Sounds", "Send, receive and reaction sounds", listOf("convoSounds", "inAppPopups", "sendSound", "receiveSound", "reactionSound")),
            Group("gifs", "GIF search keys", "Your GIPHY and KLIPY keys (kept on your own server)", listOf("gifKeys")),
            Group("behaviour", "Chat behaviour", "Read marks, typing, downloads, link previews, confirmations", listOf("lowData", "lowEnd", "markReadMode", "groupGapMin", "unarchiveOnMessage", "linkPreviews", "autoDownload", "autoPlayGifs", "sendReadReceipts", "sendTyping", "openAtUnread", "confirmDelete", "markdown", "mentionSuggestions", "greetings", "deleteAtSource", "autoTranscribe", "gifProvider", "enterSends", "imageQuality")),
        )
    }
    private fun keysOf(ids: List<String>) = GROUPS.filter { it.id in ids }.flatMap { it.keys }

    /** The settings of the chosen groups, as they are on this phone now. */
    fun pick(ids: List<String>): kotlinx.serialization.json.JsonObject { val mine = asObject(_state.value); return kotlinx.serialization.json.JsonObject(keysOf(ids).mapNotNull { k -> mine[k]?.let { k to it } }.toMap()) }

    /** What to store when you save: what was saved before, with the chosen groups replaced by this phone's. */
    fun mergeSaved(previous: kotlinx.serialization.json.JsonObject?, ids: List<String>, from: String, now: Long = System.currentTimeMillis()): kotlinx.serialization.json.JsonObject {
        val before = (previous?.get("settings") as? kotlinx.serialization.json.JsonObject) ?: kotlinx.serialization.json.JsonObject(emptyMap())
        return kotlinx.serialization.json.buildJsonObject {
            put("v", 3); put("savedAt", now); put("from", from)
            put("settings", kotlinx.serialization.json.JsonObject(before + pick(ids)))
        }
    }

    /** Which groups a saved set holds (every key of the group is there). */
    fun groupsIn(saved: kotlinx.serialization.json.JsonObject?): List<String> {
        val st = saved?.get("settings") as? kotlinx.serialization.json.JsonObject ?: return emptyList()
        return GROUPS.filter { g -> g.keys.all { it in st } }.map { it.id }
    }

    /** Puts the chosen groups of a saved set onto this phone. Returns how many settings changed. */
    fun loadSaved(saved: kotlinx.serialization.json.JsonObject, ids: List<String>): Int {
        val st = saved["settings"] as? kotlinx.serialization.json.JsonObject ?: return 0
        val mine = asObject(_state.value)
        var next = _state.value; var changed = 0
        for (k in keysOf(ids)) {
            val v = st[k] ?: continue
            if (mine[k] == v) continue
            // A value of the wrong kind is skipped, not fatal.
            val candidate = runCatching { full.decodeFromJsonElement(AppSettings.serializer(), kotlinx.serialization.json.JsonObject(asObject(next) + (k to v))) }.getOrNull() ?: continue
            next = candidate; changed++
        }
        if (changed > 0) update { next }
        return changed
    }

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

/** The look of one side of a conversation: its shape, roundness and the line around it. */
data class SideLook(val style: String, val radius: Int, val border: String, val borderColor: String)

/** Incoming bubbles use the plain settings; outgoing ones use their own where set, and otherwise follow the incoming side. */
fun AppSettings.look(mine: Boolean): SideLook =
    if (!mine) SideLook(bubbleStyle, bubbleRadius, bubbleBorder, bubbleBorderColor)
    else SideLook(outStyle.ifEmpty { bubbleStyle }, if (outRadius < 0) bubbleRadius else outRadius, outBorder.ifEmpty { bubbleBorder }, outBorderColor.ifEmpty { bubbleBorderColor })

/** The colour you chose for a side's bubbles and for the text on them, for the light or dark theme. Null means follow the theme. */
fun AppSettings.bubbleColors(mine: Boolean, dark: Boolean): Pair<androidx.compose.ui.graphics.Color?, androidx.compose.ui.graphics.Color?> {
    val (c, cd, t, td) = if (mine) listOf(bubbleMine, bubbleMineDark, bubbleMineText, bubbleMineTextDark) else listOf(bubbleTheirs, bubbleTheirsDark, bubbleTheirsText, bubbleTheirsTextDark)
    return (if (dark) parseHex(cd) ?: parseHex(c) else parseHex(c)) to (if (dark) parseHex(td) ?: parseHex(t) else parseHex(t))
}

/** The bubble shapes are now Beeper's three (rounded, curved tail, pointed tail) and Outlined. Older shapes become the nearest one. */
fun migrateBubbleStyle(style: String): String = when (style) { "round", "curved", "tail", "outline" -> style; "cloud" -> "curved"; else -> "round" }
