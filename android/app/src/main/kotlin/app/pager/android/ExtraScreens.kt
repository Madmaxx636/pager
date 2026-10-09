@file:OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class, androidx.compose.material3.ExperimentalMaterial3Api::class)

package app.pager.android

import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material3.AlertDialog
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
    var syncing by remember { mutableStateOf<String?>(null) }
    var note by remember { mutableStateOf("") }
    LaunchedEffect(Unit) { store.refreshBridges() }

    SettingsPage("Bridges & accounts", onBack) {
        Text("Each app you connect is bridged through your own server. Pager shows if a connection needs attention.", Modifier.padding(horizontal = 20.dp, vertical = 8.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (note.isNotEmpty()) Text(note, Modifier.padding(horizontal = 20.dp, vertical = 4.dp), style = MaterialTheme.typography.bodyMedium)
        if (networks.isEmpty()) Text("Loading…", Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        else if (networks.none { it.logins.isNotEmpty() }) Text("Nothing connected yet.", Modifier.padding(horizontal = 20.dp, vertical = 8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        SettingsGroup { ButtonRow("Add account") { adding = true } }
        networks.filter { it.logins.isNotEmpty() }.forEach { n ->
            val meta = networkMeta(n.id)
            SettingsGroup(n.name, footer = if (n.unavailable) "This bridge isn't responding right now." else null) {
                n.logins.forEach { l ->
                    val (label, color) = loginStateLabel(l.state)
                    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(10.dp).clip(CircleShape).background(color))
                        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) { Text(l.name); Text(label, style = MaterialTheme.typography.labelMedium, color = color) }
                        if (needsAttention(l.state)) TextButton(onClick = { relogin = n }) { Text("Sign in") }
                        TextButton(enabled = syncing == null, onClick = {
                            scope.launch {
                                syncing = l.id; note = ""
                                runCatching { store.pager.syncChats(n.id, l.id) { d, tot -> note = "Syncing chats $d/$tot" } }
                                    .onSuccess { note = "Synced $it chats. Old history isn't available from every network; new messages appear as they arrive." }
                                    .onFailure { note = it.message ?: "Sync failed" }
                                syncing = null
                            }
                        }) { Text("Sync chats") }
                        TextButton(onClick = { scope.launch { runCatching { store.pager.logout(n.id, l.id) }; store.refreshBridges() } }) { Text("Disconnect", color = MaterialTheme.colorScheme.error) }
                    }
                    GroupDivider()
                }
                ButtonRow("Add another ${meta.label} account") { relogin = n }
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


/** Settings → Admin: the accounts on this server (with what each has connected), the bridges, and signups. Only shown to administrators. */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun AdminScreen(onBack: () -> Unit) {
    val store = LocalStore.current
    val scope = rememberCoroutineScope()
    var tab by remember { mutableStateOf("accounts") }
    var people by remember { mutableStateOf<List<AdminPerson>?>(null) }
    var bridges by remember { mutableStateOf<List<AdminBridge>?>(null) }
    var control by remember { mutableStateOf(false) }
    var server by remember { mutableStateOf<ServerSettings?>(null) }
    var open by remember { mutableStateOf<String?>(null) }
    var info by remember { mutableStateOf<AdminInfo?>(null) }
    var resetFor by remember { mutableStateOf<AdminUser?>(null) }
    var renameFor by remember { mutableStateOf<AdminUser?>(null) }
    var deleteFor by remember { mutableStateOf<AdminUser?>(null) }
    var logFor by remember { mutableStateOf<Pair<String, String>?>(null) }
    var busy by remember { mutableStateOf("") }
    var err by remember { mutableStateOf("") }
    fun load() = scope.launch {
        err = ""
        runCatching { store.pager.adminOverview() }.onSuccess { people = it }.onFailure { err = it.message ?: "Couldn't load" }
        runCatching { store.pager.adminBridgeList() }.onSuccess { bridges = it }
        runCatching { store.pager.adminControl() }.onSuccess { control = it }
        runCatching { store.pager.adminServer() }.onSuccess { server = it }
    }
    LaunchedEffect(Unit) { load() }
    fun act(f: suspend () -> Unit) = scope.launch { runCatching { f() }.onFailure { err = it.message ?: "Failed" }; load() }
    fun nameOf(p: AdminPerson) = p.displayname.ifEmpty { p.user.id.removePrefix("@").substringBefore(':') }
    val dateFmt = remember { java.text.DateFormat.getDateTimeInstance(java.text.DateFormat.MEDIUM, java.text.DateFormat.SHORT) }

    SettingsPage("Admin", onBack) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("accounts" to "Accounts", "bridges" to "Bridges", "server" to "Server").forEach { (id, label) ->
                androidx.compose.material3.FilterChip(selected = tab == id, onClick = { tab = id }, label = { Text(label + if (id == "accounts") people?.let { " (${it.size})" }.orEmpty() else "") })
            }
        }
        if (err.isNotEmpty()) Text(err, Modifier.padding(horizontal = 20.dp, vertical = 6.dp), color = MaterialTheme.colorScheme.error)

        if (tab == "accounts") {
            if (people == null) Text("Loading accounts…", Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            people?.forEach { p ->
                val u = p.user
                SettingsGroup {
                    Row(Modifier.fillMaxWidth().clickable { if (open == u.id) open = null else { open = u.id; info = null; scope.launch { info = runCatching { store.pager.adminInfo(u.id) }.getOrNull() } } }.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Avatar(nameOf(p), null, 44.dp)
                        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                            Text(nameOf(p), style = MaterialTheme.typography.titleMedium)
                            Text(u.id, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                        }
                        if (u.admin) Text("Admin", Modifier.clip(CircleShape).background(MaterialTheme.colorScheme.primary).padding(horizontal = 10.dp, vertical = 3.dp), color = MaterialTheme.colorScheme.onPrimary, style = MaterialTheme.typography.labelMedium)
                        if (u.you) Text("You", Modifier.padding(start = 6.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant).padding(horizontal = 10.dp, vertical = 3.dp), style = MaterialTheme.typography.labelMedium)
                    }
                    if (open == u.id) {
                        GroupDivider()
                        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("INFO", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                            @Composable fun line(k: String, v: String) = Row { Text(k, Modifier.width(110.dp), color = MaterialTheme.colorScheme.onSurfaceVariant); Text(v) }
                            line("Name", nameOf(p)); line("Username", u.id)
                            line("Joined", if (u.created > 0) dateFmt.format(java.util.Date(u.created)) else "—")
                            line("Role", if (u.admin) "Admin" else "Member")
                            line("Status", if (u.deactivated) "Deleted" else if (info?.locked == true) "Locked (can't sign in)" else "Active")
                            line("Last active", info?.devices?.maxOfOrNull { it.third }?.takeIf { it > 0 }?.let { dateFmt.format(java.util.Date(it)) } ?: if (info == null) "…" else "never")
                            line("Signed in on", info?.devices?.joinToString("\n") { it.second.ifEmpty { it.first } }?.ifEmpty { "no devices" } ?: "…")
                            Spacer(Modifier.height(6.dp))
                            Text("CONNECTED BRIDGES", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                            if (p.networks.none { it.logins.isNotEmpty() }) Text("Nothing connected.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            p.networks.forEach { n -> n.logins.forEach { l ->
                                val (label, color) = loginStateLabel(l.state)
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) { Text(n.name); Text(l.name, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                                    Box(Modifier.size(8.dp).clip(CircleShape).background(color)); Text(" $label", style = MaterialTheme.typography.labelMedium)
                                    TextButton(onClick = { act { store.pager.adminLogout(u.id, n.id, l.id) } }) { Text("Disconnect", color = MaterialTheme.colorScheme.error) }
                                }
                            } }
                        }
                        if (!u.deactivated) {
                            GroupDivider()
                            FlowRow(Modifier.padding(horizontal = 8.dp)) {
                                TextButton(onClick = { renameFor = u }) { Text("Change name") }
                                TextButton(onClick = { resetFor = u }) { Text("Reset password") }
                                if (!u.you) TextButton(onClick = { act { store.pager.adminSetAdmin(u.id, !u.admin) } }) { Text(if (u.admin) "Remove admin" else "Make admin") }
                                if (!u.you) TextButton(onClick = { act { store.pager.adminLock(u.id, info?.locked != true) } }) { Text(if (info?.locked == true) "Unlock" else "Lock account") }
                                TextButton(onClick = { act { store.pager.adminLogoutAll(u.id) } }) { Text("Sign out everywhere") }
                                if (!u.you) TextButton(onClick = { deleteFor = u }) { Text("Delete account", color = MaterialTheme.colorScheme.error) }
                            }
                        }
                    }
                }
            }
        }

        if (tab == "bridges") {
            if (!control) Text("Restart, stop and the log are switched off. Run ./scripts/enable-admin-control.sh in the server folder to turn them on.", Modifier.padding(horizontal = 20.dp, vertical = 8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (bridges == null) Text("Checking bridges…", Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            bridges?.forEach { b ->
                val running = b.state?.let { it == "running" } ?: b.up
                val count = people.orEmpty().sumOf { p -> p.networks.firstOrNull { it.id == b.id }?.logins?.size ?: 0 }
                SettingsGroup {
                    Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(10.dp).clip(CircleShape).background(if (running && b.up) Color(0xFF22C55E) else if (running) Color(0xFFF59E0B) else Color(0xFFEF4444)))
                        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                            Text(b.name, style = MaterialTheme.typography.titleMedium)
                            Text((b.status ?: if (b.up) "Running" else "Not responding") + " · $count account" + if (count == 1) "" else "s", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    GroupDivider()
                    FlowRow(Modifier.padding(horizontal = 8.dp)) {
                        TextButton(enabled = control && busy.isEmpty(), onClick = { busy = b.id; scope.launch { runCatching { store.pager.adminBridgeAction(b.id, "restart") }.onFailure { err = it.message ?: "Failed" }; kotlinx.coroutines.delay(2500); busy = ""; load() } }) { Text(if (busy == b.id) "Working…" else "Restart") }
                        if (running) TextButton(enabled = control && busy.isEmpty(), onClick = { busy = b.id; scope.launch { runCatching { store.pager.adminBridgeAction(b.id, "stop") }.onFailure { err = it.message ?: "Failed" }; kotlinx.coroutines.delay(1500); busy = ""; load() } }) { Text("Stop", color = MaterialTheme.colorScheme.error) }
                        else TextButton(enabled = control && busy.isEmpty(), onClick = { busy = b.id; scope.launch { runCatching { store.pager.adminBridgeAction(b.id, "start") }.onFailure { err = it.message ?: "Failed" }; kotlinx.coroutines.delay(2500); busy = ""; load() } }) { Text("Start") }
                        TextButton(enabled = control, onClick = { scope.launch { logFor = b.name to (runCatching { store.pager.adminBridgeLog(b.id) }.getOrElse { it.message ?: "No log" }) } }) { Text("Log") }
                    }
                }
            }
            Text("To add a bridge (Telegram, Discord…), set it up on the server; the web admin page lists how.", Modifier.padding(20.dp), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        if (tab == "server") {
            SettingsGroup("Signups", footer = "The invite code lets people create an account. Closing signups stops everyone except the admin code.") {
                server?.let { sv ->
                    Text(sv.domain, Modifier.padding(16.dp)); GroupDivider()
                    ChoiceRow("Who can sign up", listOf("invite" to "Anyone with the invite code", "open" to "Anyone", "closed" to "No one"), sv.signup) { v -> act { server = store.pager.adminSetServer(signup = v) } }; GroupDivider()
                    Column(Modifier.fillMaxWidth().padding(16.dp)) { Text("Invite code", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(sv.inviteCode.ifEmpty { "none" }, style = MaterialTheme.typography.titleMedium) }
                    GroupDivider(); ButtonRow("Make a new invite code") { act { server = store.pager.adminSetServer(regenerateInvite = true) } }
                } ?: Text("Loading…", Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
    renameFor?.let { u ->
        var nm by remember { mutableStateOf(people?.firstOrNull { it.user.id == u.id }?.let { nameOf(it) } ?: "") }
        AlertDialog(
            onDismissRequest = { renameFor = null }, title = { Text("Change name") },
            text = { androidx.compose.material3.OutlinedTextField(nm, { nm = it }, singleLine = true, label = { Text("Name") }) },
            confirmButton = { TextButton(enabled = nm.isNotBlank(), onClick = { act { store.pager.adminRename(u.id, nm.trim()) }; renameFor = null }) { Text("Save") } },
            dismissButton = { TextButton(onClick = { renameFor = null }) { Text("Cancel") } },
        )
    }
    resetFor?.let { u ->
        var pw by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { resetFor = null }, title = { Text("New password for ${u.id}") },
            text = { androidx.compose.material3.OutlinedTextField(pw, { pw = it }, singleLine = true, label = { Text("New password (8+ characters)") }, visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation()) },
            confirmButton = { TextButton(enabled = pw.length >= 8, onClick = { act { store.pager.adminResetPassword(u.id, pw) }; resetFor = null }) { Text("Set password") } },
            dismissButton = { TextButton(onClick = { resetFor = null }) { Text("Cancel") } },
        )
    }
    deleteFor?.let { u ->
        AlertDialog(
            onDismissRequest = { deleteFor = null }, title = { Text("Delete ${u.id}?") },
            text = { Text("This removes their account, disconnects their bridges and can't be undone.") },
            confirmButton = { TextButton(onClick = { act { store.pager.adminRemove(u.id) }; deleteFor = null; open = null }) { Text("Delete", color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = { deleteFor = null }) { Text("Cancel") } },
        )
    }
    logFor?.let { (name, log) ->
        AlertDialog(
            onDismissRequest = { logFor = null }, title = { Text("$name log") },
            text = { Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState())) { Text(log, fontSize = 11.sp, lineHeight = 14.sp, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace) } },
            confirmButton = { TextButton(onClick = { logFor = null }) { Text("Close") } },
        )
    }
}
