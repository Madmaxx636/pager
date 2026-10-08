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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.text.DateFormat
import java.util.Date

fun timeLabel(ts: Long): String {
    if (ts == 0L) return ""
    val now = System.currentTimeMillis()
    val day = 86_400_000L
    return when {
        now - ts < day -> DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(ts))
        else -> DateFormat.getDateInstance(DateFormat.SHORT).format(Date(ts))
    }
}

@Composable
fun InboxScreen(store: Store, onOpen: (String) -> Unit) {
    val session by store.session.collectAsState()
    val all by store.chats.collectAsState()
    val synced by store.synced.collectAsState()
    val me = session?.userId ?: ""
    var query by remember { mutableStateOf("") }
    var net by remember { mutableStateOf("all") }
    var accounts by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }

    val chats = all.values.filter { !it.isBotRoom(me) }.sortedByDescending { it.lastTs }
    val networks = chats.map { it.network }.distinct().sorted()
    val q = query.trim().lowercase()
    val shown = chats.filter { c ->
        (net == "all" || c.network == net) &&
            (q.isEmpty() || SyncReducer.displayName(c, me).lowercase().contains(q) || c.preview.lowercase().contains(q))
    }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Pager", fontSize = 24.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            TextButton(onClick = { accounts = true }) { Text("＋ Add", fontWeight = FontWeight.SemiBold) }
            Box {
                TextButton(onClick = { menu = true }) { Text("⋯", fontSize = 20.sp) }
                DropdownMenu(menu, { menu = false }) {
                    DropdownMenuItem(text = { Text(me, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp) }, onClick = {}, enabled = false)
                    DropdownMenuItem(text = { Text("Connected accounts") }, onClick = { menu = false; accounts = true })
                    DropdownMenuItem(text = { Text("Sign out") }, onClick = { menu = false; store.signOut() })
                }
            }
        }
        OutlinedTextField(
            query, { query = it }, placeholder = { Text("Search chats") }, singleLine = true,
            shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
        )
        if (networks.size > 1) {
            LazyRow(contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                item { Chip("All", null, net == "all") { net = "all" } }
                items(networks) { n -> Chip(networkMeta(n).label, networkMeta(n).color, net == n) { net = n } }
            }
            Spacer(Modifier.height(6.dp))
        }

        if (shown.isEmpty()) {
            Column(Modifier.fillMaxSize().padding(32.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                if (!synced) Text("Syncing…", color = MaterialTheme.colorScheme.onSurfaceVariant)
                else if (chats.isEmpty()) {
                    Text("No chats yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(12.dp))
                    Button(onClick = { accounts = true }) { Text("Connect your first account") }
                } else Text("No matches.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else LazyColumn(Modifier.fillMaxSize()) {
            items(shown, key = { it.id }) { c -> ChatRow(c, SyncReducer.displayName(c, me)) { onOpen(c.id) } }
        }
    }
    if (accounts) AccountsDialog(store) { accounts = false }
}

@Composable
private fun Chip(label: String, dot: androidx.compose.ui.graphics.Color?, on: Boolean, click: () -> Unit) {
    val bg = if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant
    val fg = if (on) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant
    Row(
        Modifier.clip(CircleShape).background(bg).clickable(onClick = click).padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (dot != null) { Box(Modifier.size(8.dp).clip(CircleShape).background(dot)); Spacer(Modifier.width(6.dp)) }
        Text(label, color = fg, fontSize = 13.sp, fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal)
    }
}

@Composable
private fun ChatRow(c: ChatState, name: String, click: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = click).padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Avatar(name, c.network)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row {
                Text(name, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Text(timeLabel(c.lastTs), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(c.preview, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                if (c.unread > 0) {
                    Spacer(Modifier.width(8.dp))
                    Box(Modifier.clip(CircleShape).background(MaterialTheme.colorScheme.primary).padding(horizontal = 7.dp, vertical = 2.dp)) {
                        Text(if (c.unread > 99) "99+" else "${c.unread}", color = MaterialTheme.colorScheme.onPrimary, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}
