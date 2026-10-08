package app.pager.android

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun ChatInfoScreen(roomId: String, onBack: () -> Unit, onLeft: () -> Unit, onSearch: () -> Unit) {
    val store = LocalStore.current
    val chat by remember(roomId) { store.chat(roomId) }.collectAsState(null)
    val me = store.session.collectAsState().value?.userId ?: ""
    val muted by store.muted.collectAsState()
    var members by remember { mutableStateOf<Map<String, String>?>(null) }
    var confirmLeave by remember { mutableStateOf(false) }
    var rename by remember { mutableStateOf(false) }
    var muteDialog by remember { mutableStateOf(false) }
    var remindDialog by remember { mutableStateOf(false) }
    LaunchedEffect(roomId) { members = store.members(roomId) }

    val c = chat ?: run { onBack(); return }
    val name = SyncReducer.displayName(c, me)
    val onSurfaceVariant = MaterialTheme.colorScheme.onSurfaceVariant
    val media = remember(c.messages) { c.messages.filter { it.type == "m.image" && it.mxc != null && !it.sticker }.takeLast(40).reversed() }
    val isMuted = roomId in muted

    LazyColumn(Modifier.fillMaxSize()) {
        item {
            Row(Modifier.fillMaxWidth().padding(4.dp), verticalAlignment = Alignment.CenterVertically) { TextButton(onClick = onBack) { Text("‹", fontSize = 28.sp) } }
            Column(Modifier.fillMaxWidth().padding(bottom = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Avatar(name, c.network, 96.dp, c.avatarMxc)
                Spacer(Modifier.height(12.dp))
                Text(name, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                Text("${networkMeta(c.network).label}${if (c.isGroup) " · ${c.memberCount} members" else ""}", color = onSurfaceVariant)
                if (c.isGroup) TextButton(onClick = { rename = true }) { Text("Rename group") }
            }
        }
        item {
            NavRow("Search in this chat", null, "🔍", onSearch)
            NavRow("Remind me about this chat", null, "⏰") { remindDialog = true }
            ToggleRow("Pinned", c.pinned) { store.setTag(roomId, "m.favourite", it) }
            ToggleRow(if (isMuted) "Muted${store.muteLeft(roomId)?.takeIf { it > 0 }?.let { " · ${it / 3_600_000 + 1}h left" } ?: ""}" else "Muted", isMuted) { on -> if (on) muteDialog = true else store.setMuted(roomId, false) }
            ToggleRow("Archived", c.archived) { store.setTag(roomId, "u.archived", it) }
            ToggleRow("Marked unread", c.markedUnread) { store.markUnread(roomId, it) }
            if (media.isNotEmpty()) {
                Text("Shared photos", fontWeight = FontWeight.SemiBold, color = onSurfaceVariant, modifier = Modifier.padding(start = 20.dp, top = 16.dp, bottom = 8.dp))
                LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(media, key = { it.id }) { m ->
                        val img = rememberMxcImage(m.mxc, 256)
                        Row(Modifier.size(92.dp).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) {
                            if (img != null) Image(img, null, Modifier.size(92.dp), contentScale = ContentScale.Crop)
                        }
                    }
                }
            }
            Text("Leave chat", color = MaterialTheme.colorScheme.error, modifier = Modifier.fillMaxWidth().clickable { confirmLeave = true }.padding(horizontal = 20.dp, vertical = 16.dp))
            Text("Members${members?.let { " (${it.size})" } ?: ""}", fontWeight = FontWeight.SemiBold, color = onSurfaceVariant, modifier = Modifier.padding(start = 20.dp, top = 12.dp, bottom = 4.dp))
        }
        val list = (members ?: c.members).entries.sortedBy { it.value.lowercase() }
        items(list, key = { it.key }) { (id, display) ->
            Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Avatar(display, null, 36.dp)
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(if (id == me) "$display (you)" else display)
                    Text(id, fontSize = 11.sp, color = onSurfaceVariant)
                }
            }
        }
        if (members == null) item { Text("Loading members…", color = onSurfaceVariant, modifier = Modifier.padding(20.dp)) }
    }

    if (confirmLeave) AlertDialog(
        onDismissRequest = { confirmLeave = false },
        title = { Text("Leave this chat?") },
        text = { Text("It will disappear from your inbox. The conversation on ${networkMeta(c.network).label} isn't deleted.") },
        confirmButton = { TextButton(onClick = { confirmLeave = false; store.leave(roomId); onLeft() }) { Text("Leave") } },
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
    if (muteDialog) AlertDialog(
        onDismissRequest = { muteDialog = false }, title = { Text("Mute $name") },
        text = {
            Column {
                listOf("For 1 hour" to 3_600_000L, "For 8 hours" to 8 * 3_600_000L, "For 1 week" to 7 * 86_400_000L, "Until I turn it back on" to null).forEach { (label, ms) ->
                    Text(label, Modifier.fillMaxWidth().clickable { store.setMuted(roomId, true, ms); muteDialog = false }.padding(vertical = 12.dp))
                }
            }
        },
        confirmButton = { TextButton(onClick = { muteDialog = false }) { Text("Cancel") } },
    )
    if (remindDialog) TimePresetDialog("Remind me about $name", { store.remind(roomId, it); remindDialog = false }, { remindDialog = false })
}

@Composable
private fun ToggleRow(label: String, on: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().clickable { onChange(!on) }.padding(horizontal = 20.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label)
        Switch(on, onChange)
    }
}
