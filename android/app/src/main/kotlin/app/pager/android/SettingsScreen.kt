@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package app.pager.android

import android.content.Intent
import android.os.Build
import android.provider.Settings as AndroidSettings
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// ---- Building blocks ---------------------------------------------------------------

@Composable
fun SettingsPage(title: String, onBack: () -> Unit, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹", fontSize = 28.sp) }
            Text(title, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 32.dp)) { content() }
    }
}

@Composable
fun SectionHeader(text: String) {
    Text(text.uppercase(), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(start = 20.dp, top = 22.dp, bottom = 4.dp))
}

@Composable
fun SwitchRow(title: String, subtitle: String? = null, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(enabled = enabled) { onChange(!checked) }.padding(horizontal = 20.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
            if (subtitle != null) Text(subtitle, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked, onChange, enabled = enabled)
    }
}

@Composable
fun NavRow(title: String, subtitle: String? = null, icon: String? = null, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 20.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        if (icon != null) Text(icon, fontSize = 20.sp, modifier = Modifier.width(36.dp))
        Column(Modifier.weight(1f)) {
            Text(title)
            if (subtitle != null) Text(subtitle, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text("›", fontSize = 20.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun ChoiceRow(title: String, options: List<Pair<String, String>>, current: String, onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth().clickable { open = true }.padding(horizontal = 20.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, Modifier.weight(1f))
        Text(options.firstOrNull { it.first == current }?.second ?: current, color = MaterialTheme.colorScheme.primary)
    }
    if (open) AlertDialog(
        onDismissRequest = { open = false },
        title = { Text(title) },
        text = {
            Column {
                options.forEach { (value, label) ->
                    Row(Modifier.fillMaxWidth().clickable { onPick(value); open = false }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(value == current, { onPick(value); open = false })
                        Text(label, Modifier.padding(start = 8.dp))
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = { open = false }) { Text("Close") } },
    )
}

@Composable
fun SliderRow(title: String, value: Float, range: ClosedFloatingPointRange<Float>, label: String, onChange: (Float) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp)) {
        Row { Text(title, Modifier.weight(1f)); Text(label, color = MaterialTheme.colorScheme.primary) }
        Slider(value, onChange, valueRange = range)
    }
}

// ---- Pages ---------------------------------------------------------------------------

/** Settings live under the "settings" screen id; sub-pages are "settings/<page>". */
@Composable
fun SettingsScreen(page: String, navigate: (String) -> Unit, onBack: () -> Unit) {
    val store = LocalStore.current
    val s = LocalSettings.current
    val set = store.settings::update
    when (page) {
        "" -> SettingsPage("Settings", onBack) {
            NavRow("Appearance", "Theme, colors, text size, bubbles, reactions", "🎨") { navigate("appearance") }
            NavRow("Layout", "Chat list density, swipe actions, what's shown", "🧩") { navigate("layout") }
            NavRow("Chats", "Sending, receipts, link previews, media", "💬") { navigate("chats") }
            NavRow("Notifications", "Previews, sound, quiet hours, per-network", "🔔") { navigate("notifications") }
            NavRow("Bridges & accounts", "Connected apps, status, hide networks", "🔗") { navigate("bridges") }
            NavRow("Privacy & security", "App lock, hide in recents", "🔒") { navigate("privacy") }
            NavRow("Starred messages", null, "⭐") { navigate("starred") }
            NavRow("Scheduled & reminders", null, "⏰") { navigate("scheduled") }
            NavRow("Storage", "Cache and reset", "💾") { navigate("storage") }
            NavRow("About", "Version, server, sign out", "ℹ️") { navigate("about") }
        }

        "appearance" -> SettingsPage("Appearance", { navigate("") }) {
            SectionHeader("Theme")
            ChoiceRow("Mode", listOf("system" to "Follow system", "light" to "Light", "dark" to "Dark", "black" to "Black (AMOLED)"), s.themeMode) { v -> set { copy(themeMode = v) } }
            Text("Accent color", Modifier.padding(start = 20.dp, top = 12.dp, bottom = 8.dp))
            Row(Modifier.padding(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                ACCENTS.forEach { (name, c) ->
                    Box(
                        Modifier.size(38.dp).clip(CircleShape).background(c[0]).clickable { set { copy(accent = name) } },
                        contentAlignment = Alignment.Center,
                    ) { if (s.accent == name) Text("✓", color = c[2], fontWeight = FontWeight.Bold) }
                }
                if (Build.VERSION.SDK_INT >= 31) Box(
                    Modifier.size(38.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant).clickable { set { copy(accent = "dynamic") } },
                    contentAlignment = Alignment.Center,
                ) { Text(if (s.accent == "dynamic") "✓" else "🪄", fontSize = 14.sp) }
            }
            SectionHeader("Text & messages")
            SliderRow("Text size", s.fontScale, 0.85f..1.4f, "${(s.fontScale * 100).toInt()}%") { v -> set { copy(fontScale = (v * 20).toInt() / 20f) } }
            ChoiceRow("Bubble style", listOf("round" to "Rounded", "soft" to "Extra round", "square" to "Square"), s.bubbleStyle) { v -> set { copy(bubbleStyle = v) } }
            ChoiceRow("Chat wallpaper", listOf("none" to "None", "dusk" to "Dusk", "forest" to "Forest", "ocean" to "Ocean", "sand" to "Sand", "graphite" to "Graphite"), s.wallpaper) { v -> set { copy(wallpaper = v) } }
            ChoiceRow("Time format", listOf("system" to "Follow system", "12" to "12-hour", "24" to "24-hour"), s.timeFormat) { v -> set { copy(timeFormat = v) } }
            SwitchRow("Color sender names in groups", checked = s.colorSenderNames) { v -> set { copy(colorSenderNames = v) } }
            SectionHeader("Reactions")
            SwitchRow("Double-tap to react", "Double-tap a message to add your first quick reaction", s.doubleTapReact) { v -> set { copy(doubleTapReact = v) } }
            QuickReactionsEditor()
        }

        "layout" -> SettingsPage("Layout", { navigate("") }) {
            SectionHeader("Chat list")
            ChoiceRow("Density", listOf("comfortable" to "Comfortable", "compact" to "Compact"), s.density) { v -> set { copy(density = v) } }
            SwitchRow("Show avatars", checked = s.showAvatars) { v -> set { copy(showAvatars = v) } }
            SwitchRow("Show network badges", "The small WhatsApp/Signal/… icon on avatars", s.showNetworkBadges) { v -> set { copy(showNetworkBadges = v) } }
            SwitchRow("Show network name", "Under each chat name", s.showNetworkNameInRows) { v -> set { copy(showNetworkNameInRows = v) } }
            SwitchRow("Show message previews", checked = s.showPreviews) { v -> set { copy(showPreviews = v) } }
            SwitchRow("Show filter bar", "Unread, Groups, Favorites and network filters", s.showFilterBar) { v -> set { copy(showFilterBar = v) } }
            SectionHeader("Swipe actions")
            val swipe = listOf("none" to "Nothing", "archive" to "Archive", "read" to "Mark read / unread", "pin" to "Pin", "mute" to "Mute")
            ChoiceRow("Swipe right", swipe, s.swipeRight) { v -> set { copy(swipeRight = v) } }
            ChoiceRow("Swipe left", swipe, s.swipeLeft) { v -> set { copy(swipeLeft = v) } }
            SectionHeader("Conversation")
            SwitchRow("Show message times", checked = s.showMessageTimes) { v -> set { copy(showMessageTimes = v) } }
            SwitchRow("Show delivery & read ticks", checked = s.showReadTicks) { v -> set { copy(showReadTicks = v) } }
        }

        "chats" -> SettingsPage("Chats", { navigate("") }) {
            SectionHeader("Sending")
            SwitchRow("Enter key sends", "Off: Enter adds a new line", s.enterToSend) { v -> set { copy(enterToSend = v) } }
            SwitchRow("Mention suggestions", "Type @ in a group to pick someone", s.mentionSuggestions) { v -> set { copy(mentionSuggestions = v) } }
            SectionHeader("Privacy")
            SwitchRow("Send read receipts", "Off: others won't see when you've read their messages", s.sendReadReceipts) { v -> set { copy(sendReadReceipts = v) } }
            SwitchRow("Send typing indicators", checked = s.sendTyping) { v -> set { copy(sendTyping = v) } }
            SectionHeader("Media & links")
            SwitchRow("Link previews", "Your server fetches the page to build the preview", s.linkPreviews) { v -> set { copy(linkPreviews = v) } }
            ChoiceRow("Auto-download media", listOf("always" to "Always", "wifi" to "On Wi-Fi only", "never" to "Never (tap to load)"), s.autoDownload) { v -> set { copy(autoDownload = v) } }
            SectionHeader("Inbox behavior")
            SwitchRow("Unarchive on new message", "Archived chats come back when someone writes (unless muted)", s.unarchiveOnMessage) { v -> set { copy(unarchiveOnMessage = v) } }
            SwitchRow("Confirm before deleting", checked = s.confirmDelete) { v -> set { copy(confirmDelete = v) } }
        }

        "notifications" -> NotificationSettings(navigate)
        "bridges" -> BridgesScreen(onBack = { navigate("") })
        "privacy" -> SettingsPage("Privacy & security", { navigate("") }) {
            SectionHeader("App lock")
            SwitchRow("Require fingerprint / screen lock", "Pager asks you to unlock it when you open it", s.appLock) { v -> set { copy(appLock = v) } }
            if (s.appLock) ChoiceRow("Lock after", listOf("0" to "Immediately", "30" to "30 seconds", "120" to "2 minutes", "600" to "10 minutes"), s.lockAfterSec.toString()) { v -> set { copy(lockAfterSec = v.toInt()) } }
            SectionHeader("Screen")
            SwitchRow("Hide in recent apps & block screenshots", checked = s.hideInRecents) { v -> set { copy(hideInRecents = v) } }
            SectionHeader("Receipts")
            SwitchRow("Send read receipts", checked = s.sendReadReceipts) { v -> set { copy(sendReadReceipts = v) } }
            SwitchRow("Send typing indicators", checked = s.sendTyping) { v -> set { copy(sendTyping = v) } }
        }
        "starred" -> StarredScreen(onBack = { navigate("") }, onOpen = { navigate("open:$it") })
        "scheduled" -> ScheduledScreen(onBack = { navigate("") })
        "storage" -> StorageSettings(navigate)
        "about" -> AboutSettings(navigate)
        else -> SettingsPage("Settings", onBack) { }
    }
}

@Composable
private fun QuickReactionsEditor() {
    val store = LocalStore.current
    val s = LocalSettings.current
    var editing by remember { mutableStateOf<Int?>(null) }
    Text("Quick reactions", Modifier.padding(start = 20.dp, top = 12.dp))
    Text("The emoji shown first when you long-press a message. Tap one to change it.", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 20.dp, vertical = 2.dp))
    Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        s.quickReactions.forEachIndexed { i, e ->
            Box(Modifier.size(46.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant).clickable { editing = i }, contentAlignment = Alignment.Center) { Text(e, fontSize = 24.sp) }
        }
    }
    TextButton(onClick = { store.settings.update { copy(quickReactions = DEFAULT_QUICK_REACTIONS) } }, Modifier.padding(horizontal = 12.dp)) { Text("Reset to defaults") }
    editing?.let { idx ->
        EmojiPickerDialog(s.recentEmoji, onPick = { e ->
            store.settings.update { copy(quickReactions = quickReactions.toMutableList().also { it[idx] = e }) }
            editing = null
        }, onDismiss = { editing = null })
    }
}

@Composable
private fun NotificationSettings(navigate: (String) -> Unit) {
    val store = LocalStore.current
    val s = LocalSettings.current
    val set = store.settings::update
    val context = LocalContext.current
    var picking by remember { mutableStateOf<String?>(null) }
    SettingsPage("Notifications", { navigate("") }) {
        SwitchRow("Notifications", "Master switch for message alerts", s.notifEnabled) { v -> set { copy(notifEnabled = v) } }
        SectionHeader("Content")
        ChoiceRow("Show", listOf("full" to "Name and message", "sender" to "Name only", "hidden" to "Hide content"), s.notifPreview, enabledAware(s)) { v -> set { copy(notifPreview = v) } }
        SwitchRow("Reply & Mark read buttons", "Act on a message right from the notification", s.notifActions, s.notifEnabled) { v -> set { copy(notifActions = v) } }
        SectionHeader("Alerts")
        SwitchRow("Sound", checked = s.notifSound, enabled = s.notifEnabled) { v -> set { copy(notifSound = v) } }
        SwitchRow("Vibrate", checked = s.notifVibrate, enabled = s.notifEnabled) { v -> set { copy(notifVibrate = v) } }
        SwitchRow("Groups: only when mentioned", "Group chats stay quiet unless someone @mentions you", s.notifGroupMentionsOnly, s.notifEnabled) { v -> set { copy(notifGroupMentionsOnly = v) } }
        SectionHeader("Quiet hours")
        SwitchRow("Quiet hours", "Messages arrive silently during this time", s.quietHoursEnabled, s.notifEnabled) { v -> set { copy(quietHoursEnabled = v) } }
        if (s.quietHoursEnabled) {
            TimeRow("From", s.quietStartMin) { picking = "start" }
            TimeRow("Until", s.quietEndMin) { picking = "end" }
        }
        SectionHeader("Per network")
        val known = listOf("whatsapp", "signal", "telegram", "discord", "instagram", "messenger", "gmessages")
        known.forEach { id ->
            SwitchRow(networkMeta(id).label, null, id !in s.notifMutedNetworks, s.notifEnabled) { on ->
                set { copy(notifMutedNetworks = if (on) notifMutedNetworks - id else notifMutedNetworks + id) }
            }
        }
        SectionHeader("System")
        Button(onClick = {
            context.startActivity(Intent(AndroidSettings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(AndroidSettings.EXTRA_APP_PACKAGE, context.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }, Modifier.padding(horizontal = 20.dp)) { Text("Open Android notification settings") }
    }
    picking?.let { which ->
        val initial = if (which == "start") s.quietStartMin else s.quietEndMin
        val state = rememberTimePickerState(initial / 60, initial % 60, is24Hour = false)
        AlertDialog(
            onDismissRequest = { picking = null },
            confirmButton = { TextButton(onClick = { val m = state.hour * 60 + state.minute; set { if (which == "start") copy(quietStartMin = m) else copy(quietEndMin = m) }; picking = null }) { Text("OK") } },
            dismissButton = { TextButton(onClick = { picking = null }) { Text("Cancel") } },
            text = { TimePicker(state) },
        )
    }
}

private fun enabledAware(s: AppSettings) = s.notifEnabled

@Composable
private fun ChoiceRow(title: String, options: List<Pair<String, String>>, current: String, enabled: Boolean, onPick: (String) -> Unit) {
    if (enabled) ChoiceRow(title, options, current, onPick)
    else Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp)) {
        Text(title, Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(options.firstOrNull { it.first == current }?.second ?: "", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun TimeRow(label: String, minutes: Int, onClick: () -> Unit) {
    val h = minutes / 60; val m = minutes % 60
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 20.dp, vertical = 12.dp)) {
        Text(label, Modifier.weight(1f))
        Text("%d:%02d %s".format(if (h % 12 == 0) 12 else h % 12, m, if (h < 12) "AM" else "PM"), color = MaterialTheme.colorScheme.primary)
    }
}

@Composable
private fun StorageSettings(navigate: (String) -> Unit) {
    val store = LocalStore.current
    var size by remember { mutableStateOf(store.cacheSize()) }
    var confirmReset by remember { mutableStateOf(false) }
    SettingsPage("Storage", { navigate("") }) {
        SectionHeader("Cache")
        Text("Downloaded photos, videos and files: ${humanSize(size)}", Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
        Button(onClick = { store.clearCache(); size = store.cacheSize() }, Modifier.padding(horizontal = 20.dp)) { Text("Clear media cache") }
        SectionHeader("Reset")
        Text("Puts every setting back to its default. Your chats and accounts aren't touched.", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp))
        Button(onClick = { confirmReset = true }, Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) { Text("Reset all settings") }
    }
    if (confirmReset) AlertDialog(
        onDismissRequest = { confirmReset = false }, title = { Text("Reset all settings?") },
        confirmButton = { TextButton(onClick = { store.settings.reset(); confirmReset = false }) { Text("Reset") } },
        dismissButton = { TextButton(onClick = { confirmReset = false }) { Text("Cancel") } },
    )
}

@Composable
private fun AboutSettings(navigate: (String) -> Unit) {
    val store = LocalStore.current
    val session = store.session.collectAsState().value
    SettingsPage("About", { navigate("") }) {
        SectionHeader("Pager")
        Text("Version ${BuildConfigVersion.NAME}", Modifier.padding(horizontal = 20.dp, vertical = 4.dp))
        Text("An open-source, self-hosted unified messenger.", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 20.dp))
        SectionHeader("Account")
        Text(session?.userId ?: "", Modifier.padding(horizontal = 20.dp, vertical = 4.dp))
        Text(session?.baseUrl ?: "", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 20.dp))
        Spacer(Modifier.height(16.dp))
        Button(onClick = { store.signOut() }, Modifier.padding(horizontal = 20.dp)) { Text("Sign out") }
    }
}

object BuildConfigVersion { const val NAME = "0.2.0" }
