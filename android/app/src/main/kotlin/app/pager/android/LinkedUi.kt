package app.pager.android

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.unit.dp

/** Tabs to move between one person's chats on different networks, or an offer to join two that look like the same person. */
@Composable
fun LinkedBar(roomId: String, onOpen: (String) -> Unit) {
    val store = LocalStore.current
    val links by store.links.collectAsState()
    val chats by store.chats.collectAsState()
    val me = store.session.collectAsState().value?.userId ?: ""
    val scheme = MaterialTheme.colorScheme
    var declined by remember { mutableStateOf(setOf<String>()) }
    val group = Links.groupOf(links, roomId)?.filter { it in chats }
    if (group != null && group.size > 1) {
        Row(Modifier.fillMaxWidth().background(scheme.surface).horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            group.forEach { id ->
                val c = chats.getValue(id); val on = id == roomId; val meta = networkMeta(c.network)
                Row(Modifier.clip(CircleShape).background(if (on) scheme.primary else scheme.surfaceVariant).dpadFocus().clickable { if (!on) onOpen(id) }.padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(8.dp).clip(CircleShape).background(if (on) scheme.onPrimary else meta.color))
                    Text(" ${meta.label}", style = MaterialTheme.typography.labelLarge, color = if (on) scheme.onPrimary else scheme.onSurface)
                    if (!on && c.unread > 0) Text("  ${c.unread}", style = MaterialTheme.typography.labelMedium, color = scheme.primary)
                }
            }
        }
        return
    }
    val here = chats[roomId] ?: return
    if (here.isGroup) return
    val offer = remember(chats, links, declined) {
        Links.suggest(chats.values.filter { !it.isBotRoom(me) }.map { Links.Candidate(it.id, SyncReducer.displayName(it, me), it.network, it.isGroup) }, links)
            .firstOrNull { (a, b) -> (a == roomId || b == roomId) && "$a|$b" !in declined }
    } ?: return
    val other = chats[if (offer.first == roomId) offer.second else offer.first] ?: return
    Row(Modifier.fillMaxWidth().background(scheme.surfaceVariant).padding(horizontal = 14.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("Same person as ${SyncReducer.displayName(other, me)} on ${networkMeta(other.network).label}? Show them as one chat.", style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
        TextButton(onClick = { store.setLinks(Links.add(links, offer.first, offer.second)) }) { Text("Show as one") }
        TextButton(onClick = { declined = declined + "${offer.first}|${offer.second}" }) { Text("No") }
    }
}

/** On the page info screen: join this chat with the same person's chat on another network, or split them again. */
@Composable
fun LinkControls(roomId: String) {
    val store = LocalStore.current
    val links by store.links.collectAsState()
    val chats by store.chats.collectAsState()
    val me = store.session.collectAsState().value?.userId ?: ""
    val here = chats[roomId] ?: return
    if (here.isGroup) return
    var open by remember { mutableStateOf(false) }
    val group = Links.groupOf(links, roomId)
    if (group != null && group.size > 1) TextButton(onClick = { store.setLinks(Links.unlink(links, roomId)) }, modifier = Modifier.padding(horizontal = 8.dp)) { Text("Stop showing with other networks") }
    else TextButton(onClick = { open = true }, modifier = Modifier.padding(horizontal = 8.dp)) { Text("Show with the same person on another network…") }
    if (open) {
        val myName = SyncReducer.displayName(here, me).lowercase()
        val options = chats.values.filter { it.id != roomId && !it.isGroup && !it.isBotRoom(me) && it.network != "matrix" }
            .sortedWith(compareByDescending<ChatState> { SyncReducer.displayName(it, me).lowercase() == myName }.thenBy { SyncReducer.displayName(it, me).lowercase() })
        AlertDialog(
            onDismissRequest = { open = false }, confirmButton = { TextButton(onClick = { open = false }) { Text("Cancel") } },
            title = { Text("Same person, another network") },
            text = {
                Column(Modifier.heightIn(max = 380.dp).verticalScroll(rememberScrollState())) {
                    Text("Both show as one in your list, and tabs at the top of the chat switch between them.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(bottom = 8.dp))
                    options.take(80).forEach { c -> Text("${SyncReducer.displayName(c, me)} · ${networkMeta(c.network).label}", Modifier.fillMaxWidth().dpadFocus().clickable { store.setLinks(Links.add(links, roomId, c.id)); open = false }.padding(vertical = 12.dp)) }
                }
            },
        )
    }
}
