@file:OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class, androidx.compose.material3.ExperimentalMaterial3Api::class)

package app.pager.android

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Label
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Alarm
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.InsertDriveFile
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.Videocam
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.DateFormat
import java.util.Date

fun loginStateLabel(state: String): Pair<String, Color> = when (state) {
    "CONNECTED" -> "Connected" to Color(0xFF22C55E)
    "CONNECTING", "TRANSIENT_DISCONNECT" -> "Reconnecting…" to Color(0xFFF59E0B)
    "BAD_CREDENTIALS", "LOGGED_OUT" -> "Sign in again" to Color(0xFFEF4444)
    "UNKNOWN_ERROR" -> "Error" to Color(0xFFEF4444)
    "" -> "Unknown" to Color(0xFF8A94A6)
    else -> state.lowercase().replace('_', ' ').replaceFirstChar { it.uppercase() } to Color(0xFF8A94A6)
}

fun needsAttention(state: String) = state == "BAD_CREDENTIALS" || state == "LOGGED_OUT" || state == "UNKNOWN_ERROR"

/** Settings → Bridges & accounts: status of every connected app, plus per-network controls. */
@Composable
fun BridgesScreen(onBack: () -> Unit) {
    val store = LocalStore.current
    val s = LocalSettings.current
    val networks by store.bridges.collectAsState()
    val scope = rememberCoroutineScope()
    var relogin by remember { mutableStateOf<Network?>(null) }
    var adding by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { store.refreshBridges() }

    SettingsPage("Bridges & accounts", onBack) {
        Text("Each app you connect is bridged through your own server. Pager shows if a connection needs attention.", Modifier.padding(horizontal = 20.dp, vertical = 8.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (networks.isEmpty()) Text("Loading…", Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        networks.forEach { n ->
            val meta = networkMeta(n.id)
            SettingsGroup(n.name, footer = if (n.unavailable) "This bridge isn't responding right now." else null) {
                n.logins.forEach { l ->
                    val (label, color) = loginStateLabel(l.state)
                    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(10.dp).clip(CircleShape).background(color))
                        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) { Text(l.name); Text(label, style = MaterialTheme.typography.labelMedium, color = color) }
                        if (needsAttention(l.state)) TextButton(onClick = { relogin = n }) { Text("Sign in") }
                        TextButton(onClick = { scope.launch { runCatching { store.pager.logout(n.id, l.id) }; store.refreshBridges() } }) { Text("Disconnect", color = MaterialTheme.colorScheme.error) }
                    }
                    GroupDivider()
                }
                if (n.logins.isEmpty()) { Text("Not connected", Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant); GroupDivider() }
                ButtonRow(if (n.logins.isEmpty()) "Connect ${meta.label}" else "Add another ${meta.label} account") { relogin = n }
                GroupDivider()
                SwitchRow("Show ${meta.label} chats in inbox", null, n.id !in s.hiddenNetworks) { on -> store.settings.update { copy(hiddenNetworks = if (on) hiddenNetworks - n.id else hiddenNetworks + n.id) } }
            }
        }
    }
    relogin?.let { AccountsDialog(store, initial = it) { relogin = null } }
    if (adding) AccountsDialog(store) { adding = false }
}

@Composable
fun StarredScreen(onBack: () -> Unit, onOpen: (String) -> Unit) {
    val store = LocalStore.current
    val stars by store.stars.collectAsState()
    SettingsPage("Starred messages", onBack) {
        if (stars.isEmpty()) EmptyState(Icons.Rounded.Star, "Nothing starred yet", "Long-press a message and choose Star to save it here.")
        else SettingsGroup {
            stars.sortedByDescending { it.ts }.forEachIndexed { i, st ->
                if (i > 0) GroupDivider()
                Column(Modifier.fillMaxWidth().clickable { onOpen(st.roomId) }.padding(horizontal = 16.dp, vertical = 12.dp)) {
                    Text("${st.sender} · ${st.chat}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                    Text(st.text, maxLines = 3, overflow = TextOverflow.Ellipsis)
                    Text(DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(st.ts)), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
fun ScheduledScreen(onBack: () -> Unit) {
    val store = LocalStore.current
    val scheduled by store.scheduled.collectAsState()
    var reminders by remember { mutableStateOf(store.reminders.all()) }
    val fmt = remember { DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT) }
    SettingsPage("Scheduled & reminders", onBack) {
        SettingsGroup("Scheduled messages", footer = if (scheduled.isEmpty()) "Hold the send button in a chat to schedule a message." else null) {
            scheduled.sortedBy { it.whenMs }.forEachIndexed { i, m ->
                if (i > 0) GroupDivider()
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) { Text("To ${m.chat} · ${fmt.format(Date(m.whenMs))}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary); Text(m.text, maxLines = 2, overflow = TextOverflow.Ellipsis) }
                    TextButton(onClick = { store.cancelScheduled(m) }) { Text("Cancel", color = MaterialTheme.colorScheme.error) }
                }
            }
            if (scheduled.isEmpty()) Text("No scheduled messages", Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        SettingsGroup("Reminders & snoozed chats", footer = if (reminders.isEmpty()) "Long-press a chat in the inbox and choose Remind me or Snooze." else null) {
            reminders.sortedBy { it.whenMs }.forEachIndexed { i, r ->
                if (i > 0) GroupDivider()
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) { Text(r.chat); Text((if (r.snooze) "Snoozed until " else "") + fmt.format(Date(r.whenMs)), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    TextButton(onClick = { store.reminders.cancel(r); reminders = store.reminders.all() }) { Text("Cancel", color = MaterialTheme.colorScheme.error) }
                }
            }
            if (reminders.isEmpty()) Text("No reminders", Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** Search every chat (or one): by words, narrowed by media type. */
@Composable
fun SearchScreen(roomId: String?, onBack: () -> Unit, onOpen: (String) -> Unit) {
    val store = LocalStore.current
    var q by remember { mutableStateOf("") }
    var kind by remember { mutableStateOf("all") }
    var hits by remember { mutableStateOf<List<SearchHit>?>(null) }
    var busy by remember { mutableStateOf(false) }
    LaunchedEffect(q, kind) {
        val text = q.trim()
        if (text.length < 2 && kind == "all") { hits = null; return@LaunchedEffect }
        busy = true
        val local = store.searchLocal(text, roomId, kind)
        hits = local
        delay(300)
        // Words also go to the server, which can see older history than this device has loaded.
        if (kind == "all" && text.length >= 2) {
            val remote = store.search(text, roomId)
            hits = (local + remote).distinctBy { it.eventId.ifEmpty { it.roomId + it.ts } }.sortedByDescending { it.ts }
        }
        busy = false
    }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Row(Modifier.fillMaxWidth().padding(end = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            BackButton(onBack)
            SearchPill(q, { q = it }, if (roomId == null) "Search all messages" else "Search this chat", Modifier.weight(1f))
        }
        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("all" to ("All" to Icons.Rounded.Search), "images" to ("Photos" to Icons.Rounded.Image), "videos" to ("Videos" to Icons.Rounded.Videocam), "links" to ("Links" to Icons.Rounded.Link), "files" to ("Files" to Icons.Rounded.InsertDriveFile)).forEach { (id, v) ->
                item {
                    val on = kind == id
                    Row(Modifier.clip(RoundedCornerShape(50)).background(if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant).clickable { kind = id }.padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(v.second, null, tint = if (on) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp)); Text(v.first, color = if (on) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }
        val list = hits
        when {
            list == null -> EmptyState(Icons.Rounded.Search, "Search your chats", "Find messages, photos, links and files across every network.")
            list.isEmpty() -> EmptyState(Icons.Rounded.Search, if (busy) "Searching…" else "No matches")
            else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
                items(list, key = { it.roomId + it.eventId + it.ts }) { h ->
                    val chat = store.chatNow(h.roomId)
                    val name = chat?.let { SyncReducer.displayName(it, store.me) } ?: "Chat"
                    Row(Modifier.fillMaxWidth().clickable { onOpen(h.roomId) }.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Avatar(name, chat?.network, 44.dp, chat?.avatarMxc); Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(if (roomId == null) "$name · ${chat?.nameOf(h.sender) ?: h.sender}" else (chat?.nameOf(h.sender) ?: h.sender), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                            Text(h.text, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            Text(DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(h.ts)), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}

/** Choose a chat from the inbox. Used for Forward and for "Share to Pager". */
@Composable
fun ChatPicker(title: String, onBack: () -> Unit, onPick: (String) -> Unit) {
    val store = LocalStore.current
    val all by store.inbox.collectAsState()
    var q by remember { mutableStateOf("") }
    val shown = all.filter { q.isBlank() || it.name.contains(q.trim(), ignoreCase = true) }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        TopBar(title, onBack)
        SearchPill(q, { q = it }, "Search chats", Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
        LazyColumn(Modifier.fillMaxSize()) {
            items(shown, key = { it.id }) { c ->
                Row(Modifier.fillMaxWidth().clickable { onPick(c.id) }.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Avatar(c.name, c.network, 46.dp, c.avatarMxc)
                    Spacer(Modifier.width(14.dp))
                    Column { Text(c.name, style = MaterialTheme.typography.titleMedium); Text(networkMeta(c.network).label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            }
        }
    }
}
