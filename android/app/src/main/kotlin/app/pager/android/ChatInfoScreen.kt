@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package app.pager.android

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Label
import androidx.compose.material.icons.rounded.Alarm
import androidx.compose.material.icons.rounded.Archive
import androidx.compose.material.icons.rounded.ExitToApp
import androidx.compose.material.icons.rounded.InsertDriveFile
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.LowPriority
import androidx.compose.material.icons.rounded.MarkChatUnread
import androidx.compose.material.icons.rounded.NotificationsOff
import androidx.compose.material.icons.rounded.PushPin
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Snooze
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

@Composable
fun ChatInfoScreen(roomId: String, onBack: () -> Unit, onLeft: () -> Unit, onSearch: () -> Unit) {
    val store = LocalStore.current
    val chat by remember(roomId) { store.chat(roomId) }.collectAsState(store.chatNow(roomId))
    val me = store.session.collectAsState().value?.userId ?: ""
    val muted by store.muted.collectAsState()
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    var members by remember { mutableStateOf<Map<String, String>?>(null) }
    var confirmLeave by remember { mutableStateOf(false) }
    var rename by remember { mutableStateOf(false) }
    var muteSheet by remember { mutableStateOf(false) }
    var remindSheet by remember { mutableStateOf(false) }
    var snoozeSheet by remember { mutableStateOf(false) }
    var labelSheet by remember { mutableStateOf(false) }
    var tab by remember { mutableStateOf("photos") }
    LaunchedEffect(roomId) { members = store.members(roomId) }

    val c = chat ?: run { onBack(); return }
    val name = SyncReducer.displayName(c, me)
    val isMuted = roomId in muted
    val photos = remember(c.messages) { c.messages.filter { it.type == "m.image" && it.mxc != null && !it.sticker }.reversed() }
    val links = remember(c.messages) { c.messages.mapNotNull { m -> firstUrl(m.body)?.let { m to it } }.reversed() }
    val files = remember(c.messages) { c.messages.filter { it.type == "m.file" || it.type == "m.audio" || it.type == "m.video" }.reversed() }
    var viewer by remember { mutableStateOf<String?>(null) }

    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        TopBar("Chat info", onBack)
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 40.dp)) {
            Column(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Avatar(name, c.network, 96.dp, c.avatarMxc)
                Spacer(Modifier.height(12.dp))
                Text(name, style = MaterialTheme.typography.headlineMedium)
                Text("${networkMeta(c.network).label}${if (c.isGroup) " · ${c.peopleCount} members" else ""}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (c.isGroup) TextButton(onClick = { rename = true }) { Text("Rename group") }
            }
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                QuickAction(Icons.Rounded.Search, "Search") { onSearch() }
                QuickAction(Icons.Rounded.PushPin, if (c.pinned) "Unpin" else "Pin", c.pinned) { store.pin(roomId, !c.pinned) }
                QuickAction(Icons.Rounded.NotificationsOff, if (isMuted) "Unmute" else "Mute", isMuted) { if (isMuted) store.setMuted(roomId, false) else muteSheet = true }
                QuickAction(Icons.Rounded.Alarm, "Remind") { remindSheet = true }
            }
            SettingsGroup {
                SwitchRow("Low priority", "Quiet, except @mentions and replies", c.lowPriority) { store.setLowPriority(roomId, it) }; GroupDivider()
                SwitchRow("Archived", checked = c.archived) { store.setTag(roomId, "u.archived", it) }; GroupDivider()
                SwitchRow("Marked unread", checked = c.markedUnread) { store.markUnread(roomId, it) }; GroupDivider()
                NavRow("Labels", if (c.labels.isEmpty()) "None" else c.labels.joinToString(), Icons.AutoMirrored.Rounded.Label, Color(0xFFF59E0B)) { labelSheet = true }; GroupDivider()
                NavRow("Snooze…", "Hide this chat and bring it back later", Icons.Rounded.Snooze, Color(0xFF8B5CF6)) { snoozeSheet = true }
            }

            // Shared media, links and files from what's loaded on this device.
            Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("photos" to "Photos ${photos.size}", "links" to "Links ${links.size}", "files" to "Files ${files.size}").forEach { (id, label) ->
                    val on = tab == id
                    Text(label, style = MaterialTheme.typography.labelLarge, color = if (on) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant).clickable { tab = id }.padding(horizontal = 14.dp, vertical = 8.dp))
                }
            }
            when (tab) {
                "photos" -> if (photos.isEmpty()) Text("No photos loaded yet. Scroll up in the chat to load more.", Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                else Column(Modifier.padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    photos.take(60).chunked(3).forEach { row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            row.forEach { m ->
                                val img = rememberMxcImage(m.mxc, 300)
                                Box(Modifier.weight(1f).aspectRatio(1f).clip(RoundedCornerShape(8.dp)).background(MaterialTheme.colorScheme.surfaceVariant).clickable { viewer = m.id }) { if (img != null) Image(img, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
                            }
                            repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                        }
                    }
                }
                "links" -> if (links.isEmpty()) Text("No links shared.", Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                else SettingsGroup { links.take(40).forEachIndexed { i, (m, u) -> if (i > 0) GroupDivider(); NavRow(u, "${c.nameOf(m.sender)} · ${timeLabel(m.ts)}", Icons.Rounded.Link, Color(0xFF0EA5E9)) { runCatching { store.openUrl(android.net.Uri.parse(u)) } } } }
                else -> if (files.isEmpty()) Text("No files shared.", Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                else SettingsGroup { files.take(40).forEachIndexed { i, m -> if (i > 0) GroupDivider(); NavRow(m.body.ifEmpty { previewOf(m) }, "${c.nameOf(m.sender)} · ${m.size?.let { humanSize(it) } ?: ""}", Icons.Rounded.InsertDriveFile, Color(0xFF14B8A6)) { m.mxc?.let { x -> scope.launch { store.media.open(x, m.body.ifEmpty { "file" }, m.mime) } } } } }
            }

            SettingsGroup("Members${members?.let { " (${it.size})" } ?: ""}") {
                val list = (members ?: c.members).entries.sortedBy { it.value.lowercase() }
                list.forEachIndexed { i, (id, display) ->
                    if (i > 0) GroupDivider()
                    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Avatar(display, null, 38.dp); Spacer(Modifier.width(14.dp))
                        Column { Text(if (id == me) "$display (you)" else display); Text(id, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                }
                if (members == null) Text("Loading members…", Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            SettingsGroup { ButtonRow("Delete chat", danger = true) { confirmLeave = true } }
        }
    }

    if (confirmLeave) AlertDialog(
        onDismissRequest = { confirmLeave = false }, title = { Text("Delete this chat?") },
        text = { Text("It will be removed from Pager. The conversation on ${networkMeta(c.network).label} isn't deleted, and it comes back if someone writes again.") },
        confirmButton = { TextButton(onClick = { confirmLeave = false; store.leave(roomId); onLeft() }) { Text("Delete", color = MaterialTheme.colorScheme.error) } },
        dismissButton = { TextButton(onClick = { confirmLeave = false }) { Text("Cancel") } },
    )
    if (rename) {
        var v by remember { mutableStateOf(c.name) }
        AlertDialog(
            onDismissRequest = { rename = false }, title = { Text("Rename group") },
            text = { OutlinedTextField(v, { v = it }, singleLine = true) },
            confirmButton = { TextButton(enabled = v.isNotBlank(), onClick = { store.rename(roomId, v.trim()); rename = false }) { Text("Save") } },
            dismissButton = { TextButton(onClick = { rename = false }) { Text("Cancel") } },
        )
    }
    if (muteSheet) MuteSheet("Mute $name", { ms -> store.setMuted(roomId, true, ms); muteSheet = false }, { muteSheet = false })
    if (remindSheet) WhenSheet("Remind me about $name", { store.remind(roomId, it); remindSheet = false }, { remindSheet = false })
    if (snoozeSheet) WhenSheet("Snooze until", { store.snooze(roomId, it); snoozeSheet = false; onLeft() }, { snoozeSheet = false })
    if (labelSheet) LabelSheet(listOf(roomId)) { labelSheet = false }
    viewer?.let { id -> ImageViewer(photos.reversed(), id, senderName = { c.nameOf(it) }) { viewer = null } }
}

@Composable
private fun QuickAction(icon: ImageVector, label: String, active: Boolean = false, onClick: () -> Unit) {
    Column(Modifier.width(76.dp).clip(RoundedCornerShape(16.dp)).clickable(onClick = onClick).padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(52.dp).clip(CircleShape).background(if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface), contentAlignment = Alignment.Center) {
            Icon(icon, label, tint = if (active) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.primary)
        }
        Text(label, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 6.dp), maxLines = 1)
    }
}
