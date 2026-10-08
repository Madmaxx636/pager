@file:OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class, androidx.compose.material3.ExperimentalMaterial3Api::class)

package app.pager.android

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberSwipeToDismissBoxState
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.text.DateFormat
import java.util.Calendar
import java.util.Date

private val clockFormat = ThreadLocal.withInitial { DateFormat.getTimeInstance(DateFormat.SHORT) }
private val dayFormat = ThreadLocal.withInitial { DateFormat.getDateInstance(DateFormat.SHORT) }

fun timeLabel(ts: Long): String {
    if (ts == 0L) return ""
    val fmt = if (System.currentTimeMillis() - ts < 86_400_000L) clockFormat.get()!! else dayFormat.get()!!
    return fmt.format(Date(ts))
}

/** Presets used by "Remind me" and "Schedule send". */
fun timePresets(): List<Pair<String, Long>> {
    val now = System.currentTimeMillis()
    fun at(daysAhead: Int, hour: Int) = Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, daysAhead); set(Calendar.HOUR_OF_DAY, hour); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0) }.timeInMillis
    val list = mutableListOf("In 1 hour" to now + 3_600_000L, "In 3 hours" to now + 3 * 3_600_000L)
    if (at(0, 20) > now + 600_000L) list += "This evening (8 PM)" to at(0, 20)
    list += "Tomorrow morning (9 AM)" to at(1, 9)
    list += "Next week (Mon 9 AM)" to Calendar.getInstance().apply {
        val d = (Calendar.MONDAY - get(Calendar.DAY_OF_WEEK) + 7) % 7; add(Calendar.DAY_OF_YEAR, if (d == 0) 7 else d)
        set(Calendar.HOUR_OF_DAY, 9); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0)
    }.timeInMillis
    return list
}

@Composable
fun TimePresetDialog(title: String, onPick: (Long) -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss, title = { Text(title) },
        text = { Column { timePresets().forEach { (label, at) -> Text(label, Modifier.fillMaxWidth().clickable { onPick(at) }.padding(vertical = 12.dp)) } } },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
fun InboxScreen(onOpen: (String) -> Unit, onNewChat: () -> Unit, onSearch: () -> Unit, onSettings: (String) -> Unit) {
    val store = LocalStore.current
    val s = LocalSettings.current
    val session by store.session.collectAsState()
    val all by store.inbox.collectAsState()
    val synced by store.synced.collectAsState()
    val bridges by store.bridges.collectAsState()
    val me = session?.userId ?: ""
    var query by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf("all") }
    var archivedView by remember { mutableStateOf(false) }
    var accounts by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }

    val archivedCount = all.count { it.archived }
    val visible = all.filter { it.archived == archivedView }
    val networks = visible.map { it.network }.distinct().sorted()
    val q = query.trim().lowercase()
    val unreadCount = visible.count { (it.unread > 0 || it.markedUnread) }
    val shown = visible.filter { c ->
        val passes = when {
            filter == "all" -> true
            filter == "unread" -> c.unread > 0 || c.markedUnread
            filter == "groups" -> c.isGroup
            filter == "dms" -> !c.isGroup
            filter == "fav" -> c.pinned
            filter.startsWith("net:") -> c.network == filter.removePrefix("net:")
            else -> true
        }
        passes && (q.isEmpty() || c.name.lowercase().contains(q) || c.preview.lowercase().contains(q))
    }
    val totalUnread = all.count { !it.archived && !it.muted && (it.unread > 0 || it.markedUnread) }
    val attention = bridges.flatMap { n -> n.logins.filter { needsAttention(it.state) }.map { n.name } }.distinct()

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 4.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(if (archivedView) "Archived" else "Pager", fontSize = 24.sp, fontWeight = FontWeight.Bold)
                if (!archivedView && totalUnread > 0) Text("  $totalUnread unread", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.weight(1f))
                if (archivedView) TextButton(onClick = { archivedView = false }) { Text("Inbox") }
                else TextButton(onClick = onSearch) { Text("🔍", fontSize = 18.sp) }
                Box {
                    TextButton(onClick = { menu = true }) { Text("⋯", fontSize = 20.sp) }
                    DropdownMenu(menu, { menu = false }) {
                        DropdownMenuItem(text = { Text(me, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp) }, onClick = {}, enabled = false)
                        DropdownMenuItem(text = { Text("Add or manage accounts") }, onClick = { menu = false; accounts = true })
                        DropdownMenuItem(text = { Text("Mark all as read") }, onClick = { menu = false; store.markAllRead() })
                        DropdownMenuItem(text = { Text(if (archivedView) "Back to inbox" else "Archived ($archivedCount)") }, onClick = { menu = false; archivedView = !archivedView })
                        DropdownMenuItem(text = { Text("Starred messages") }, onClick = { menu = false; onSettings("starred") })
                        DropdownMenuItem(text = { Text("Settings") }, onClick = { menu = false; onSettings("") })
                    }
                }
            }
            OutlinedTextField(
                query, { query = it }, placeholder = { Text("Filter chats") }, singleLine = true,
                shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
            )
            if (s.showFilterBar && !archivedView) {
                LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    item { Chip("All", null, filter == "all") { filter = "all" } }
                    item { Chip(if (unreadCount > 0) "Unread $unreadCount" else "Unread", null, filter == "unread") { filter = "unread" } }
                    item { Chip("Groups", null, filter == "groups") { filter = "groups" } }
                    item { Chip("DMs", null, filter == "dms") { filter = "dms" } }
                    item { Chip("Favorites", null, filter == "fav") { filter = "fav" } }
                    if (networks.size > 1) items(networks) { n -> Chip(networkMeta(n).label, networkMeta(n).color, filter == "net:$n") { filter = "net:$n" } }
                }
                Spacer(Modifier.height(6.dp))
            }
            if (attention.isNotEmpty() && !archivedView) {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp).clip(RoundedCornerShape(12.dp)).background(Color(0x33EF4444))
                        .clickable { onSettings("bridges") }.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("⚠️", fontSize = 16.sp)
                    Text("  ${attention.joinToString()} needs you to sign in again", Modifier.weight(1f), fontSize = 13.sp)
                    Text("Fix", fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
                }
            }

            if (shown.isEmpty()) {
                Column(Modifier.fillMaxSize().padding(32.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                    val muted = MaterialTheme.colorScheme.onSurfaceVariant
                    if (!synced) Text("Syncing…", color = muted)
                    else if (all.isEmpty()) {
                        Text("No chats yet.", color = muted)
                        Spacer(Modifier.height(12.dp))
                        Button(onClick = { accounts = true }) { Text("Connect your first account") }
                    } else Text(if (archivedView) "Nothing archived." else if (filter == "unread") "You're all caught up 🎉" else "No matches.", color = muted)
                }
            } else LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 88.dp)) {
                items(shown, key = { it.id }) { c -> ChatRow(c, onOpen) }
            }
        }
        if (!archivedView) {
            Box(
                Modifier.align(Alignment.BottomEnd).padding(20.dp).size(56.dp).clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primary).clickable(onClick = onNewChat),
                contentAlignment = Alignment.Center,
            ) { Text("✎", color = MaterialTheme.colorScheme.onPrimary, fontSize = 22.sp) }
        }
    }
    if (accounts) AccountsDialog(store) { accounts = false }
}

@Composable
private fun Chip(label: String, dot: Color?, on: Boolean, click: () -> Unit) {
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

private fun swipeLabel(action: String, c: ChatSummary) = when (action) {
    "archive" -> if (c.archived) "Unarchive" else "Archive"
    "read" -> if (c.unread > 0 || c.markedUnread) "Mark read" else "Mark unread"
    "pin" -> if (c.pinned) "Unpin" else "Pin"
    "mute" -> if (c.muted) "Unmute" else "Mute"
    else -> ""
}

@Composable
private fun ChatRow(c: ChatSummary, onOpen: (String) -> Unit) {
    val store = LocalStore.current
    val s = LocalSettings.current
    var menu by remember { mutableStateOf(false) }
    var muteDialog by remember { mutableStateOf(false) }
    var remindDialog by remember { mutableStateOf(false) }
    val unread = c.unread > 0 || c.markedUnread

    fun perform(action: String) = when (action) {
        "archive" -> store.setTag(c.id, "u.archived", !c.archived)
        "read" -> if (unread) store.markRead(c.id) else store.markUnread(c.id, true)
        "pin" -> store.setTag(c.id, "m.favourite", !c.pinned)
        "mute" -> if (c.muted) store.setMuted(c.id, false) else muteDialog = true
        else -> {}
    }

    val dismiss = rememberSwipeToDismissBoxState(confirmValueChange = { v ->
        when (v) {
            SwipeToDismissBoxValue.StartToEnd -> perform(s.swipeRight)
            SwipeToDismissBoxValue.EndToStart -> perform(s.swipeLeft)
            else -> {}
        }
        false // always snap back; the action already happened
    })
    val vPad = if (s.density == "compact") 6.dp else 10.dp
    val avatar = if (s.density == "compact") 40.dp else 48.dp

    Box {
        SwipeToDismissBox(
            state = dismiss,
            enableDismissFromStartToEnd = s.swipeRight != "none",
            enableDismissFromEndToStart = s.swipeLeft != "none",
            backgroundContent = {
                val start = dismiss.dismissDirection == SwipeToDismissBoxValue.StartToEnd
                Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.primary.copy(alpha = 0.25f)).padding(horizontal = 24.dp), contentAlignment = if (start) Alignment.CenterStart else Alignment.CenterEnd) {
                    Text(swipeLabel(if (start) s.swipeRight else s.swipeLeft, c), fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
                }
            },
        ) {
            Row(
                Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.background).combinedClickable(onClick = { onOpen(c.id) }, onLongClick = { menu = true })
                    .padding(horizontal = 16.dp, vertical = vPad),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (s.showAvatars) { Avatar(c.name, if (s.showNetworkBadges) c.network else null, avatar, c.avatarMxc); Spacer(Modifier.width(12.dp)) }
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(c.name, fontWeight = if (unread) FontWeight.Bold else FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                        if (c.muted) Text("  🔕", fontSize = 12.sp)
                        Spacer(Modifier.weight(1f))
                        Text(remember(c.ts) { timeLabel(c.ts) }, fontSize = 12.sp, color = if (unread && !c.muted) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (s.showNetworkNameInRows) Text(networkMeta(c.network).label, fontSize = 11.sp, color = networkMeta(c.network).color)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        when {
                            c.draft != null -> Text(buildDraft(c.draft), maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 14.sp, modifier = Modifier.weight(1f))
                            s.showPreviews -> Text(c.preview, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                            else -> Spacer(Modifier.weight(1f))
                        }
                        if (c.pinned) Text("📌", fontSize = 12.sp)
                        if (unread) {
                            Spacer(Modifier.width(8.dp))
                            Box(
                                Modifier.clip(CircleShape).background(if (c.muted) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.primary).padding(horizontal = 7.dp, vertical = 2.dp),
                            ) { Text(if (c.unread > 99) "99+" else if (c.unread > 0) "${c.unread}" else "•", color = MaterialTheme.colorScheme.onPrimary, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
                        }
                    }
                }
            }
        }
        DropdownMenu(menu, { menu = false }) {
            DropdownMenuItem(text = { Text(if (c.pinned) "Unpin" else "Pin") }, onClick = { menu = false; perform("pin") })
            DropdownMenuItem(text = { Text(if (c.muted) "Unmute" else "Mute…") }, onClick = { menu = false; perform("mute") })
            DropdownMenuItem(text = { Text(if (unread) "Mark as read" else "Mark as unread") }, onClick = { menu = false; perform("read") })
            DropdownMenuItem(text = { Text(if (c.archived) "Unarchive" else "Archive") }, onClick = { menu = false; perform("archive") })
            DropdownMenuItem(text = { Text("Remind me…") }, onClick = { menu = false; remindDialog = true })
        }
    }
    if (muteDialog) AlertDialog(
        onDismissRequest = { muteDialog = false }, title = { Text("Mute ${c.name}") },
        text = {
            Column {
                listOf("For 1 hour" to 3_600_000L, "For 8 hours" to 8 * 3_600_000L, "For 1 week" to 7 * 86_400_000L, "Until I turn it back on" to null).forEach { (label, ms) ->
                    Text(label, Modifier.fillMaxWidth().clickable { store.setMuted(c.id, true, ms); muteDialog = false }.padding(vertical = 12.dp))
                }
            }
        },
        confirmButton = { TextButton(onClick = { muteDialog = false }) { Text("Cancel") } },
    )
    if (remindDialog) TimePresetDialog("Remind me about ${c.name}", { store.remind(c.id, it); remindDialog = false }, { remindDialog = false })
}

@Composable
private fun buildDraft(text: String) = androidx.compose.ui.text.buildAnnotatedString {
    pushStyle(androidx.compose.ui.text.SpanStyle(color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold))
    append("Draft: ")
    pop()
    append(text.replace('\n', ' '))
}
