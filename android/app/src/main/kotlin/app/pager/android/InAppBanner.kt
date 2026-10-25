package app.pager.android

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

/**
 * A message for another page arrives while you are in the app: it slides in at the top for a few seconds. Tap it to open that page, swipe it up
 * (or wait) to dismiss. Pages you are looking at, muted pages and quiet hours follow the same rules as the phone's notifications.
 */
@Composable
fun InAppBanner(onOpen: (String) -> Unit) {
    val store = LocalStore.current
    var shown by remember { mutableStateOf<Incoming?>(null) }
    var gen by remember { mutableStateOf(0) }
    LaunchedEffect(Unit) { store.inApp.collect { shown = it; gen++ } }
    LaunchedEffect(gen) { if (shown != null) { delay(5000); shown = null } }
    val m = shown
    Box(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 6.dp), contentAlignment = Alignment.TopCenter) {
        AnimatedVisibility(m != null, enter = slideInVertically { -it } + fadeIn(), exit = slideOutVertically { -it } + fadeOut()) {
            val cur = m ?: return@AnimatedVisibility
            val who = if (cur.isGroup) "${cur.chat} · ${cur.sender}" else cur.chat
            val body = when (cur.preview) { "hidden" -> "New message"; "sender" -> ""; else -> cur.text }
            Surface(
                Modifier.fillMaxWidth().pointerInput(gen) { detectVerticalDragGestures { _, drag -> if (drag < -8f) shown = null } }.clickable { shown = null; onOpen(cur.roomId) },
                shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surface, tonalElevation = 6.dp, shadowElevation = 10.dp,
            ) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Avatar(cur.chat, cur.network, size = 40.dp)
                    Column(Modifier.padding(start = 12.dp).weight(1f)) {
                        Text(if (cur.preview == "hidden") "New message" else who, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurface)
                        if (body.isNotEmpty() && cur.preview != "hidden") Text(body, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}
