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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.PersonAdd
import androidx.compose.material.icons.rounded.Warning
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
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

/** Start a chat with someone on a connected network: pick a network, search contacts, or type a phone number/username. */
@Composable
fun NewChatScreen(onBack: () -> Unit, onOpen: (String) -> Unit) {
    val store = LocalStore.current
    val scope = rememberCoroutineScope()
    var networks by remember { mutableStateOf<List<Network>?>(null) }
    var selected by remember { mutableStateOf<Network?>(null) }
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<Contact>>(emptyList()) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    val muted = MaterialTheme.colorScheme.onSurfaceVariant

    LaunchedEffect(Unit) {
        runCatching { store.pager.networks() }.onSuccess { list ->
            networks = list.filter { it.logins.isNotEmpty() }
            selected = networks?.firstOrNull()
        }.onFailure { error = it.message ?: "Couldn't load accounts"; networks = emptyList() }
    }
    LaunchedEffect(selected, query) {
        val net = selected ?: return@LaunchedEffect
        delay(if (query.isEmpty()) 0 else 300) // debounce typing
        runCatching { if (query.isBlank()) store.pager.contacts(net.id, net.logins.firstOrNull()?.id) else store.pager.searchUsers(net.id, net.logins.firstOrNull()?.id, query.trim()) }
            .onSuccess { results = it; error = "" }
            .onFailure { results = emptyList(); if (query.isNotBlank()) error = it.message ?: "Search failed" }
    }

    fun start(identifier: String) {
        val net = selected ?: return
        scope.launch {
            busy = true; error = ""
            runCatching { store.pager.createDm(net.id, net.logins.firstOrNull()?.id, identifier) }
                .onSuccess { room -> if (room != null) onOpen(room) else error = "Couldn't open that chat" }
                .onFailure { error = it.message ?: "Couldn't start the chat" }
            busy = false
        }
    }

    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        TopBar("New chat", onBack)
        when {
            networks == null -> Text("Loading…", color = muted, modifier = Modifier.padding(20.dp))
            networks!!.isEmpty() -> EmptyState(Icons.Rounded.PersonAdd, "Connect an account first", "Settings → Bridges & accounts")
            else -> {
                LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(networks!!) { n ->
                        val on = n.id == selected?.id
                        Text(n.name, style = MaterialTheme.typography.labelLarge, color = if (on) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.clip(RoundedCornerShape(50)).background(if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant).clickable { selected = n; results = emptyList() }.padding(horizontal = 16.dp, vertical = 9.dp))
                    }
                }
                SearchPill(query, { query = it }, "Name, phone number or username", Modifier.padding(16.dp))
                if (error.isNotEmpty()) Text(error, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 16.dp))
                LazyColumn(Modifier.fillMaxSize()) {
                    if (query.isNotBlank()) item {
                        Row(Modifier.fillMaxWidth().clickable(enabled = !busy) { start(query.trim()) }.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                            IconTile(Icons.Rounded.PersonAdd, MaterialTheme.colorScheme.primary, 44)
                            Spacer(Modifier.width(14.dp))
                            Text("Message “${query.trim()}”", style = MaterialTheme.typography.titleMedium)
                        }
                    }
                    items(results, key = { it.id }) { c ->
                        Row(Modifier.fillMaxWidth().clickable(enabled = !busy) { start(c.id) }.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Avatar(c.name, selected?.id, 46.dp)
                            Spacer(Modifier.width(14.dp))
                            Column { Text(c.name, style = MaterialTheme.typography.titleMedium); c.detail?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = muted) } }
                        }
                    }
                    if (busy) item { Text("Opening chat…", color = muted, modifier = Modifier.padding(16.dp)) }
                }
            }
        }
    }
}
