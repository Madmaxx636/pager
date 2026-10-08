@file:OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)

package app.pager.android

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
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
        Text(
            "Each app you connect is bridged through your own server. Pager shows if a connection needs attention.",
            fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
        )
        if (networks.isEmpty()) Text("Loading…", Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        networks.forEach { n ->
            val meta = networkMeta(n.id)
            SectionHeader(n.name)
            if (n.unavailable) Text("This bridge isn't responding right now.", color = Color(0xFFF59E0B), modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp))
            n.logins.forEach { l ->
                val (label, color) = loginStateLabel(l.state)
                Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(10.dp).clip(CircleShape).background(color))
                    Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                        Text(l.name)
                        Text(label, fontSize = 12.sp, color = color)
                    }
                    if (needsAttention(l.state)) TextButton(onClick = { relogin = n }) { Text("Sign in") }
                    TextButton(onClick = { scope.launchSafely { store.pager.logout(n.id, l.id); store.refreshBridges() } }) { Text("Disconnect", color = MaterialTheme.colorScheme.error) }
                }
            }
            if (n.logins.isEmpty()) Text("Not connected", Modifier.padding(horizontal = 20.dp, vertical = 4.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            TextButton(onClick = { relogin = n }, Modifier.padding(horizontal = 12.dp)) { Text(if (n.logins.isEmpty()) "Connect ${meta.label}" else "Add another ${meta.label} account") }
            SwitchRow("Show ${meta.label} chats in inbox", null, n.id !in s.hiddenNetworks) { on ->
                store.settings.update { copy(hiddenNetworks = if (on) hiddenNetworks - n.id else hiddenNetworks + n.id) }
            }
        }
        Spacer(Modifier.height(12.dp))
        Button(onClick = { adding = true }, Modifier.padding(horizontal = 20.dp)) { Text("All accounts…") }
    }
    relogin?.let { AccountsDialog(store, initial = it) { relogin = null } }
    if (adding) AccountsDialog(store) { adding = false }
}

private fun kotlinx.coroutines.CoroutineScope.launchSafely(block: suspend () -> Unit) {
    this.launch { runCatching { block() } }
}

@Composable
fun StarredScreen(onBack: () -> Unit, onOpen: (String) -> Unit) {
    val store = LocalStore.current
    val stars by store.stars.collectAsState()
    SettingsPage("Starred messages", onBack) {
        if (stars.isEmpty()) Text("Nothing starred yet. Long-press a message and choose Star.", Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        stars.sortedByDescending { it.ts }.forEach { st ->
            Column(Modifier.fillMaxWidth().clickable { onOpen(st.roomId) }.padding(horizontal = 20.dp, vertical = 10.dp)) {
                Text("${st.sender} · ${st.chat}", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
                Text(st.text, maxLines = 3, overflow = TextOverflow.Ellipsis)
                Text(DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(st.ts)), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
        SectionHeader("Scheduled messages")
        if (scheduled.isEmpty()) Text("No scheduled messages. Long-press the send button in a chat to schedule one.", Modifier.padding(horizontal = 20.dp, vertical = 8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        scheduled.sortedBy { it.whenMs }.forEach { m ->
            Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("To ${m.chat} · ${fmt.format(Date(m.whenMs))}", fontSize = 12.sp, color = MaterialTheme.colorScheme.primary)
                    Text(m.text, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
                TextButton(onClick = { store.cancelScheduled(m) }) { Text("Cancel", color = MaterialTheme.colorScheme.error) }
            }
        }
        SectionHeader("Chat reminders")
        if (reminders.isEmpty()) Text("No reminders. Long-press a chat in the inbox and choose Remind me.", Modifier.padding(horizontal = 20.dp, vertical = 8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        reminders.sortedBy { it.whenMs }.forEach { r ->
            Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) { Text(r.chat); Text(fmt.format(Date(r.whenMs)), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                TextButton(onClick = { store.reminders.cancel(r); reminders = store.reminders.all() }) { Text("Cancel", color = MaterialTheme.colorScheme.error) }
            }
        }
    }
}

/** Search every chat (or one) for text. */
@Composable
fun SearchScreen(roomId: String?, onBack: () -> Unit, onOpen: (String) -> Unit) {
    val store = LocalStore.current
    var q by remember { mutableStateOf("") }
    var hits by remember { mutableStateOf<List<SearchHit>?>(null) }
    var busy by remember { mutableStateOf(false) }
    LaunchedEffect(q) {
        if (q.trim().length < 2) { hits = null; return@LaunchedEffect }
        delay(350)
        busy = true
        hits = store.search(q.trim(), roomId)
        busy = false
    }
    Column(Modifier.fillMaxSize()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹", fontSize = 28.sp) }
            OutlinedTextField(q, { q = it }, placeholder = { Text(if (roomId == null) "Search all messages" else "Search this chat") }, singleLine = true, shape = RoundedCornerShape(14.dp), modifier = Modifier.weight(1f).padding(end = 12.dp))
        }
        val list = hits
        when {
            busy -> Text("Searching…", Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            list == null -> Text("Type at least two letters.", Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            list.isEmpty() -> Text("No matches.", Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            else -> LazyColumn(Modifier.fillMaxSize()) {
                items(list, key = { it.eventId + it.roomId }) { h ->
                    val chat = store.chatNow(h.roomId)
                    Column(Modifier.fillMaxWidth().clickable { onOpen(h.roomId) }.padding(horizontal = 20.dp, vertical = 10.dp)) {
                        Text("${chat?.nameOf(h.sender) ?: h.sender}${if (roomId == null && chat != null) " · ${SyncReducer.displayName(chat, store.me)}" else ""}", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
                        Text(h.text, maxLines = 3, overflow = TextOverflow.Ellipsis)
                        Text(DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(h.ts)), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
    Column(Modifier.fillMaxSize()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹", fontSize = 28.sp) }
            Text(title, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        }
        OutlinedTextField(q, { q = it }, placeholder = { Text("Search chats") }, singleLine = true, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp))
        LazyColumn(Modifier.fillMaxSize()) {
            items(shown, key = { it.id }) { c ->
                Row(Modifier.fillMaxWidth().clickable { onPick(c.id) }.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Avatar(c.name, c.network, 42.dp, c.avatarMxc)
                    Spacer(Modifier.width(12.dp))
                    Column { Text(c.name, fontWeight = FontWeight.SemiBold); Text(networkMeta(c.network).label, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            }
        }
    }
}
