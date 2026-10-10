@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package app.pager.android

import androidx.compose.material.icons.rounded.AdminPanelSettings
import androidx.compose.material.icons.rounded.Close
import androidx.compose.foundation.layout.FlowRow
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings as AndroidSettings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Label
import androidx.compose.material.icons.rounded.AccessTime
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Archive
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Chat
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.EmojiEmotions
import androidx.compose.material.icons.rounded.Gif
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.Palette
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.Storage
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.VpnKey
import androidx.compose.material.icons.rounded.Key
import androidx.compose.material.icons.rounded.FileOpen
import androidx.compose.material.icons.rounded.Save
import androidx.compose.material.icons.rounded.Help
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

// ---- Building blocks -------------------------------------------------------------------

@Composable
fun SettingsPage(title: String, onBack: () -> Unit, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        TopBar(title, onBack)
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 40.dp)) { content() }
    }
}

@Composable
fun SectionHeader(text: String) {
    Text(text.uppercase(), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(start = 20.dp, top = 20.dp, bottom = 4.dp))
}

@Composable
fun SwitchRow(title: String, subtitle: String? = null, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(enabled = enabled) { onChange(!checked) }.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f).padding(end = 12.dp)) {
            Text(title, color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked, onChange, enabled = enabled)
    }
}

@Composable
fun NavRow(title: String, subtitle: String? = null, icon: ImageVector? = null, tint: Color = MaterialTheme.colorScheme.primary, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        if (icon != null) { IconTile(icon, tint); Spacer(Modifier.width(14.dp)) }
        Column(Modifier.weight(1f)) {
            Text(title)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        ChevronEnd()
    }
}

@Composable
fun ChoiceRow(title: String, options: List<Pair<String, String>>, current: String, enabled: Boolean = true, onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth().clickable(enabled = enabled) { open = true }.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, Modifier.weight(1f), color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
        Text(options.firstOrNull { it.first == current }?.second ?: current, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.width(2.dp)); ChevronEnd()
    }
    if (open) Sheet(onDismiss = { open = false }) {
        SheetTitle(title)
        options.forEach { (value, label) ->
            Row(Modifier.fillMaxWidth().clickable { onPick(value); open = false }.padding(horizontal = 24.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
                if (value == current) Icon(Icons.Rounded.Check, null, tint = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

@Composable
fun SliderRow(title: String, value: Float, range: ClosedFloatingPointRange<Float>, label: String, onChange: (Float) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        Row { Text(title, Modifier.weight(1f)); Text(label, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodyMedium) }
        Slider(value, onChange, valueRange = range)
    }
}

@Composable
fun TextFieldRow(title: String, value: String, placeholder: String, secret: Boolean = false, onChange: (String) -> Unit) {
    var v by remember(value) { mutableStateOf(value) }
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp)) {
        Text(title, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedTextField(
            v, { v = it; onChange(it.trim()) }, singleLine = true, placeholder = { Text(placeholder) }, modifier = Modifier.fillMaxWidth(),
            visualTransformation = if (secret) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
            keyboardOptions = KeyboardOptions(keyboardType = if (secret) KeyboardType.Password else KeyboardType.Text),
        )
    }
}

@Composable
fun ButtonRow(label: String, danger: Boolean = false, onClick: () -> Unit) {
    Text(label, color = if (danger) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary, fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 14.dp))
}

// ---- Search index (the command-bar style "find a setting") ------------------------------

data class SettingEntry(val page: String, val title: String, val where: String, val keywords: String = "")

val SETTINGS_INDEX = listOf(
    SettingEntry("appearance", "Theme mode", "Appearance", "dark light amoled black system"),
    SettingEntry("appearance", "Accent color", "Appearance", "colour material you dynamic"),
    SettingEntry("appearance", "E-ink mode", "Appearance", "eink e-ink epaper boox high contrast black white"),
    SettingEntry("appearance", "Display size", "Appearance", "scale zoom interface bigger smaller screen"),
    SettingEntry("appearance", "Small screen layout", "Appearance", "compact tiny watch"),
    SettingEntry("appearance", "Text size", "Appearance", "font zoom bigger smaller accessibility"),
    SettingEntry("appearance", "Bubble style", "Appearance", "rounded square"),
    SettingEntry("appearance", "Page wallpaper", "Appearance", "background"),
    SettingEntry("appearance", "Time format", "Appearance", "12 24 hour clock"),
    SettingEntry("appearance", "Avatar shape", "Appearance", "circle squircle"),
    SettingEntry("appearance", "Large emoji", "Appearance", "big emoji only"),
    SettingEntry("appearance", "Quick reactions", "Appearance", "emoji reactions favorites"),
    SettingEntry("appearance", "Double-tap to react", "Appearance", "like heart"),
    SettingEntry("appearance", "Reduce motion", "Appearance", "animations accessibility"),
    SettingEntry("layout", "Inbox style", "Inbox & layout", "minimal pro compact titles only"),
    SettingEntry("layout", "Density", "Inbox & layout", "compact comfortable spacing"),
    SettingEntry("layout", "Pinned pages row", "Inbox & layout", "pins favorites circles"),
    SettingEntry("layout", "Unread pages first", "Inbox & layout", "sort order"),
    SettingEntry("layout", "Default tab", "Inbox & layout", "start unread inbox"),
    SettingEntry("layout", "Swipe actions", "Inbox & layout", "gestures archive read mute pin"),
    SettingEntry("layout", "Network badges", "Inbox & layout", "icons whatsapp signal"),
    SettingEntry("layout", "Message previews", "Inbox & layout", "snippet"),
    SettingEntry("layout", "Filter bar", "Inbox & layout", "tabs labels"),
    SettingEntry("layout", "Read ticks", "Inbox & layout", "delivered seen"),
    SettingEntry("chats", "Enter key sends", "Pages", "return newline keyboard"),
    SettingEntry("chats", "Markdown formatting", "Pages", "bold italic code strikethrough"),
    SettingEntry("chats", "Swipe to reply", "Pages", "gesture"),
    SettingEntry("chats", "Message grouping", "Pages", "gap minutes consecutive"),
    SettingEntry("chats", "Mark as read when", "Pages", "open scroll manual"),
    SettingEntry("chats", "Open at first unread", "Pages", "jump"),
    SettingEntry("chats", "Send read receipts", "Pages", "privacy seen"),
    SettingEntry("chats", "Send typing indicators", "Pages", "privacy typing"),
    SettingEntry("chats", "Link previews", "Pages", "url cards"),
    SettingEntry("chats", "Auto-download media", "Pages", "wifi data photos"),
    SettingEntry("chats", "Auto-play GIFs", "Pages", "animated"),
    SettingEntry("chats", "Image upload quality", "Pages", "compress original"),
    SettingEntry("chats", "Unarchive on new message", "Pages", "archive returns"),
    SettingEntry("chats", "Confirm before deleting", "Pages", "delete"),
    SettingEntry("notifications", "Notifications", "Notifications", "master alerts"),
    SettingEntry("notifications", "Notification content", "Notifications", "preview hide sender"),
    SettingEntry("notifications", "Notify me about", "Notifications", "scope all dms mentions favorites"),
    SettingEntry("notifications", "Quiet hours", "Notifications", "do not disturb night silent"),
    SettingEntry("notifications", "Keywords", "Notifications", "words names always notify"),
    SettingEntry("notifications", "Wait before alerting", "Notifications", "delay read elsewhere"),
    SettingEntry("notifications", "On the lock screen", "Notifications", "private hide content visibility"),
    SettingEntry("notifications", "Test notification", "Notifications", "try check"),
    SettingEntry("notifications", "Sound", "Notifications", "tone ringtone"),
    SettingEntry("notifications", "Vibrate", "Notifications", "haptic"),
    SettingEntry("notifications", "Reply and Mark read buttons", "Notifications", "actions"),
    SettingEntry("notifications", "Per-network notifications", "Notifications", "whatsapp signal telegram"),
    SettingEntry("bridges", "Bridges & accounts", "Bridges", "connect disconnect whatsapp signal login status"),
    SettingEntry("bridges", "Hide a network from the inbox", "Bridges", "visibility"),
    SettingEntry("media", "GIF search key", "Stickers & GIFs", "giphy tenor api"),
    SettingEntry("media", "My stickers", "Stickers & GIFs", "add import packs"),
    SettingEntry("labels", "Labels", "Labels", "folders organize tags"),
    SettingEntry("privacy", "Encryption", "Privacy & security", "recovery key backup encrypt end-to-end e2ee key file lock"),
    SettingEntry("privacy", "Recovery key", "Privacy & security", "lost forgot backup history new device restore"),
    SettingEntry("privacy", "Encrypt all my pages", "Privacy & security", "turn on encryption convert"),
    SettingEntry("privacy", "App lock", "Privacy & security", "biometric fingerprint pin"),
    SettingEntry("privacy", "Hide in recent apps", "Privacy & security", "screenshots secure"),
    SettingEntry("storage", "Clear media cache", "Storage", "free space"),
    SettingEntry("storage", "Export / import settings", "Storage", "backup restore"),
    SettingEntry("storage", "Reset all settings", "Storage", "defaults"),
    SettingEntry("advanced", "Developer mode", "Advanced", "event ids source debug"),
    SettingEntry("advanced", "Background sync", "Advanced", "battery service"),
    SettingEntry("advanced", "Battery optimization", "Advanced", "doze"),
    SettingEntry("starred", "Starred messages", "Saved", "bookmarks"),
    SettingEntry("scheduled", "Scheduled messages & reminders", "Saved", "send later snooze"),
    SettingEntry("about", "About / sign out", "About", "version server account logout"),
)

// ---- Pages -----------------------------------------------------------------------------------

/** Settings live under the "settings" screen id; sub-pages are "settings/<page>". */
@Composable
fun SettingsScreen(page: String, navigate: (String) -> Unit, onBack: () -> Unit) {
    val store = LocalStore.current
    val s = LocalRawSettings.current
    val set = store.settings::update
    val home = { navigate("") }
    when (page) {
        "" -> SettingsHome(navigate, onBack)
        "appearance" -> SettingsPage("Appearance", home) { AppearancePage() }
        "layout" -> SettingsPage("Inbox & layout", home) {
            SettingsGroup("Inbox") {
                ChoiceRow("Inbox style", listOf("pro" to "Pro: unread counts and network badges", "minimal" to "Minimal: titles only"), s.inboxStyle) { v -> set { copy(inboxStyle = v) } }; GroupDivider()
                ChoiceRow("Default tab", listOf("inbox" to "Inbox", "unread" to "Unread"), s.defaultTab) { v -> set { copy(defaultTab = v) } }; GroupDivider()
                SwitchRow("Pinned pages row", "Pinned pages sit above the list as circles", s.showPinsRow) { v -> set { copy(showPinsRow = v) } }; GroupDivider()
                SwitchRow("Unread pages first", "Unread above read, newest first", s.sortUnreadFirst) { v -> set { copy(sortUnreadFirst = v) } }; GroupDivider()
                SwitchRow("Show filter bar", checked = s.showFilterBar) { v -> set { copy(showFilterBar = v) } }; GroupDivider()
                SwitchRow("Show labels in the filter bar", checked = s.showLabelsInFilterBar, enabled = s.showFilterBar) { v -> set { copy(showLabelsInFilterBar = v) } }
            }
            SettingsGroup("Page list") {
                ChoiceRow("Density", listOf("comfortable" to "Comfortable", "compact" to "Compact"), s.density) { v -> set { copy(density = v) } }; GroupDivider()
                SwitchRow("Show avatars", checked = s.showAvatars) { v -> set { copy(showAvatars = v) } }; GroupDivider()
                SwitchRow("Show network badges", "The small WhatsApp / Signal icon on avatars", s.showNetworkBadges) { v -> set { copy(showNetworkBadges = v) } }; GroupDivider()
                SwitchRow("Show network name", "Under each page name", s.showNetworkNameInRows) { v -> set { copy(showNetworkNameInRows = v) } }; GroupDivider()
                SwitchRow("Show message previews", checked = s.showPreviews) { v -> set { copy(showPreviews = v) } }
            }
            SettingsGroup("Swipe actions", footer = "Swipe a page in the list. Long-press a page to see every action.") {
                val swipe = listOf("none" to "Nothing", "archive" to "Archive", "read" to "Mark read / unread", "pin" to "Pin", "mute" to "Mute", "low" to "Low priority", "snooze" to "Snooze 3 hours")
                ChoiceRow("Swipe right", swipe, s.swipeRight) { v -> set { copy(swipeRight = v) } }; GroupDivider()
                ChoiceRow("Swipe left", swipe, s.swipeLeft) { v -> set { copy(swipeLeft = v) } }
            }
            SettingsGroup("Conversation") {
                SwitchRow("Show message times", checked = s.showMessageTimes) { v -> set { copy(showMessageTimes = v) } }; GroupDivider()
                SwitchRow("Show delivery & read ticks", checked = s.showReadTicks) { v -> set { copy(showReadTicks = v) } }; GroupDivider()
                SwitchRow("Haptic feedback", checked = s.haptics) { v -> set { copy(haptics = v) } }
            }
        }
        "chats" -> SettingsPage("Pages", home) {
            SettingsGroup("Sending") {
                SwitchRow("Enter key sends", "Off: Enter adds a new line", s.enterSends) { v -> set { copy(enterSends = v) } }; GroupDivider()
                SwitchRow("Markdown formatting", "**bold**, _italic_, ~~strike~~ and `code` are sent as formatted text", s.markdown) { v -> set { copy(markdown = v) } }; GroupDivider()
                SwitchRow("Mention suggestions", "Type @ in a group to pick someone", s.mentionSuggestions) { v -> set { copy(mentionSuggestions = v) } }; GroupDivider()
                SwitchRow("Swipe to reply", "Swipe a message to the right", s.swipeToReply) { v -> set { copy(swipeToReply = v) } }; GroupDivider()
                ChoiceRow("Image upload quality", listOf("original" to "Original", "high" to "High (smaller)"), s.imageQuality) { v -> set { copy(imageQuality = v) } }
            }
            SettingsGroup("Reading") {
                ChoiceRow("Mark as read when", listOf("open" to "I open the page", "scrolled" to "I reach the newest message", "manual" to "I do it myself"), s.markReadMode) { v -> set { copy(markReadMode = v) } }; GroupDivider()
                SwitchRow("Open at first unread", "Jump to the 'New messages' line", s.openAtFirstUnread) { v -> set { copy(openAtFirstUnread = v) } }; GroupDivider()
                ChoiceRow("Message grouping", listOf("1" to "Within 1 minute", "5" to "Within 5 minutes", "15" to "Within 15 minutes", "60" to "Within an hour"), s.groupGapMin.toString()) { v -> set { copy(groupGapMin = v.toInt()) } }; GroupDivider()
                SwitchRow("Large emoji", "Emoji-only messages are shown big", s.largeEmoji) { v -> set { copy(largeEmoji = v) } }
            }
            SettingsGroup("Privacy") {
                SwitchRow("Send read receipts", "Off: others won't see when you've read their messages", s.sendReadReceipts) { v -> set { copy(sendReadReceipts = v) } }; GroupDivider()
                SwitchRow("Send typing indicators", checked = s.sendTyping) { v -> set { copy(sendTyping = v) } }
            }
            SettingsGroup("Media & links") {
                SwitchRow("Link previews", "Your server fetches the page to build the preview", s.linkPreviews) { v -> set { copy(linkPreviews = v) } }; GroupDivider()
                ChoiceRow("Auto-download media", listOf("always" to "Always", "wifi" to "On Wi-Fi only", "never" to "Never (tap to load)"), s.autoDownload) { v -> set { copy(autoDownload = v) } }; GroupDivider()
                SwitchRow("Auto-play GIFs", checked = s.autoPlayGifs) { v -> set { copy(autoPlayGifs = v) } }
            }
            SettingsGroup("Inbox behavior") {
                SwitchRow("Unarchive on new message", "Archived pages come back when someone writes (unless muted)", s.unarchiveOnMessage) { v -> set { copy(unarchiveOnMessage = v) } }; GroupDivider()
                SwitchRow("Confirm before deleting", checked = s.confirmDelete) { v -> set { copy(confirmDelete = v) } }
            }
        }
        "notifications" -> NotificationSettings(navigate)
        "bridges" -> BridgesScreen(onBack = home)
        "admin" -> AdminScreen(onBack = home)
        "media" -> StickersAndGifsPage(home)
        "labels" -> LabelsPage(home)
        "privacy" -> SettingsPage("Privacy & security", home) {
            SettingsGroup("App lock") {
                SwitchRow("Require fingerprint / screen lock", "Pager asks you to unlock it when you open it", s.appLock) { v -> set { copy(appLock = v) } }
                if (s.appLock) { GroupDivider(); ChoiceRow("Lock after", listOf("0" to "Immediately", "30" to "30 seconds", "120" to "2 minutes", "600" to "10 minutes"), s.lockAfterSec.toString()) { v -> set { copy(lockAfterSec = v.toInt()) } } }
            }
            SettingsGroup("Screen") { SwitchRow("Hide in recent apps & block screenshots", checked = s.hideInRecents) { v -> set { copy(hideInRecents = v) } } }
            EncryptionGroup()
            SettingsGroup("Receipts") {
                SwitchRow("Send read receipts", checked = s.sendReadReceipts) { v -> set { copy(sendReadReceipts = v) } }; GroupDivider()
                SwitchRow("Send typing indicators", checked = s.sendTyping) { v -> set { copy(sendTyping = v) } }
            }
        }
        "starred" -> StarredScreen(onBack = home, onOpen = { navigate("open:$it") })
        "scheduled" -> ScheduledScreen(onBack = home)
        "storage" -> StorageSettings(navigate)
        "advanced" -> AdvancedSettings(navigate)
        "about" -> AboutSettings(navigate)
        else -> SettingsPage("Settings", onBack) { }
    }
}

@Composable
private fun SettingsHome(navigate: (String) -> Unit, onBack: () -> Unit) {
    var query by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        TopBar("Settings", onBack)
        SearchPill(query, { query = it }, "Search settings", Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 40.dp)) {
            val q = query.trim().lowercase()
            if (q.isNotEmpty()) {
                val hits = SETTINGS_INDEX.filter { (it.title + " " + it.where + " " + it.keywords).lowercase().contains(q) }
                if (hits.isEmpty()) EmptyState(Icons.Rounded.Search, "No settings match", "Try a different word.")
                else SettingsGroup {
                    hits.forEachIndexed { i, e -> if (i > 0) GroupDivider(); NavRow(e.title, e.where) { navigate(e.page) } }
                }
                return@Column
            }
            SettingsGroup {
                NavRow("Appearance", "Theme, colors, text size, bubbles", Icons.Rounded.Palette, Color(0xFF8E6CF0)) { navigate("appearance") }; GroupDivider()
                NavRow("Inbox & layout", "Tabs, pins, swipe actions, density", Icons.Rounded.Tune, Color(0xFF3B82F6)) { navigate("layout") }; GroupDivider()
                NavRow("Pages", "Sending, reading, privacy, media", Icons.Rounded.Chat, Color(0xFF10B981)) { navigate("chats") }; GroupDivider()
                NavRow("Notifications", "Previews, scope, quiet hours", Icons.Rounded.Notifications, Color(0xFFEF4444)) { navigate("notifications") }
            }
            SettingsGroup {
                NavRow("Bridges & accounts", "Connected apps and their status", Icons.Rounded.Link, Color(0xFF0EA5E9)) { navigate("bridges") }; GroupDivider()
                NavRow("Labels", "Organize pages into folders", Icons.AutoMirrored.Rounded.Label, Color(0xFFF59E0B)) { navigate("labels") }; GroupDivider()
                NavRow("Stickers & GIFs", "Your stickers, GIF search", Icons.Rounded.EmojiEmotions, Color(0xFFEC4899)) { navigate("media") }
            }
            SettingsGroup {
                NavRow("Privacy & security", "Encryption and recovery key, app lock, receipts", Icons.Rounded.Lock, Color(0xFF64748B)) { navigate("privacy") }; GroupDivider()
                if (LocalStore.current.isAdmin.collectAsState().value) { NavRow("Admin", "Profiles, bridges, signups", Icons.Rounded.AdminPanelSettings, Color(0xFFDC2626)) { navigate("admin") }; GroupDivider() }
                NavRow("Storage", "Cache, backup, reset", Icons.Rounded.Storage, Color(0xFF14B8A6)) { navigate("storage") }; GroupDivider()
                NavRow("Advanced", "Background sync, developer tools", Icons.Rounded.Code, Color(0xFF475569)) { navigate("advanced") }
            }
            SettingsGroup {
                NavRow("Starred messages", null, Icons.Rounded.Star, Color(0xFFF59E0B)) { navigate("starred") }; GroupDivider()
                NavRow("Scheduled & reminders", null, Icons.Rounded.AccessTime, Color(0xFFF97316)) { navigate("scheduled") }
            }
            SettingsGroup { NavRow("About", "Version, server, sign out", Icons.Rounded.Info, Color(0xFF6B7280)) { navigate("about") } }
        }
    }
}

/** The pill-shaped search field used in every list. */
@Composable
fun SearchPill(value: String, onChange: (String) -> Unit, placeholder: String, modifier: Modifier = Modifier, trailing: @Composable () -> Unit = {}) {
    Row(modifier.fillMaxWidth().height(46.dp).clip(RoundedCornerShape(23.dp)).background(MaterialTheme.colorScheme.surfaceVariant).padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Rounded.Search, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(10.dp))
        Box(Modifier.weight(1f)) {
            if (value.isEmpty()) Text(placeholder, color = MaterialTheme.colorScheme.onSurfaceVariant)
            androidx.compose.foundation.text.BasicTextField(
                value, onChange, singleLine = true, textStyle = MaterialTheme.typography.bodyLarge.copy(color = MaterialTheme.colorScheme.onSurface),
                cursorBrush = androidx.compose.ui.graphics.SolidColor(MaterialTheme.colorScheme.primary), modifier = Modifier.fillMaxWidth(),
            )
        }
        trailing()
    }
}

@Composable
private fun AppearancePage() {
    val store = LocalStore.current
    val s = LocalRawSettings.current
    val set = store.settings::update
    var editing by remember { mutableStateOf<Int?>(null) }
    var tapPicking by remember { mutableStateOf<String?>(null) }
    SettingsGroup("Display") {
        SwitchRow("Silly hello", "The pager says something goofy when you open the app", s.greetings) { v -> set { copy(greetings = v) } }; GroupDivider()
        SwitchRow("E-ink mode", "Black and white, no animation, thicker lines. Made for e-ink screens", s.eink) { v -> set { copy(eink = v) } }; GroupDivider()
        ChoiceRow("Display size", listOf("auto" to "Automatic (from this screen)", "manual" to "Manual"), s.scaleMode) { v -> set { copy(scaleMode = v) } }
        if (s.scaleMode == "manual") { GroupDivider(); SliderRow("Size", s.uiScale, 0.6f..1.8f, "${(s.uiScale * 100).toInt()}%") { v -> set { copy(uiScale = Math.round(v * 40) / 40f) } } }
        GroupDivider(); ChoiceRow("Small screen layout", listOf("auto" to "Automatic", "on" to "Always", "off" to "Never"), s.smallScreen) { v -> set { copy(smallScreen = v) } }
    }
    var pickingColor by remember { mutableStateOf(false) }
    if (pickingColor) ColorPickerDialog(parseHex(s.accentCustom) ?: Color(0xFF0D9488), { pickingColor = false }) { c -> set { copy(accent = "custom", accentCustom = c.toHex()) }; pickingColor = false }
    SettingsGroup("Theme") {
        ChoiceRow("Mode", listOf("system" to "Follow system", "light" to "Light", "dark" to "Dark", "black" to "Black (AMOLED)"), s.themeMode) { v -> set { copy(themeMode = v) } }
        GroupDivider()
        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
            Text("Accent color")
            Spacer(Modifier.height(10.dp))
            androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                ACCENTS.forEach { (name, c) ->
                    Box(Modifier.size(38.dp).clip(CircleShape).background(c[0]).clickable { set { copy(accent = name) } }, contentAlignment = Alignment.Center) {
                        if (s.accent == name) Icon(Icons.Rounded.Check, null, tint = c[2], modifier = Modifier.size(20.dp))
                    }
                }
                val customColor = parseHex(s.accentCustom) ?: Color(0xFF0D9488)
                Box(
                    Modifier.size(38.dp).clip(CircleShape).background(if (s.accent == "custom") Brush.linearGradient(listOf(customColor, customColor)) else Brush.sweepGradient(listOf(Color.Red, Color.Yellow, Color.Green, Color.Cyan, Color.Blue, Color.Magenta, Color.Red)))
                        .clickable { pickingColor = true },
                    contentAlignment = Alignment.Center,
                ) { if (s.accent == "custom") Icon(Icons.Rounded.Check, "Your colour", tint = if (customColor.luminance() > 0.45f) Color.Black else Color.White, modifier = Modifier.size(20.dp)) else Icon(Icons.Rounded.Palette, "Make your own", tint = Color.White, modifier = Modifier.size(18.dp)) }
                if (Build.VERSION.SDK_INT >= 31) Box(Modifier.size(38.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant).clickable { set { copy(accent = "dynamic") } }, contentAlignment = Alignment.Center) {
                    Icon(if (s.accent == "dynamic") Icons.Rounded.Check else Icons.Rounded.Palette, "Material You", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
                }
            }
        }
    }
    SettingsGroup("Text & messages") {
        SliderRow("Text size", s.fontScale, 0.85f..1.4f, "${(s.fontScale * 100).toInt()}%") { v -> set { copy(fontScale = (v * 20).toInt() / 20f) } }; GroupDivider()
        ChoiceRow("Bubble style", listOf("round" to "Rounded", "soft" to "Extra round", "square" to "Square", "tail" to "Tail", "outline" to "Outline", "plain" to "No bubbles"), s.bubbleStyle) { v -> set { copy(bubbleStyle = v) } }; GroupDivider()
        ChoiceRow("Bubble fill", listOf("solid" to "Solid", "gradient" to "Gradient", "tinted" to "Soft tint"), s.bubbleFill) { v -> set { copy(bubbleFill = v) } }; GroupDivider()
        ChoiceRow("Bubble depth", listOf("flat" to "Flat", "soft" to "Soft shadow", "raised" to "Raised"), s.bubbleDepth) { v -> set { copy(bubbleDepth = v) } }; GroupDivider()
        ChoiceRow("Message animation", listOf("none" to "None", "pop" to "Pop", "slide" to "Slide", "fade" to "Fade"), s.messageAnimation) { v -> set { copy(messageAnimation = v) } }; GroupDivider()
        SwitchRow("Screen effects", "Confetti, hearts, balloons and more when a message calls for it", s.screenEffects) { v -> set { copy(screenEffects = v) } }; GroupDivider()
        ChoiceRow("Page wallpaper", listOf("none" to "None", "dusk" to "Dusk", "forest" to "Forest", "ocean" to "Ocean", "sand" to "Sand", "graphite" to "Graphite"), s.wallpaper) { v -> set { copy(wallpaper = v) } }; GroupDivider()
        ChoiceRow("Avatar shape", listOf("circle" to "Circle", "squircle" to "Rounded square"), s.avatarShape) { v -> set { copy(avatarShape = v) } }; GroupDivider()
        ChoiceRow("Time format", listOf("system" to "Follow system", "12" to "12-hour", "24" to "24-hour"), s.timeFormat) { v -> set { copy(timeFormat = v) } }; GroupDivider()
        SwitchRow("Color sender names in groups", checked = s.colorSenderNames) { v -> set { copy(colorSenderNames = v) } }; GroupDivider()
        SwitchRow("Large emoji", "Emoji-only messages are shown big", s.largeEmoji) { v -> set { copy(largeEmoji = v) } }; GroupDivider()
        SwitchRow("Reduce motion", "Fewer animations", s.reduceMotion) { v -> set { copy(reduceMotion = v) } }
    }
    SettingsGroup("Reactions", footer = "These show first when you long-press a message. Tap one to change it.") {
        SwitchRow("Double-tap to react", "Double-tap a message to add ${s.doubleTapEmoji.ifEmpty { s.quickReactions.firstOrNull().orEmpty() }}", s.doubleTapReact) { v -> set { copy(doubleTapReact = v) } }; GroupDivider()
        NavRow("Double-tap reaction", s.doubleTapEmoji.ifEmpty { s.quickReactions.firstOrNull().orEmpty() } + (if (s.doubleTapEmoji.isEmpty()) "  (your first quick reaction)" else "")) { tapPicking = "double" }; GroupDivider()
        SwitchRow("Triple-tap to react", "Triple-tap a message to add ${s.tripleTapEmoji}. Makes a single tap wait a moment", s.tripleTapReact) { v -> set { copy(tripleTapReact = v) } }; GroupDivider()
        NavRow("Triple-tap reaction", s.tripleTapEmoji) { tapPicking = "triple" }; GroupDivider()
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            s.quickReactions.forEachIndexed { i, e ->
                Box(Modifier.size(46.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant).clickable { editing = i }, contentAlignment = Alignment.Center) { Text(e, fontSize = 24.sp) }
            }
        }
        GroupDivider()
        ButtonRow("Reset quick reactions") { set { copy(quickReactions = DEFAULT_QUICK_REACTIONS) } }
    }
    tapPicking?.let { which -> EmojiPickerDialog(s.recentEmoji, onPick = { e -> set { if (which == "double") copy(doubleTapEmoji = e) else copy(tripleTapEmoji = e) }; tapPicking = null }, onDismiss = { tapPicking = null }) }
    editing?.let { idx -> EmojiPickerDialog(s.recentEmoji, onPick = { e -> set { copy(quickReactions = quickReactions.toMutableList().also { it[idx] = e }) }; editing = null }, onDismiss = { editing = null }) }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun NotificationSettings(navigate: (String) -> Unit) {
    val store = LocalStore.current
    val s = LocalRawSettings.current
    val set = store.settings::update
    val context = LocalContext.current
    var picking by remember { mutableStateOf<String?>(null) }
    var addingWord by remember { mutableStateOf(false) }
    val off = !s.notifEnabled
    val networks by store.bridges.collectAsState()
    val known = (listOf("whatsapp", "signal", "gmessages", "messenger", "telegram", "discord", "instagram") + networks.map { it.id }).distinct()
    val dayNames = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
    var diagnosis by remember { mutableStateOf<String?>(null) }
    diagnosis?.let { d -> AlertDialog(onDismissRequest = { diagnosis = null }, title = { Text("Priority & bubbles") }, text = { Text(d) }, confirmButton = { TextButton(onClick = { diagnosis = null }) { Text("OK") } }) }
    SettingsPage("Notifications", { navigate("") }) {
        SettingsGroup {
            SwitchRow("Notifications", "Master switch for message alerts", s.notifEnabled) { v -> set { copy(notifEnabled = v) } }; GroupDivider()
            ButtonRow("Send a test notification") { Notifier.test(context, store) }; GroupDivider()
            ButtonRow("Check priority & bubbles") { diagnosis = Notifier.diagnose(context) }
        }
        SettingsGroup("Inside a page", footer = "A little sound when you send or get a message in the page you have open. Pages you are not looking at use your notification settings.") {
            SwitchRow("Sounds inside a page", null, s.convoSounds) { v -> set { copy(convoSounds = v) } }; GroupDivider()
            ChoiceRow("Send sound", ChatSounds.choices, s.sendSound, s.convoSounds) { v -> set { copy(sendSound = v) }; ChatSounds.play(v, s.convoSoundVolume) }; GroupDivider()
            ChoiceRow("Receive sound", ChatSounds.choices, s.receiveSound, s.convoSounds) { v -> set { copy(receiveSound = v) }; ChatSounds.play(v, s.convoSoundVolume) }; GroupDivider()
            SliderRow("Volume", s.convoSoundVolume, 0f..1f, "${(s.convoSoundVolume * 100).toInt()}%") { v -> set { copy(convoSoundVolume = (Math.round(v * 20) / 20f)) } }
        }
        SettingsGroup("What to notify", footer = "Muted and Low priority pages stay quiet except for @mentions, replies to your messages and your keywords.") {
            ChoiceRow("Notify me about", listOf("all" to "Every message", "dm_mentions" to "Direct messages and mentions", "favorites" to "Pinned pages and mentions"), s.notifScope, s.notifEnabled) { v -> set { copy(notifScope = v) } }; GroupDivider()
            ChoiceRow("Direct messages", listOf("all" to "Every message", "mentions" to "Mentions and replies only", "none" to "Nothing"), s.notifDirectMode, s.notifEnabled) { v -> set { copy(notifDirectMode = v) } }; GroupDivider()
            ChoiceRow("Group pages", listOf("all" to "Every message", "mentions" to "Mentions and replies only", "none" to "Nothing"), s.notifGroupMode, s.notifEnabled) { v -> set { copy(notifGroupMode = v) } }; GroupDivider()
            SwitchRow("Groups: only when mentioned", "Group pages stay quiet unless someone @mentions you", s.notifGroupMentionsOnly, s.notifEnabled) { v -> set { copy(notifGroupMentionsOnly = v) } }
        }
        SettingsGroup("Keywords", footer = "A message with one of these words always notifies you, even in a muted page. Whole words only.") {
            if (s.notifKeywords.isNotEmpty()) FlowRow(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                s.notifKeywords.forEach { k ->
                    Row(Modifier.clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant).clickable { set { copy(notifKeywords = notifKeywords - k) } }.padding(start = 12.dp, end = 8.dp, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(k, style = MaterialTheme.typography.labelLarge); Spacer(Modifier.width(4.dp)); Icon(Icons.Rounded.Close, "Remove $k", Modifier.size(16.dp))
                    }
                }
            }
            if (s.notifKeywords.isNotEmpty()) GroupDivider()
            ButtonRow("Add a keyword") { addingWord = true }
        }
        SettingsGroup("Appearance") {
            ChoiceRow("Show", listOf("full" to "Name and message", "sender" to "Name only", "hidden" to "Hide content"), s.notifPreview, s.notifEnabled) { v -> set { copy(notifPreview = v) } }; GroupDivider()
            ChoiceRow("On the lock screen", listOf("show" to "Show content", "hide_content" to "Hide content", "hide" to "Don't show"), s.notifLockScreen, s.notifEnabled) { v -> set { copy(notifLockScreen = v) } }; GroupDivider()
            SwitchRow("Reply & Mark read buttons", "Act on a message right from the notification", s.notifActions, s.notifEnabled) { v -> set { copy(notifActions = v) } }
        }
        SettingsGroup("Sound & vibration", footer = "For a custom ringtone, vibration pattern or light, open the system settings for Pager's messages.") {
            SwitchRow("Sound", checked = s.notifSound, enabled = s.notifEnabled) { v -> set { copy(notifSound = v) } }; GroupDivider()
            SwitchRow("Vibrate", checked = s.notifVibrate, enabled = s.notifEnabled) { v -> set { copy(notifVibrate = v) } }; GroupDivider()
            SwitchRow("Alert once per burst", "Only the first message of several makes a sound", s.notifAlertOnce, s.notifEnabled) { v -> set { copy(notifAlertOnce = v) } }; GroupDivider()
            ButtonRow("Choose ringtone and vibration…") {
                context.startActivity(Intent(AndroidSettings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).putExtra(AndroidSettings.EXTRA_APP_PACKAGE, context.packageName).putExtra(AndroidSettings.EXTRA_CHANNEL_ID, Notifier.CH_ALL).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
        }
        SettingsGroup("Delay", footer = "Waits, then skips the alert if you already read the page on another device or app.") {
            ChoiceRow("Wait before alerting", listOf(0 to "Don't wait", 5 to "5 seconds", 15 to "15 seconds", 30 to "30 seconds", 60 to "1 minute").map { it.first.toString() to it.second }, s.notifDelaySec.toString(), s.notifEnabled) { v -> set { copy(notifDelaySec = v.toInt()) } }
        }
        SettingsGroup("Quiet hours", footer = "Messages still arrive, silently.") {
            SwitchRow("Quiet hours", checked = s.quietHoursEnabled, enabled = s.notifEnabled) { v -> set { copy(quietHoursEnabled = v) } }
            if (s.quietHoursEnabled) {
                GroupDivider(); TimeRow("From", s.quietStartMin) { picking = "start" }
                GroupDivider(); TimeRow("Until", s.quietEndMin) { picking = "end" }
                GroupDivider()
                FlowRow(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    dayNames.forEachIndexed { d, name ->
                        androidx.compose.material3.FilterChip(selected = d in s.notifQuietDays, onClick = { set { copy(notifQuietDays = if (d in notifQuietDays) notifQuietDays - d else notifQuietDays + d) } }, label = { Text(name) })
                    }
                }
                GroupDivider()
                SwitchRow("Let important ones through", "Pinned pages, mentions, replies and keywords still make a sound", s.notifQuietBreakThrough) { v -> set { copy(notifQuietBreakThrough = v) } }
            }
        }
        SettingsGroup("Per network", footer = "Pick how each app notifies you. A page's own setting (in its info page) wins.") {
            known.forEachIndexed { i, id ->
                if (i > 0) GroupDivider()
                ChoiceRow(
                    networkMeta(id).label, listOf("all" to "Every message", "mentions" to "Mentions only", "none" to "Nothing"),
                    s.notifNetworkMode[id] ?: if (id in s.notifMutedNetworks) "none" else "all", s.notifEnabled,
                ) { v -> set { copy(notifNetworkMode = notifNetworkMode + (id to v), notifMutedNetworks = notifMutedNetworks - id) } }
            }
        }
        val custom = s.notifChat.filterValues { !it.isDefault }
        if (custom.isNotEmpty()) SettingsGroup("Pages with their own settings") {
            val chats by store.chats.collectAsState()
            custom.entries.forEachIndexed { i, (room, p) ->
                if (i > 0) GroupDivider()
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(chats[room]?.let { SyncReducer.displayName(it, store.me) } ?: room.take(12) + "…")
                        Text(notifSummary(p), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    TextButton(onClick = { set { copy(notifChat = notifChat - room) } }) { Text("Reset") }
                }
            }
        }
        SettingsGroup("System") {
            ButtonRow("Open Android notification settings") {
                context.startActivity(Intent(AndroidSettings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(AndroidSettings.EXTRA_APP_PACKAGE, context.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
        }
    }
    if (addingWord) {
        var w by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { addingWord = false }, title = { Text("Add a keyword") },
            text = { androidx.compose.material3.OutlinedTextField(w, { w = it }, singleLine = true, placeholder = { Text("Your name, a nickname…") }) },
            confirmButton = { TextButton(enabled = w.isNotBlank(), onClick = { val k = w.trim(); set { if (notifKeywords.any { it.equals(k, true) }) this else copy(notifKeywords = notifKeywords + k) }; addingWord = false }) { Text("Add") } },
            dismissButton = { TextButton(onClick = { addingWord = false }) { Text("Cancel") } },
        )
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

/** One line describing a chat's notification overrides. */
fun notifSummary(p: ChatNotifPrefs?): String {
    if (p == null || p.isDefault) return "Default"
    return listOfNotNull(
        when (p.level) { "priority" -> "Priority"; "silent" -> "Silent"; else -> null },
        when (p.mode) { "all" -> "Every message"; "mentions" -> "Mentions only"; "none" -> "Off"; else -> null },
        if (p.sound == "off") "Silent" else null, if (p.vibrate == "off") "No vibration" else null,
        when (p.preview) { "hide" -> "Hidden previews"; "show" -> "Shown previews"; else -> null },
    ).joinToString(" · ")
}

@Composable
private fun TimeRow(label: String, minutes: Int, onClick: () -> Unit) {
    val h = minutes / 60; val m = minutes % 60
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 14.dp)) {
        Text(label, Modifier.weight(1f))
        Text("%d:%02d %s".format(if (h % 12 == 0) 12 else h % 12, m, if (h < 12) "AM" else "PM"), color = MaterialTheme.colorScheme.primary)
    }
}

@Composable
private fun StickersAndGifsPage(onBack: () -> Unit) {
    val store = LocalStore.current
    val s = LocalRawSettings.current
    val pack by store.userStickers.collectAsState()
    val scope = rememberCoroutineScope()
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris: List<Uri> -> if (uris.isNotEmpty()) scope.launch { store.addStickers(uris) } }
    SettingsPage("Stickers & GIFs", onBack) {
        SettingsGroup("GIF search", footer = "GIF search uses your own free API key from Giphy (developers.giphy.com) or Tenor. Pager doesn't ship a shared key.") {
            ChoiceRow("Provider", listOf("giphy" to "Giphy", "tenor" to "Tenor"), s.gifProvider) { v -> store.settings.update { copy(gifProvider = v) } }; GroupDivider()
            TextFieldRow("API key", s.gifKey, "Paste your key", secret = true) { v -> store.settings.update { copy(gifKey = v) } }
        }
        SettingsGroup("My stickers", footer = "Stickers are saved to your Matrix account, so they follow you to other devices. Pages you share a sticker pack with appear in the sticker tray too.") {
            ButtonRow("Add stickers from photos…") { pick.launch("image/*") }
            GroupDivider()
            Text(if (pack?.stickers.isNullOrEmpty()) "No stickers yet" else "${pack!!.stickers.size} stickers", Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun LabelsPage(onBack: () -> Unit) {
    val store = LocalStore.current
    val labels by store.labels.collectAsState()
    val chats by store.chats.collectAsState()
    var renaming by remember { mutableStateOf<String?>(null) }
    var confirmDelete by remember { mutableStateOf<String?>(null) }
    SettingsPage("Labels", onBack) {
        Text("Labels work like folders. Add one from a page's menu, then filter your inbox by it.", Modifier.padding(horizontal = 20.dp, vertical = 8.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (labels.isEmpty()) EmptyState(Icons.AutoMirrored.Rounded.Label, "No labels yet", "Long-press a page, choose Labels, and create one.")
        else SettingsGroup {
            labels.forEachIndexed { i, name ->
                if (i > 0) GroupDivider()
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconTile(Icons.AutoMirrored.Rounded.Label, Color(0xFFF59E0B))
                    Column(Modifier.weight(1f).padding(horizontal = 14.dp)) { Text(name); Text("${chats.values.count { name in it.labels }} pages", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    TextButton(onClick = { renaming = name }) { Text("Rename") }
                    IconBtn(Icons.Rounded.Delete, "Delete label", { confirmDelete = name }, tint = MaterialTheme.colorScheme.error)
                }
            }
        }
    }
    renaming?.let { old ->
        var v by remember { mutableStateOf(old) }
        AlertDialog(onDismissRequest = { renaming = null }, title = { Text("Rename label") }, text = { OutlinedTextField(v, { v = it }, singleLine = true) },
            confirmButton = { TextButton(enabled = v.isNotBlank(), onClick = { store.renameLabel(old, v.trim()); renaming = null }) { Text("Save") } },
            dismissButton = { TextButton(onClick = { renaming = null }) { Text("Cancel") } })
    }
    confirmDelete?.let { name ->
        AlertDialog(onDismissRequest = { confirmDelete = null }, title = { Text("Delete “$name”?") }, text = { Text("The label is removed from every page. The pages themselves aren't touched.") },
            confirmButton = { TextButton(onClick = { store.deleteLabel(name); confirmDelete = null }) { Text("Delete", color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = { confirmDelete = null }) { Text("Cancel") } })
    }
}

@Composable
private fun StorageSettings(navigate: (String) -> Unit) {
    val store = LocalStore.current
    val clipboard = LocalClipboardManager.current
    var size by remember { mutableStateOf(store.cacheSize()) }
    var confirmReset by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    SettingsPage("Storage", { navigate("") }) {
        SettingsGroup("Cache") {
            Text("Downloaded photos, videos and files: ${humanSize(size)}", Modifier.padding(16.dp))
            GroupDivider(); ButtonRow("Clear media cache") { store.clearCache(); size = store.cacheSize() }
        }
        SettingsGroup("Back up settings", footer = "Copies every setting as text, so you can paste it on another device.") {
            ButtonRow("Copy settings to clipboard") { clipboard.setText(AnnotatedString(store.exportSettings())); message = "Settings copied." }; GroupDivider()
            ButtonRow("Restore settings from clipboard") { message = if (store.importSettings(clipboard.getText()?.text.orEmpty())) "Settings restored." else "The clipboard doesn't contain Pager settings." }
            message?.let { Text(it, Modifier.padding(16.dp), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodyMedium) }
        }
        SettingsGroup("Reset", footer = "Puts every setting back to its default. Your pages and accounts aren't touched.") { ButtonRow("Reset all settings", danger = true) { confirmReset = true } }
    }
    if (confirmReset) AlertDialog(
        onDismissRequest = { confirmReset = false }, title = { Text("Reset all settings?") },
        confirmButton = { TextButton(onClick = { store.settings.reset(); confirmReset = false }) { Text("Reset") } },
        dismissButton = { TextButton(onClick = { confirmReset = false }) { Text("Cancel") } },
    )
}

@Composable
private fun AdvancedSettings(navigate: (String) -> Unit) {
    val store = LocalStore.current
    val s = LocalRawSettings.current
    val context = LocalContext.current
    SettingsPage("Advanced", { navigate("") }) {
        SettingsGroup("Sync") {
            SwitchRow("Background sync", "Keeps a quiet notification so messages arrive when the app is closed", s.backgroundSync) { v -> store.settings.update { copy(backgroundSync = v) } }; GroupDivider()
            ButtonRow("Battery optimization settings") { context.startActivity(Intent(AndroidSettings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
        }
        SettingsGroup("Developer", footer = "Adds a 'View source' action to messages, showing event IDs and raw details.") {
            SwitchRow("Developer mode", checked = s.developerMode) { v -> store.settings.update { copy(developerMode = v) } }
        }
    }
}

@Composable
private fun AboutSettings(navigate: (String) -> Unit) {
    val store = LocalStore.current
    val session = store.session.collectAsState().value
    var deleting by remember { mutableStateOf(false) }
    SettingsPage("About", { navigate("") }) {
        SettingsGroup("Pager") {
            Text("Version ${BuildConfigVersion.NAME}", Modifier.padding(16.dp)); GroupDivider()
            Text("An open-source, self-hosted unified messenger.", Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        SettingsGroup("Account") {
            Text(session?.userId ?: "", Modifier.padding(16.dp)); GroupDivider()
            Text(session?.baseUrl ?: "", Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant); GroupDivider()
            ButtonRow("Sign out", danger = true) { store.signOut() }; GroupDivider()
            ButtonRow("Delete my profile", danger = true) { deleting = true }
        }
    }
    if (deleting) DeleteProfileDialog { deleting = false }
}

/** Asks for your password, then deletes your account on the server and clears this phone. */
@Composable
fun DeleteProfileDialog(onDismiss: () -> Unit) {
    val store = LocalStore.current
    val scope = rememberCoroutineScope()
    var pw by remember { mutableStateOf("") }
    var err by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() }, title = { Text("Delete your profile?") },
        text = {
            Column {
                Text("This deletes your account on this server, disconnects all your apps and removes your messages here. Your pages on WhatsApp, Signal and the others are not touched. This can't be undone.")
                androidx.compose.material3.OutlinedTextField(pw, { pw = it }, Modifier.padding(top = 12.dp), singleLine = true, label = { Text("Your password") }, visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation())
                if (err.isNotEmpty()) Text(err, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp))
            }
        },
        confirmButton = {
            TextButton(enabled = !busy && pw.isNotEmpty(), onClick = {
                busy = true; err = ""
                scope.launch { store.deleteProfile(pw).onFailure { err = it.message ?: "Wrong password"; busy = false } }
            }) { Text(if (busy) "Deleting…" else "Delete", color = MaterialTheme.colorScheme.error) }
        },
        dismissButton = { TextButton(enabled = !busy, onClick = onDismiss) { Text("Cancel") } },
    )
}

object BuildConfigVersion { const val NAME = "0.3.0" }

/** End-to-end encryption on this device: the recovery key that brings your history back on a new device. */
@Composable
private fun EncryptionGroup() {
    val store = LocalStore.current
    val scope = rememberCoroutineScope()
    val e by store.encryption.collectAsState()
    val problem by store.syncProblem.collectAsState()
    LaunchedEffect(Unit) { store.refreshEncryptionStatus() }
    var dialog by remember { mutableStateOf<String?>(null) }
    SettingsGroup("Encryption", footer = "Encrypted pages can only be read by your devices. The recovery key lets a new device read your history; Pager can't recover it for you.") {
        NavRow("Encryption on this device", if (e.ready) "Ready · device ${e.deviceId}" else if (e.error != null) "Couldn't start: ${e.error}. Tap to try again" else "Starting…", Icons.Rounded.Lock) { if (!e.ready && e.error != null) scope.launch { store.retryEncryptionStart() } }
        if (e.mismatch) { GroupDivider(); NavRow("This phone's keys don't match your account", "New messages can't be read here. Tap to sign out, then sign in again and enter your recovery key.", Icons.Rounded.Help) { store.signOut() } }
        if (e.ready && e.missing) { GroupDivider(); NavRow("This phone's keys haven't reached the server", "Apps can't send it messages until they do. Check the connection; Pager keeps trying. If it stays like this, sign out and in again.", Icons.Rounded.Help) {} }
        problem?.let { GroupDivider(); NavRow("Last problem reading updates", it, Icons.Rounded.Help) {} }
        val crashPrefs = androidx.compose.ui.platform.LocalContext.current.getSharedPreferences("pager.crash", android.content.Context.MODE_PRIVATE)
        var crash by remember { mutableStateOf(crashPrefs.getString("last", null)) }
        val clip = LocalClipboardManager.current
        crash?.let { c -> GroupDivider(); NavRow("The app closed unexpectedly last time", "Tap to copy the details and send them to me. ${c.lineSequence().drop(1).firstOrNull().orEmpty().take(120)}", Icons.Rounded.Help) { clip.setText(AnnotatedString(c)); crashPrefs.edit().remove("last").apply(); crash = null } }
        if (e.ready) { GroupDivider(); NavRow("Device fingerprint", e.fingerprint.chunked(4).joinToString(" "), Icons.Rounded.Key) {} }
        GroupDivider()
        NavRow(
            "Recovery key", if (e.backupHere) "On: your message keys are backed up" else if (e.backupOnServer) "A backup exists. Enter the recovery key to read your history here" else "Not set up yet",
            Icons.Rounded.VpnKey, Color(0xFF14B8A6),
        ) { if (e.ready) dialog = if (e.backupOnServer && !e.backupHere) "restore" else "create" }
        if (e.backupOnServer && !e.backupHere) { GroupDivider(); NavRow("Make a new recovery key instead", null, Icons.Rounded.Refresh) { dialog = "create" } }
        if (e.ready) {
            GroupDivider()
            NavRow("Lost your recovery key?", if (e.backupHere) "This phone still has your keys: choose Recovery key above and replace it" else "Use a key file below, or make a new key. Without either, older encrypted messages can't be read here", Icons.Rounded.Help) {}
            GroupDivider(); NavRow("Encrypt all my pages", "Turns on encryption for every page that can take it. Older messages stay readable on your server", Icons.Rounded.Lock) { dialog = "all" }
            GroupDivider(); NavRow("Advanced: save keys to a file", "Not your recovery key. A separate file you protect with a passphrase you choose", Icons.Rounded.Save) { dialog = "export" }
            GroupDivider(); NavRow("Advanced: restore keys from a file", "Only for a file made with the row above. Asks for that file's passphrase", Icons.Rounded.FileOpen) { dialog = "import" }
        }
    }
    if (dialog == "all") {
        var stage by remember { mutableStateOf("ask") }
        var progress by remember { mutableStateOf(0 to 0) }
        var result by remember { mutableStateOf<Pair<Int, List<Pair<String, String>>>?>(null) }
        AlertDialog(
            onDismissRequest = { if (stage != "run") dialog = null }, title = { Text("Encrypt all my pages?") },
            text = {
                Column {
                    when (stage) {
                        "ask" -> {
                            Text("Every page that can take encryption will be switched on. Messages from now on are end-to-end encrypted.")
                            Text("Older messages stay readable on your server. Encryption can't be turned off again. Pages whose app isn't ready are skipped and listed.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
                            if (!e.backupHere) Text("You haven't set up a recovery key on this device. Do that first, so a new device can read your history.", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp))
                        }
                        "run" -> Text("Turning on encryption… ${progress.first} of ${progress.second}")
                        else -> result?.let { (done, failed) ->
                            Text("$done page${if (done == 1) "" else "s"} encrypted.")
                            if (failed.isNotEmpty()) {
                                Text("Skipped ${failed.size}:", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
                                failed.take(20).forEach { (n, why) -> Text("$n: $why", style = MaterialTheme.typography.bodySmall) }
                            }
                        }
                    }
                }
            },
            confirmButton = {
                when (stage) {
                    "ask" -> TextButton(onClick = { stage = "run"; scope.launch { result = store.enableEncryptionForAll { a, b -> progress = a to b }; stage = "done" } }) { Text("Encrypt all") }
                    "done" -> TextButton(onClick = { dialog = null }) { Text("Done") }
                }
            },
            dismissButton = { if (stage == "ask") TextButton(onClick = { dialog = null }) { Text("Cancel") } },
        )
    }
    if (dialog == "export") {
        var pass by remember { mutableStateOf("") }
        var err by remember { mutableStateOf("") }
        var busy by remember { mutableStateOf(false) }
        var pending by remember { mutableStateOf<String?>(null) }
        val ctx = androidx.compose.ui.platform.LocalContext.current
        val save = androidx.activity.compose.rememberLauncherForActivityResult(androidx.activity.result.contract.ActivityResultContracts.CreateDocument("text/plain")) { uri ->
            val text = pending
            if (uri != null && text != null) { runCatching { ctx.contentResolver.openOutputStream(uri)!!.use { it.write(text.toByteArray()) } }.onSuccess { dialog = null }.onFailure { err = "Couldn't save the file" } }
            pending = null; busy = false
        }
        AlertDialog(
            onDismissRequest = { dialog = null }, title = { Text("Save my keys to a file") },
            text = {
                Column {
                    Text("This is a separate, optional backup file: it is not your recovery key. Choose a passphrase for it (you will need it to open the file), and keep both safe, separately.")
                    androidx.compose.material3.OutlinedTextField(pass, { pass = it }, label = { Text("Passphrase (at least 8 characters)") }, singleLine = true, visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
                    if (err.isNotEmpty()) Text(err, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 6.dp))
                }
            },
            confirmButton = {
                TextButton(enabled = !busy && pass.length >= 8, onClick = {
                    busy = true; err = ""
                    scope.launch { runCatching { store.exportKeyFile(pass) }.onSuccess { pending = it; save.launch("pager-keys.txt") }.onFailure { err = it.message ?: "Couldn't make the file"; busy = false } }
                }) { Text(if (busy) "Saving…" else "Choose where to save") }
            },
            dismissButton = { TextButton(onClick = { dialog = null }) { Text("Cancel") } },
        )
    }
    if (dialog == "import") {
        var text by remember { mutableStateOf("") }
        var name by remember { mutableStateOf("") }
        var pass by remember { mutableStateOf("") }
        var err by remember { mutableStateOf("") }
        var busy by remember { mutableStateOf(false) }
        var done by remember { mutableStateOf<Int?>(null) }
        val ctx = androidx.compose.ui.platform.LocalContext.current
        val pick = androidx.activity.compose.rememberLauncherForActivityResult(androidx.activity.result.contract.ActivityResultContracts.OpenDocument()) { uri ->
            if (uri != null) runCatching { text = ctx.contentResolver.openInputStream(uri)!!.use { it.readBytes().decodeToString() }; name = uri.lastPathSegment?.substringAfterLast('/') ?: "file" }.onFailure { err = "Couldn't read that file" }
        }
        AlertDialog(
            onDismissRequest = { dialog = null }, title = { Text("Restore keys from a file") },
            text = {
                Column {
                    if (done != null) Text("Done: $done new message keys. Older messages in your encrypted pages can be read now.")
                    else {
                        Text("This is only for a key file you saved earlier with a passphrase. If you have a recovery key (a code), close this and use Recovery key instead.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        TextButton(onClick = { pick.launch(arrayOf("text/plain", "*/*")) }) { Text(if (name.isEmpty()) "Choose the file" else name) }
                        androidx.compose.material3.OutlinedTextField(pass, { pass = it }, label = { Text("Passphrase") }, singleLine = true, visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
                        if (err.isNotEmpty()) Text(err, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 6.dp))
                    }
                }
            },
            confirmButton = {
                if (done != null) TextButton(onClick = { dialog = null }) { Text("Close") }
                else TextButton(enabled = !busy && text.isNotEmpty() && pass.isNotEmpty(), onClick = {
                    busy = true; err = ""
                    scope.launch { runCatching { store.importKeyFile(text, pass) }.onSuccess { done = it }.onFailure { err = it.message ?: "That didn't work" }; busy = false }
                }) { Text(if (busy) "Restoring…" else "Restore") }
            },
            dismissButton = { if (done == null) TextButton(onClick = { dialog = null }) { Text("Cancel") } },
        )
    }
    if (dialog == "create") RecoveryKeyDialog(first = false, onDone = { dialog = null })
    if (dialog == "restore") RestoreKeyDialog(first = false, onDone = { dialog = null }, onFresh = { dialog = "create" })
}

/** Makes the recovery key and shows it once. [first] is the screen a brand-new account sees right after signing up. */
@Composable
fun RecoveryKeyDialog(first: Boolean, onDone: () -> Unit) {
    val store = LocalStore.current
    var key by remember { mutableStateOf<String?>(null) }
    var err by remember { mutableStateOf("") }
    var saved by remember { mutableStateOf(false) }
    val clipboard = LocalClipboardManager.current
    LaunchedEffect(Unit) { runCatching { store.createRecoveryKey() }.onSuccess { key = it }.onFailure { err = it.message ?: "Couldn't make a key" } }
    AlertDialog(
        onDismissRequest = { if (key == null || saved) onDone() }, title = { Text(if (first) "Save your recovery key" else "Your recovery key") },
        text = {
            Column {
                when {
                    err.isNotEmpty() -> Text(err, color = MaterialTheme.colorScheme.error)
                    key == null -> Text("Making your key…")
                    else -> {
                        if (first) { Text("This is the one thing to keep. It opens your private messages on any new phone or computer."); Spacer(Modifier.height(6.dp)) }
                        Text("Save this somewhere safe, like a password manager. Anyone with it can read your history, and without it lost devices mean lost history.")
                        Spacer(Modifier.height(10.dp))
                        androidx.compose.foundation.text.selection.SelectionContainer { Text(key!!, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace, fontWeight = FontWeight.SemiBold, modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceVariant).padding(12.dp)) }
                        TextButton(onClick = { clipboard.setText(AnnotatedString(key!!)) }) { Text("Copy") }
                        Row(verticalAlignment = Alignment.CenterVertically) { androidx.compose.material3.Checkbox(saved, { saved = it }); Text("I saved my recovery key") }
                    }
                }
            }
        },
        confirmButton = { TextButton(enabled = key == null || saved, onClick = onDone) { Text(if (key != null) "Done" else "Close") } },
    )
}

/** Enters the recovery key to read older messages on this device. [first] is the welcome-back screen of a new device. */
@Composable
fun RestoreKeyDialog(first: Boolean, onDone: () -> Unit, onFresh: () -> Unit) {
    val store = LocalStore.current
    val scope = rememberCoroutineScope()
    var text by remember { mutableStateOf("") }
    var err by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var done by remember { mutableStateOf<Int?>(null) }
    AlertDialog(
        onDismissRequest = onDone, title = { Text(if (first) "Welcome back. Enter your recovery key" else "Enter your recovery key") },
        text = {
            Column {
                if (done != null) Text("Restored $done message keys. Older messages in your encrypted pages can be read now.")
                else {
                    androidx.compose.material3.OutlinedTextField(text, { text = it }, placeholder = { Text("EsTc 4xYz …") }, minLines = 2, modifier = Modifier.fillMaxWidth())
                    Text("Lost it? A key file (Restore keys from a file) or another signed-in device can still get your history back. If you have neither, you can start fresh with a new key: new messages work, but older encrypted ones stay unreadable.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
                    TextButton(onClick = onFresh) { Text("Start fresh with a new key") }
                    if (err.isNotEmpty()) Text(err, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 6.dp))
                }
            }
        },
        confirmButton = {
            if (done != null) TextButton(onClick = onDone) { Text("Close") }
            else TextButton(enabled = !busy && text.isNotBlank(), onClick = {
                busy = true; err = ""
                scope.launch { runCatching { store.restoreWithRecoveryKey(text) }.onSuccess { done = it }.onFailure { err = it.message ?: "That didn't work" }; busy = false }
            }) { Text(if (busy) "Restoring…" else "Restore") }
        },
        dismissButton = { if (done == null) TextButton(onClick = onDone) { Text(if (first) "Not now" else "Cancel") } },
    )
}

/** Right after signing in: a new account saves its recovery key, a new device on an existing account enters it. One screen, one job. */
@Composable
fun KeySetupGate() {
    val store = LocalStore.current
    val e by store.encryption.collectAsState()
    val prefs = androidx.compose.ui.platform.LocalContext.current.getSharedPreferences("pager.keysetup", android.content.Context.MODE_PRIVATE)
    val flag = "done." + e.deviceId
    var dismissed by remember(e.deviceId) { mutableStateOf(prefs.getBoolean(flag, false)) }
    var fresh by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { store.refreshEncryptionStatus() }
    if (!e.ready || e.backupHere || dismissed) return
    val finish = { prefs.edit().putBoolean(flag, true).apply(); dismissed = true }
    if (e.backupOnServer && !fresh) RestoreKeyDialog(first = true, onDone = finish, onFresh = { fresh = true })
    else RecoveryKeyDialog(first = true, onDone = finish)
}
