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
    /** How dark E-ink text and lines are, from 1 (dark gray) to 4 (pure black). Darker, never thicker. */
    val einkDark: Int = 4,
    /** A quick white flash that clears ghosting on e-ink: off | chats (when opening or leaving a chat) | timed. */
    val screenClean: String = "off",
    val screenCleanSec: Int = 20,
    val palette: String = "none",              // a ready-made look (see Palettes.kt), or none
    val fontFamily: String = "system",
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
    val imageQuality: String = "original",     // original | high
    val swipeToReply: Boolean = true,
    val greetings: Boolean = true,            // a silly pager message when the app opens
    val groupGapMin: Int = 5,
    val markReadMode: String = "scrolled",     // open | scrolled | manual
    /** Open a chat at its 'New messages' line instead of at the newest message. */
    val openAtUnread: Boolean = false,
    val gifProvider: String = "giphy",         // giphy | tenor
    val gifKey: String = "",
    val quickReactions: List<String> = DEFAULT_QUICK_REACTIONS,
    val recentEmoji: List<String> = emptyList(),

    // --- Notifications ---
    val notifEnabled: Boolean = true,
    val notifPreview: String = "full",         // full | sender | hidden
    val notifSound: Boolean = true,
    /** Sounds for sending and receiving, only while you are inside that page. */
    val convoSounds: Boolean = true,
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
    private val _state = MutableStateFlow(load())
    val state: StateFlow<AppSettings> = _state.asStateFlow()
    val value get() = _state.value

    private fun load(): AppSettings = runCatching {
        json.decodeFromString(AppSettings.serializer(), prefs.getString("json", null) ?: return@runCatching AppSettings())
    }.getOrDefault(AppSettings())

    // ---- Settings that follow your account ----------------------------------------------------
    // Phone settings are kept in your Matrix account data (separately from the web and desktop apps), so a new phone gets
    // your layout back. Device security and keys stay on the device.
    private val full = kotlinx.serialization.json.Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val excluded = setOf("appLock", "lockAfterSec", "hideInRecents", "gifKey")
    var updatedAt: Long = prefs.getLong("updatedAt", 0L)
        private set

    // Most settings (look, behaviour, notification rules) are the same on every device: each one is saved in your account with the time it last
    // changed, and the newest change wins, so changing a setting anywhere changes it everywhere. What only makes sense on one device stays on it.
    companion object {
        val SHARED_KEYS = setOf("themeMode", "accent", "accentCustom", "fontScale", "fontFamily", "palette", "bubbleStyle", "bubbleFill", "bubbleDepth", "messageAnimation", "screenEffects", "wallpaper", "timeFormat", "colorSenderNames", "avatarShape", "largeEmoji", "quickReactions", "doubleTapReact", "swipeToReply", "reactionStyle", "hideStories", "deleteAtSource", "autoTranscribe", "markdown", "mentionSuggestions", "greetings", "confirmDelete", "openAtUnread", "markReadMode", "groupGapMin", "hiddenNetworks", "inboxStyle", "defaultTab", "showAvatars", "showFilterBar", "showLabelsInFilterBar", "showMessageTimes", "showNetworkBadges", "showNetworkNameInRows", "showPinsRow", "showPreviews", "showReadTicks", "sortUnreadFirst", "unarchiveOnMessage", "linkPreviews", "autoDownload", "autoPlayGifs", "sendReadReceipts", "sendTyping", "gifProvider", "convoSounds", "sendSound", "receiveSound", "reactionSound", "notifEnabled", "notifPreview", "notifSound", "notifScope", "notifGroupMentionsOnly", "notifMutedNetworks", "notifNetworkMode", "notifKeywords", "notifQuietDays", "notifQuietBreakThrough", "notifDelaySec", "notifDirectMode", "notifGroupMode", "quietHoursEnabled", "quietStartMin", "quietEndMin")
        const val SHARED_TYPE = "app.pager.settings.shared"
    }
    private val stamps: MutableMap<String, Long> = (runCatching { json.parseToJsonElement(prefs.getString("stamps", "{}") ?: "{}").jsonObject.mapNotNull { (k, v) -> (v as? kotlinx.serialization.json.JsonPrimitive)?.longOrNull?.let { k to it } }.toMap() }.getOrNull() ?: emptyMap()).toMutableMap()
    /** What the account held for the shared settings the last time we saw it, so a save never wipes another device's newer choice. */
    private var remoteShared: Map<String, Pair<kotlinx.serialization.json.JsonElement, Long>> = emptyMap()
    private fun saveStamps() { prefs.edit().putString("stamps", kotlinx.serialization.json.JsonObject(stamps.mapValues { kotlinx.serialization.json.JsonPrimitive(it.value) }).toString()).apply() }
    private fun asObject(s: AppSettings) = full.encodeToJsonElement(AppSettings.serializer(), s).jsonObject

    fun sharedPayload(): kotlinx.serialization.json.JsonObject {
        val mine = asObject(_state.value)
        val out = LinkedHashMap<String, Pair<kotlinx.serialization.json.JsonElement, Long>>(remoteShared)
        for (k in SHARED_KEYS) { val t = stamps[k] ?: continue; val v = mine[k] ?: continue; if (t >= (out[k]?.second ?: 0L)) out[k] = v to t }
        return kotlinx.serialization.json.buildJsonObject {
            put("v", 2)
            put("keys", kotlinx.serialization.json.JsonObject(out.mapValues { (_, e) -> kotlinx.serialization.json.buildJsonObject { put("v", e.first); put("t", e.second) } }))
        }
    }

    /** First time on a device with choices of its own and an account with none shared yet: its non-default choices become the shared ones, dated when they were last changed. */
    fun seedSharedStamps() {
        if (SHARED_KEYS.any { stamps.containsKey(it) }) return
        val mine = asObject(_state.value); val defaults = asObject(AppSettings())
        for (k in SHARED_KEYS) if (mine[k] != defaults[k]) stamps[k] = if (updatedAt > 0) updatedAt else System.currentTimeMillis()
        saveStamps()
    }

    /** Takes newer shared settings from the account. Returns (something changed here, we hold something newer than the account). */
    fun applyRemoteShared(content: kotlinx.serialization.json.JsonObject?): Pair<Boolean, Boolean> {
        val keys = content?.get("keys") as? kotlinx.serialization.json.JsonObject ?: return false to SHARED_KEYS.any { stamps.containsKey(it) }
        val remote = HashMap<String, Pair<kotlinx.serialization.json.JsonElement, Long>>()
        var next = _state.value
        var changed = false
        for ((k, e) in keys) {
            val o = e as? kotlinx.serialization.json.JsonObject ?: continue
            val t = (o["t"] as? kotlinx.serialization.json.JsonPrimitive)?.longOrNull ?: continue
            val v = o["v"] ?: continue
            if (k !in SHARED_KEYS) continue
            remote[k] = v to t
            if (t > (stamps[k] ?: 0L)) {
                // A value of the wrong kind (another app's idea of this setting) is skipped, not fatal.
                val candidate = runCatching { full.decodeFromJsonElement(AppSettings.serializer(), kotlinx.serialization.json.JsonObject(asObject(next) + (k to v))) }.getOrNull()
                if (candidate != null) { if (candidate != next) changed = true; next = candidate; stamps[k] = t }
            }
        }
        remoteShared = remote
        val ahead = SHARED_KEYS.any { (stamps[it] ?: 0L) > (remote[it]?.second ?: 0L) }
        if (changed) { _state.value = next; prefs.edit().putString("json", json.encodeToString(AppSettings.serializer(), next)).apply() }
        saveStamps()
        return changed to ahead
    }
    /** Called after the user changes a setting here (not when settings arrive from the account). */
    var onLocalChange: (() -> Unit)? = null

    fun payload(): kotlinx.serialization.json.JsonObject = kotlinx.serialization.json.buildJsonObject {
        put("v", 1)
        put("updatedAt", updatedAt)
        put("settings", kotlinx.serialization.json.JsonObject(full.encodeToJsonElement(AppSettings.serializer(), _state.value).jsonObject.filterKeys { it !in excluded && it !in SHARED_KEYS }))
    }

    /** Applies settings saved in the account if they are newer than ours. Returns whether anything changed. */
    fun applyRemote(content: kotlinx.serialization.json.JsonObject): Boolean {
        val at = (content["updatedAt"] as? kotlinx.serialization.json.JsonPrimitive)?.longOrNull ?: return false
        if (at <= updatedAt) return false
        val remote = content["settings"] as? kotlinx.serialization.json.JsonObject ?: return false
        val merged = kotlinx.serialization.json.JsonObject(full.encodeToJsonElement(AppSettings.serializer(), _state.value).jsonObject + remote.filterKeys { it !in excluded && it !in SHARED_KEYS })
        val next = runCatching { full.decodeFromJsonElement(AppSettings.serializer(), merged) }.getOrNull() ?: return false
        _state.value = next
        updatedAt = at
        prefs.edit().putString("json", json.encodeToString(AppSettings.serializer(), next)).putLong("updatedAt", at).apply()
        return true
    }

    fun update(f: AppSettings.() -> AppSettings) {
        val next = _state.value.f()
        val before = asObject(_state.value); val after = asObject(next); val now = System.currentTimeMillis()
        for (k in SHARED_KEYS) if (before[k] != after[k]) stamps[k] = now
        saveStamps()
        _state.value = next
        updatedAt = System.currentTimeMillis()
        prefs.edit().putString("json", json.encodeToString(AppSettings.serializer(), next)).putLong("updatedAt", updatedAt).apply()
        onLocalChange?.invoke()
    }

    fun reset() = update { AppSettings() }
}

/** Is [minuteOfDay] inside a quiet-hours window that may wrap midnight? */
fun inQuietHours(s: AppSettings, minuteOfDay: Int): Boolean {
    if (!s.quietHoursEnabled || s.quietStartMin == s.quietEndMin) return false
    return if (s.quietStartMin < s.quietEndMin) minuteOfDay in s.quietStartMin until s.quietEndMin
    else minuteOfDay >= s.quietStartMin || minuteOfDay < s.quietEndMin
}
