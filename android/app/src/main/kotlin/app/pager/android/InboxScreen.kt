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
import androidx.compose.foundation.layout.defaultMinSize
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
import androidx.compose.material.icons.rounded.AccessTime
import androidx.compose.material.icons.rounded.Alarm
import androidx.compose.material.icons.rounded.Archive
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.DoneAll
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Inbox
import androidx.compose.material.icons.rounded.KeyboardArrowLeft
import androidx.compose.material.icons.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.LowPriority
import androidx.compose.material.icons.rounded.ManageAccounts
import androidx.compose.material.icons.rounded.MarkChatRead
import androidx.compose.material.icons.rounded.MarkChatUnread
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.NotificationsOff
import androidx.compose.material.icons.rounded.PushPin
import androidx.compose.material.icons.rounded.RadioButtonUnchecked
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Snooze
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.Unarchive
import androidx.compose.material.icons.rounded.Warning
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.text.DateFormat
import java.util.Date

private val clockFormat = ThreadLocal.withInitial { DateFormat.getTimeInstance(DateFormat.SHORT) }
private val dayFormat = ThreadLocal.withInitial { DateFormat.getDateInstance(DateFormat.SHORT) }

fun timeLabel(ts: Long): String {
    if (ts == 0L) return ""
    val fmt = if (System.currentTimeMillis() - ts < 86_400_000L) clockFormat.get()!! else dayFormat.get()!!
    return fmt.format(Date(ts))
}

private data class Filters(val groups: Boolean = false, val dms: Boolean = false, val drafts: Boolean = false, val unanswered: Boolean = false, val network: String? = null) {
    val count get() = listOf(groups, dms, drafts, unanswered, network != null).count { it }
}

private fun inTab(c: ChatSummary, tab: String): Boolean {
    val unread = c.unread > 0 || c.markedUnread
    return when {
        tab == "inbox" -> !c.archived && !c.lowPriority
        tab == "unread" -> !c.archived && !c.lowPriority && unread
        tab == "low" -> c.lowPriority && !c.archived
        tab == "archive" -> c.archived
        tab.startsWith("label:") -> tab.removePrefix("label:") in c.labels && !c.archived
        else -> true
    }
}

@Composable
fun InboxScreen(onOpen: (String) -> Unit, onNewChat: () -> Unit, onSearch: () -> Unit, onSettings: (String) -> Unit) {
    val store = LocalStore.current
    val s = LocalSettings.current
    val session by store.session.collectAsState()
    val all by store.inbox.collectAsState()
    val synced by store.synced.collectAsState()
    val bridges by store.bridges.collectAsState()
    val labels by store.labels.collectAsState()
    val haptic = LocalHapticFeedback.current
    val me = session?.userId ?: ""
    var query by remember { mutableStateOf("") }
    var tab by remember { mutableStateOf(if (s.defaultTab == "unread") "unread" else "inbox") }
    var filters by remember { mutableStateOf(Filters()) }
    var accounts by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    var filterSheet by remember { mutableStateOf(false) }
    var menuFor by remember { mutableStateOf<ChatSummary?>(null) }
    var labelFor by remember { mutableStateOf<List<String>?>(null) }
    var muteFor by remember { mutableStateOf<List<String>?>(null) }
    var snoozeFor by remember { mutableStateOf<String?>(null) }
    var remindFor by remember { mutableStateOf<String?>(null) }
    val selected = remember { mutableStateListOf<String>() }
    val selecting = selected.isNotEmpty()

    val unreadCount = all.count { inTab(it, "unread") }
    val q = query.trim().lowercase()
    val pinsRow = s.showPinsRow && tab == "inbox" && q.isEmpty() && filters.count == 0
    val pins = if (pinsRow) all.filter { it.pinned && !it.archived && !it.lowPriority }.sortedBy { it.pinOrder } else emptyList()
    val shown = all.filter { c ->
        inTab(c, tab) && c.id !in pins.map { it.id } &&
            (!filters.groups || c.isGroup) && (!filters.dms || !c.isGroup) && (!filters.drafts || c.draft != null) && (!filters.unanswered || c.unanswered) &&
            (filters.network == null || c.network == filters.network) &&
            (q.isEmpty() || c.name.lowercase().contains(q) || c.preview.lowercase().contains(q))
    }
    val totalUnread = all.count { !it.archived && !it.muted && !it.lowPriority && (it.unread > 0 || it.markedUnread) }
    val attention = bridges.flatMap { n -> n.logins.filter { needsAttention(it.state) }.map { n.name } }.distinct()
    val networks = all.map { it.network }.distinct().sorted()

    fun toggleSelect(id: String) { if (id in selected) selected.remove(id) else selected.add(id); if (s.haptics) haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove) }
    fun act(action: String, c: ChatSummary) {
        val unread = c.unread > 0 || c.markedUnread
        when (action) {
            "archive" -> store.setTag(c.id, "u.archived", !c.archived)
            "read" -> if (unread) store.markRead(c.id) else store.markUnread(c.id, true)
            "pin" -> store.pin(c.id, !c.pinned)
            "mute" -> if (c.muted) store.setMuted(c.id, false) else muteFor = listOf(c.id)
        }
    }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            // Header: normal, or the multi-select toolbar.
            if (selecting) {
                Row(Modifier.fillMaxWidth().height(64.dp).padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconBtn(Icons.Rounded.Close, "Cancel selection", { selected.clear() }, tint = MaterialTheme.colorScheme.onSurface)
                    Text("${selected.size} selected", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f).padding(start = 4.dp))
                    IconBtn(Icons.Rounded.MarkChatRead, "Mark read", { selected.forEach { store.markRead(it) }; selected.clear() })
                    IconBtn(Icons.Rounded.MarkChatUnread, "Mark unread", { selected.forEach { store.markUnread(it, true) }; selected.clear() })
                    IconBtn(Icons.Rounded.PushPin, "Pin", { selected.forEach { store.pin(it, true) }; selected.clear() })
                    IconBtn(Icons.Rounded.Archive, "Archive", { selected.forEach { store.setTag(it, "u.archived", true) }; selected.clear() })
                    Box {
                        var more by remember { mutableStateOf(false) }
                        IconBtn(Icons.Rounded.MoreVert, "More", { more = true })
                        DropdownMenu(more, { more = false }) {
                            DropdownMenuItem(text = { Text("Mute…") }, leadingIcon = { Icon(Icons.Rounded.NotificationsOff, null) }, onClick = { more = false; muteFor = selected.toList() })
                            DropdownMenuItem(text = { Text("Low priority") }, leadingIcon = { Icon(Icons.Rounded.LowPriority, null) }, onClick = { more = false; selected.forEach { store.setLowPriority(it, true) }; selected.clear() })
                            DropdownMenuItem(text = { Text("Labels…") }, leadingIcon = { Icon(Icons.AutoMirrored.Rounded.Label, null) }, onClick = { more = false; labelFor = selected.toList() })
                        }
                    }
                }
            } else {
                Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 4.dp, top = 8.dp, bottom = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Chats", style = MaterialTheme.typography.headlineMedium)
                        if (totalUnread > 0) Text("$totalUnread unread", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                    }
                    IconBtn(Icons.Rounded.Search, "Search all messages", onSearch)
                    Box {
                        IconBtn(Icons.Rounded.MoreVert, "More", { menu = true })
                        DropdownMenu(menu, { menu = false }) {
                            DropdownMenuItem(text = { Text(me, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp) }, onClick = {}, enabled = false)
                            DropdownMenuItem(text = { Text("Accounts") }, leadingIcon = { Icon(Icons.Rounded.ManageAccounts, null) }, onClick = { menu = false; accounts = true })
                            DropdownMenuItem(text = { Text("Mark all as read") }, leadingIcon = { Icon(Icons.Rounded.DoneAll, null) }, onClick = { menu = false; store.markAllRead() })
                            DropdownMenuItem(text = { Text("Starred messages") }, leadingIcon = { Icon(Icons.Rounded.Star, null) }, onClick = { menu = false; onSettings("starred") })
                            DropdownMenuItem(text = { Text("Settings") }, leadingIcon = { Icon(Icons.Rounded.Settings, null) }, onClick = { menu = false; onSettings("") })
                        }
                    }
                }
                SearchPill(query, { query = it }, "Search chats", Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                    if (s.showFilterBar) Box(contentAlignment = Alignment.TopEnd) {
                        IconBtn(Icons.Rounded.Tune, "Filters", { filterSheet = true }, tint = if (filters.count > 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, size = 36)
                        if (filters.count > 0) Box(Modifier.size(8.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary))
                    }
                }
                if (s.showFilterBar) LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    item { Tab("Inbox", Icons.Rounded.Inbox, tab == "inbox", null) { tab = "inbox" } }
                    item { Tab("Unread", Icons.Rounded.MarkChatUnread, tab == "unread", unreadCount.takeIf { it > 0 }) { tab = "unread" } }
                    item { Tab("Low priority", Icons.Rounded.LowPriority, tab == "low", null) { tab = "low" } }
                    item { Tab("Archive", Icons.Rounded.Archive, tab == "archive", null) { tab = "archive" } }
                    if (s.showLabelsInFilterBar) items(labels) { l -> Tab(l, Icons.AutoMirrored.Rounded.Label, tab == "label:$l", null) { tab = "label:$l" } }
                }
                Spacer(Modifier.height(6.dp))
            }

            if (attention.isNotEmpty() && !selecting && tab == "inbox") {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp).clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.error.copy(alpha = 0.14f))
                        .clickable { onSettings("bridges") }.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Rounded.Warning, null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(20.dp))
                    Text("${attention.joinToString()} needs you to sign in again", Modifier.weight(1f).padding(horizontal = 10.dp), style = MaterialTheme.typography.bodyMedium)
                    Text("Fix", fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
                }
            }

            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 96.dp)) {
                if (pins.isNotEmpty()) item("pins") {
                    LazyRow(contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        items(pins, key = { "pin-" + it.id }) { c -> PinnedChip(c, onOpen = { if (selecting) toggleSelect(c.id) else onOpen(c.id) }, onLong = { menuFor = c }) }
                    }
                }
                if (shown.isEmpty() && pins.isEmpty()) item("empty") {
                    when {
                        !synced -> EmptyState(Icons.Rounded.Inbox, "Syncing…")
                        all.isEmpty() -> EmptyState(Icons.Rounded.Inbox, "No chats yet", "Connect an app to bring your conversations here.") { androidx.compose.material3.Button(onClick = { accounts = true }) { Text("Connect an account") } }
                        tab == "unread" -> EmptyState(Icons.Rounded.CheckCircle, "You're all caught up", "No unread chats.")
                        tab == "archive" -> EmptyState(Icons.Rounded.Archive, "Nothing archived", "Archived chats come back when someone writes.")
                        tab == "low" -> EmptyState(Icons.Rounded.LowPriority, "No low-priority chats", "Low-priority chats stay quiet except for @mentions and replies.")
                        else -> EmptyState(Icons.Rounded.Search, "No matches")
                    }
                }
                items(shown, key = { it.id }) { c ->
                    ChatRow(
                        c, selected = c.id in selected, selecting = selecting,
                        onClick = { if (selecting) toggleSelect(c.id) else onOpen(c.id) },
                        onLong = { if (selecting) toggleSelect(c.id) else { menuFor = c; if (s.haptics) haptic.performHapticFeedback(HapticFeedbackType.LongPress) } },
                        onSwipe = { act(it, c) },
                    )
                }
            }
        }
        if (!selecting) {
            Box(
                Modifier.align(Alignment.BottomEnd).padding(20.dp).size(60.dp).clip(RoundedCornerShape(20.dp))
                    .background(MaterialTheme.colorScheme.primary).clickable(onClick = onNewChat),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Rounded.Edit, "New chat", tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(26.dp)) }
        }
    }

    menuFor?.let { c ->
        val unread = c.unread > 0 || c.markedUnread
        Sheet({ menuFor = null }) {
            Row(Modifier.padding(horizontal = 24.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Avatar(c.name, c.network, 44.dp, c.avatarMxc)
                Column(Modifier.padding(start = 14.dp)) { Text(c.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis); Text(networkMeta(c.network).label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            SheetItem(Icons.Rounded.PushPin, if (c.pinned) "Unpin" else "Pin to top", { menuFor = null; store.pin(c.id, !c.pinned) })
            if (c.pinned) {
                val order = all.filter { it.pinned && !it.archived }.sortedBy { it.pinOrder }.map { it.id }
                val at = order.indexOf(c.id)
                if (at > 0) SheetItem(Icons.Rounded.KeyboardArrowLeft, "Move earlier in pins", { menuFor = null; store.movePin(c.id, at - 1) })
                if (at in 0 until order.lastIndex) SheetItem(Icons.Rounded.KeyboardArrowRight, "Move later in pins", { menuFor = null; store.movePin(c.id, at + 1) })
            }
            SheetItem(if (unread) Icons.Rounded.MarkChatRead else Icons.Rounded.MarkChatUnread, if (unread) "Mark as read" else "Mark as unread", { menuFor = null; act("read", c) })
            SheetItem(Icons.Rounded.NotificationsOff, if (c.muted) "Unmute" else "Mute…", { menuFor = null; act("mute", c) })
            SheetItem(Icons.Rounded.Archive.takeIf { !c.archived } ?: Icons.Rounded.Unarchive, if (c.archived) "Move to inbox" else "Archive", { menuFor = null; act("archive", c) })
            SheetItem(Icons.Rounded.LowPriority, if (c.lowPriority) "Remove from low priority" else "Low priority", { menuFor = null; store.setLowPriority(c.id, !c.lowPriority) }, hint = if (c.lowPriority) null else "Quiet, except @mentions and replies")
            SheetItem(Icons.Rounded.Snooze, "Snooze…", { menuFor = null; snoozeFor = c.id }, hint = "Hide it and bring it back later")
            SheetItem(Icons.Rounded.Alarm, "Remind me…", { menuFor = null; remindFor = c.id })
            SheetItem(Icons.AutoMirrored.Rounded.Label, "Labels…", { menuFor = null; labelFor = listOf(c.id) })
            SheetItem(Icons.Rounded.RadioButtonUnchecked, "Select", { menuFor = null; toggleSelect(c.id) })
        }
    }
    labelFor?.let { LabelSheet(it) { labelFor = null } }
    muteFor?.let { ids -> MuteSheet(if (ids.size == 1) "Mute chat" else "Mute ${ids.size} chats", { ms -> ids.forEach { store.setMuted(it, true, ms) }; muteFor = null; selected.clear() }, { muteFor = null }) }
    snoozeFor?.let { id -> WhenSheet("Snooze until", { store.snooze(id, it); snoozeFor = null }, { snoozeFor = null }) }
    remindFor?.let { id -> WhenSheet("Remind me", { store.remind(id, it); remindFor = null }, { remindFor = null }) }
    if (filterSheet) Sheet({ filterSheet = false }) {
        SheetTitle("Filter chats")
        FilterRow("Groups", filters.groups) { filters = filters.copy(groups = it, dms = if (it) false else filters.dms) }
        FilterRow("Direct messages", filters.dms) { filters = filters.copy(dms = it, groups = if (it) false else filters.groups) }
        FilterRow("With a draft", filters.drafts) { filters = filters.copy(drafts = it) }
        FilterRow("Unanswered (they wrote last)", filters.unanswered) { filters = filters.copy(unanswered = it) }
        if (networks.size > 1) {
            Text("Network", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(start = 24.dp, top = 12.dp, bottom = 4.dp))
            networks.forEach { n -> FilterRow(networkMeta(n).label, filters.network == n) { filters = filters.copy(network = if (it) n else null) } }
        }
        if (filters.count > 0) TextButton(onClick = { filters = Filters(); filterSheet = false }, Modifier.padding(horizontal = 16.dp)) { Text("Clear filters") }
    }
    if (accounts) AccountsDialog(store) { accounts = false }
}

@Composable
private fun FilterRow(label: String, on: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().clickable { onChange(!on) }.padding(horizontal = 24.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
        if (on) Icon(Icons.Rounded.CheckCircle, null, tint = MaterialTheme.colorScheme.primary)
    }
}

@Composable
private fun Tab(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, on: Boolean, badge: Int?, click: () -> Unit) {
    val bg = if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant
    val fg = if (on) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant
    Row(Modifier.clip(RoundedCornerShape(50)).background(bg).clickable(onClick = click).padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = fg, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(6.dp))
        Text(label + (badge?.let { "  $it" } ?: ""), color = fg, style = MaterialTheme.typography.labelLarge)
    }
}

/** A pinned chat as a circle with its name under it, Beeper style. */
@Composable
private fun PinnedChip(c: ChatSummary, onOpen: () -> Unit, onLong: () -> Unit) {
    val unread = c.unread > 0 || c.markedUnread
    Column(Modifier.width(72.dp).combinedClickable(onClick = onOpen, onLongClick = onLong), horizontalAlignment = Alignment.CenterHorizontally) {
        Box {
            Avatar(c.name, LocalSettings.current.let { if (it.showNetworkBadges) c.network else null }, 58.dp, c.avatarMxc)
            if (unread) Box(Modifier.align(Alignment.TopEnd).size(18.dp).clip(CircleShape).background(MaterialTheme.colorScheme.background).padding(2.dp).clip(CircleShape).background(if (c.muted) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.primary))
        }
        Text(c.name, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp), fontWeight = if (unread) FontWeight.Bold else FontWeight.Medium)
    }
}

private fun swipeLabel(action: String, c: ChatSummary) = when (action) {
    "archive" -> if (c.archived) "Move to inbox" else "Archive"
    "read" -> if (c.unread > 0 || c.markedUnread) "Mark read" else "Mark unread"
    "pin" -> if (c.pinned) "Unpin" else "Pin"
    "mute" -> if (c.muted) "Unmute" else "Mute"
    else -> ""
}

private fun swipeIcon(action: String, c: ChatSummary) = when (action) {
    "archive" -> if (c.archived) Icons.Rounded.Unarchive else Icons.Rounded.Archive
    "read" -> if (c.unread > 0 || c.markedUnread) Icons.Rounded.MarkChatRead else Icons.Rounded.MarkChatUnread
    "pin" -> Icons.Rounded.PushPin
    else -> Icons.Rounded.NotificationsOff
}

@Composable
private fun ChatRow(c: ChatSummary, selected: Boolean, selecting: Boolean, onClick: () -> Unit, onLong: () -> Unit, onSwipe: (String) -> Unit) {
    val s = LocalSettings.current
    val unread = c.unread > 0 || c.markedUnread
    val minimal = s.inboxStyle == "minimal"

    val dismiss = rememberSwipeToDismissBoxState(confirmValueChange = { v ->
        when (v) {
            SwipeToDismissBoxValue.StartToEnd -> onSwipe(s.swipeRight)
            SwipeToDismissBoxValue.EndToStart -> onSwipe(s.swipeLeft)
            else -> {}
        }
        false // always snap back; the action already happened
    })
    val vPad = if (s.density == "compact") 6.dp else 10.dp
    val avatar = if (s.density == "compact") 44.dp else 52.dp

    SwipeToDismissBox(
        state = dismiss,
        enableDismissFromStartToEnd = s.swipeRight != "none" && !selecting,
        enableDismissFromEndToStart = s.swipeLeft != "none" && !selecting,
        backgroundContent = {
            val start = dismiss.dismissDirection == SwipeToDismissBoxValue.StartToEnd
            val action = if (start) s.swipeRight else s.swipeLeft
            Row(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.primary).padding(horizontal = 24.dp), horizontalArrangement = if (start) Arrangement.Start else Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
                Icon(swipeIcon(action, c), null, tint = MaterialTheme.colorScheme.onPrimary)
                Spacer(Modifier.width(8.dp))
                Text(swipeLabel(action, c), color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.SemiBold)
            }
        },
    ) {
        Row(
            Modifier.fillMaxWidth().background(if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.12f) else MaterialTheme.colorScheme.background)
                .combinedClickable(onClick = onClick, onLongClick = onLong).padding(horizontal = 16.dp, vertical = vPad),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (selecting) {
                Icon(if (selected) Icons.Rounded.CheckCircle else Icons.Rounded.RadioButtonUnchecked, null, tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(end = 12.dp).size(24.dp))
            }
            if (s.showAvatars) { Avatar(c.name, if (s.showNetworkBadges) c.network else null, avatar, c.avatarMxc); Spacer(Modifier.width(14.dp)) }
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(c.name, style = MaterialTheme.typography.titleMedium, fontWeight = if (unread) FontWeight.Bold else FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                    if (c.muted) Icon(Icons.Rounded.NotificationsOff, "Muted", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 6.dp).size(14.dp))
                    if (c.pinned && !s.showPinsRow) Icon(Icons.Rounded.PushPin, "Pinned", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 4.dp).size(14.dp))
                    Spacer(Modifier.weight(1f))
                    if (!minimal) Text(remember(c.ts) { timeLabel(c.ts) }, style = MaterialTheme.typography.labelMedium, color = if (unread && !c.muted) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (s.showNetworkNameInRows) Text(networkMeta(c.network).label, style = MaterialTheme.typography.labelMedium, color = networkMeta(c.network).color)
                if (!minimal) Row(verticalAlignment = Alignment.CenterVertically) {
                    val muted = MaterialTheme.colorScheme.onSurfaceVariant
                    when {
                        c.typing -> Text("typing…", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                        c.draft != null -> Text(buildAnnotatedString {
                            pushStyle(SpanStyle(color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)); append("Draft: "); pop(); append(c.draft.replace('\n', ' '))
                        }, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                        s.showPreviews -> Text((if (c.lastFromMe) "You: " else "") + c.preview, color = muted, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        else -> Spacer(Modifier.weight(1f))
                    }
                    if (unread) UnreadBadge(c)
                }
            }
            if (minimal && unread) UnreadBadge(c)
        }
    }
}

@Composable
private fun UnreadBadge(c: ChatSummary) {
    Spacer(Modifier.width(8.dp))
    val color = if (c.muted || c.lowPriority) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.primary
    if (c.unread > 0) Box(Modifier.defaultMinSize(minWidth = 20.dp).height(20.dp).clip(CircleShape).background(color).padding(horizontal = 6.dp), contentAlignment = Alignment.Center) {
        Text(if (c.unread > 99) "99+" else "${c.unread}", color = MaterialTheme.colorScheme.onPrimary, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    } else Box(Modifier.size(12.dp).clip(CircleShape).background(color))
}
