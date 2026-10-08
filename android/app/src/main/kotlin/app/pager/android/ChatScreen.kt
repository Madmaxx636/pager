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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun ChatScreen(store: Store, roomId: String, onBack: () -> Unit) {
    val chats by store.chats.collectAsState()
    val me = store.session.collectAsState().value?.userId ?: ""
    val chat = chats[roomId]
    val messages = chat?.messages ?: emptyList()
    val list = rememberLazyListState()
    var text by remember { mutableStateOf("") }
    val group = messages.map { it.sender }.toSet().size > 2

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) list.animateScrollToItem(messages.lastIndex)
        store.markRead(roomId)
    }

    Column(Modifier.fillMaxSize().imePadding()) {
        Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).padding(horizontal = 4.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹", fontSize = 28.sp) }
            val name = chat?.let { SyncReducer.displayName(it, me) } ?: ""
            Avatar(name, chat?.network, 38.dp)
            Column(Modifier.padding(start = 12.dp)) {
                Text(name, fontWeight = FontWeight.SemiBold)
                chat?.let {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(7.dp).clip(CircleShape).background(networkMeta(it.network).color))
                        Text(" ${networkMeta(it.network).label}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }

        LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = list, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 14.dp, vertical = 10.dp)) {
            itemsIndexed(messages, key = { _, m -> m.id }) { i, m ->
                val mine = m.sender == me
                val first = messages.getOrNull(i - 1)?.sender != m.sender
                Column(
                    Modifier.fillMaxWidth().padding(top = if (first) 10.dp else 2.dp),
                    horizontalAlignment = if (mine) Alignment.End else Alignment.Start,
                ) {
                    if (group && !mine && first) Text(m.senderName, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 12.dp, bottom = 2.dp))
                    Box(
                        Modifier.widthIn(max = 290.dp).clip(RoundedCornerShape(18.dp))
                            .background(if (mine) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant)
                            .padding(horizontal = 13.dp, vertical = 8.dp),
                    ) {
                        Text(
                            when (m.type) { "m.image" -> "📷 Photo"; "m.video" -> "🎬 Video"; "m.audio" -> "🎤 Voice message"; "m.file" -> "📎 ${m.body}"; else -> m.body },
                            color = if (mine) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
        }

        Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).padding(10.dp), verticalAlignment = Alignment.Bottom) {
            OutlinedTextField(
                text, { text = it }, placeholder = { Text("Message") }, modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(22.dp), maxLines = 5,
            )
            Spacer(Modifier.size(8.dp))
            Box(
                Modifier.size(52.dp).clip(CircleShape)
                    .background(if (text.isBlank()) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.primary)
                    .clickable(enabled = text.isNotBlank()) { store.send(roomId, text.trim()); text = "" },
                contentAlignment = Alignment.Center,
            ) { Text("➤", color = MaterialTheme.colorScheme.onPrimary, fontSize = 18.sp) }
        }
    }
}
