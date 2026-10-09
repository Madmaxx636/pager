package app.pager.android

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.height
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.Alignment as Al
import androidx.compose.ui.platform.LocalContext
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.material3.TextButton
import androidx.compose.runtime.derivedStateOf
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.PersonAdd
import androidx.compose.material.icons.rounded.Warning
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** One way to reach a person: a network, which of your accounts, and how that network names them. */
private data class Way(val net: Network, val login: String?, val id: String, val detail: String?)
private data class Person(val key: String, val name: String, val detail: String?, val ways: List<Way>)

/** Merge one person across networks: same phone number, else same name. */
private fun merge(found: List<Pair<Contact, Way>>): List<Person> {
    val by = LinkedHashMap<String, Person>()
    for ((c, way) in found) {
        val name = Names.pretty(c.name)
        val num = c.detail?.let { Names.phoneKey(it) }.orEmpty()
        val key = num.ifEmpty { "n:" + Names.stripTag(name).lowercase() }
        val p = by[key] ?: Person(key, name, c.detail, emptyList())
        val ways = if (p.ways.any { it.net.id == way.net.id && it.login == way.login }) p.ways else p.ways + way
        by[key] = p.copy(ways = ways, detail = p.detail ?: c.detail)
    }
    return by.values.sortedBy { it.name.lowercase() }
}

/** Page someone: everyone from every connected network in one list, one row per person, then pick how to reach them. */
@Composable
fun NewChatScreen(onBack: () -> Unit, onOpen: (String) -> Unit) {
    val store = LocalStore.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var networks by remember { mutableStateOf<List<Network>?>(null) }
    var people by remember { mutableStateOf<List<Person>>(emptyList()) }
    var remote by remember { mutableStateOf<List<Person>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var query by remember { mutableStateOf("") }
    var choose by remember { mutableStateOf<Pair<String, List<Way>>?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var hasPhone by remember { mutableStateOf(Names.hasDevicePermission(context)) }
    val chats by store.inbox.collectAsState()
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val askContacts = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        hasPhone = ok
        if (ok) scope.launch { if (Names.loadDevice(context)) store.syncContacts() }
    }

    // Everyone, from every account on every network, merged by phone number (or name).
    LaunchedEffect(Unit) {
        runCatching { store.pager.networks() }.onSuccess { all ->
            val list = all.filter { it.logins.isNotEmpty() }
            networks = list
            val found = list.flatMap { n -> n.logins.map { l -> async { runCatching { store.pager.contacts(n.id, l.id) }.getOrDefault(emptyList()).map { c -> c to Way(n, l.id, c.id, c.detail) } } } }.awaitAll().flatten()
            Names.add(found.mapNotNull { (c, _) -> c.detail?.let { it to c.name } })
            people = merge(found)
            loading = false
        }.onFailure { error = it.message ?: "Couldn't load accounts"; networks = emptyList(); loading = false }
    }
    // Typing something that isn't in the list: ask the networks too (they can find people you've never talked to).
    LaunchedEffect(query, networks) {
        remote = emptyList()
        val nets = networks ?: return@LaunchedEffect
        if (query.trim().length < 3) return@LaunchedEffect
        delay(350)
        val found = nets.flatMap { n -> n.logins.take(1).map { l -> async { runCatching { store.pager.searchUsers(n.id, l.id, query.trim()) }.getOrDefault(emptyList()).map { c -> c to Way(n, l.id, c.id, c.detail) } } } }.awaitAll().flatten()
        remote = merge(found)
    }

    // The network you already chat with someone on comes first.
    val usual = remember(chats) { HashMap<String, String>().also { m -> chats.sortedByDescending { it.ts }.forEach { if (!it.isGroup) m.putIfAbsent(it.name.lowercase(), it.network) } } }
    val q = query.trim()
    val version by Names.version.collectAsState()
    val shown = remember(people, remote, q, version) {
        val t = q.lowercase(); val digits = q.filter { it.isDigit() }
        val local = people.filter { p -> t.isEmpty() || p.name.lowercase().contains(t) || (digits.length >= 3 && p.ways.any { w -> (w.detail ?: "").filter { it.isDigit() }.contains(digits) }) }
        val seen = local.map { it.key }.toSet()
        if (t.isEmpty()) local else local + remote.filter { it.key !in seen }
    }

    fun start(w: Way) {
        scope.launch {
            busy = true; error = ""; choose = null
            runCatching { store.pager.createDm(w.net.id, w.login, w.id) }
                .onSuccess { room -> if (room != null) onOpen(room) else error = "Couldn't open that chat" }
                .onFailure { error = it.message ?: "Couldn't start the chat" }
            busy = false
        }
    }
    fun pick(p: Person) {
        val first = usual[p.name.lowercase()]
        val ways = p.ways.sortedByDescending { it.net.id == first }
        if (ways.size == 1) start(ways[0]) else choose = p.name to ways
    }

    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        TopBar("Page someone", onBack)
        when {
            networks == null -> Text("Loading…", color = muted, modifier = Modifier.padding(20.dp))
            networks!!.isEmpty() -> EmptyState(Icons.Rounded.PersonAdd, "Connect an account first", "Settings → Bridges & accounts")
            else -> {
                SearchPill(query, { query = it }, "Name, phone number or username", Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
                if (error.isNotEmpty()) Text(error, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 16.dp))
                LazyColumn(Modifier.fillMaxSize()) {
                    if (q.isEmpty()) item("hero") {
                        Column(Modifier.fillMaxWidth().padding(top = 4.dp, bottom = 10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            PagerMascot(96.dp)
                            Text("Wanna Page someone?", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                    if (!hasPhone) item("perm") {
                        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp).clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surfaceVariant).clickable { askContacts.launch(android.Manifest.permission.READ_CONTACTS) }.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text("Use my phone contacts", style = MaterialTheme.typography.titleSmall)
                                Text("Shows names instead of phone numbers everywhere in Pager, and syncs them to your account.", style = MaterialTheme.typography.bodySmall, color = muted)
                            }
                            Text("Allow", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
                        }
                    }
                    if (q.isNotEmpty()) item("raw") {
                        Row(Modifier.fillMaxWidth().clickable(enabled = !busy) { choose = "Message “$q”" to networks!!.map { Way(it, it.logins.firstOrNull()?.id, q, null) } }.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                            IconTile(Icons.Rounded.PersonAdd, MaterialTheme.colorScheme.primary, 44)
                            Spacer(Modifier.width(14.dp))
                            Text("Message “$q”", style = MaterialTheme.typography.titleMedium)
                        }
                    }
                    items(shown, key = { it.key }) { p ->
                        Row(Modifier.fillMaxWidth().clickable(enabled = !busy) { pick(p) }.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Avatar(p.name, null, 46.dp)
                            Spacer(Modifier.width(14.dp))
                            Column(Modifier.weight(1f)) { Text(p.name, style = MaterialTheme.typography.titleMedium); p.detail?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = muted) } }
                            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                p.ways.forEach { w ->
                                    val m = networkMeta(w.net.id)
                                    Text(m.label.take(2), color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(m.color).padding(horizontal = 5.dp, vertical = 2.dp))
                                }
                            }
                        }
                    }
                    if (loading) item("loading") { Text("Finding your contacts…", color = muted, modifier = Modifier.padding(16.dp)) }
                    if (!loading && shown.isEmpty()) item("none") { Text(if (q.isEmpty()) "No contacts yet." else "No one by that name yet. Use the row above to message a number or username.", color = muted, modifier = Modifier.padding(16.dp)) }
                    if (busy) item("busy") { Text("Opening chat…", color = muted, modifier = Modifier.padding(16.dp)) }
                }
            }
        }
    }
    choose?.let { (title, ways) ->
        Sheet(onDismiss = { choose = null }) {
            SheetTitle(title)
            Text("How do you want to message them?", color = muted, modifier = Modifier.padding(horizontal = 24.dp, vertical = 2.dp))
            val first = usual[title.lowercase()]
            ways.forEach { w ->
                Row(Modifier.fillMaxWidth().clickable { start(w) }.padding(horizontal = 24.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(12.dp).clip(CircleShape).background(networkMeta(w.net.id).color))
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) { Text(w.net.name, style = MaterialTheme.typography.bodyLarge); w.detail?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = muted) } }
                    if (w.net.id == first) Text("Usual", style = MaterialTheme.typography.labelMedium, color = muted)
                }
            }
        }
    }
}
