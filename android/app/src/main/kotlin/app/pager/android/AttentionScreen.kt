package app.pager.android

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Call
import androidx.compose.material.icons.rounded.CallEnd
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.Videocam
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Fills the screen when someone nudges or rings you; a ring keeps ringing until you answer, decline or it times out. */
@Composable
fun AttentionOverlay(onAnswer: (String) -> Unit) {
    val a by Attention.alert.collectAsState()
    val alert = a ?: return
    val context = LocalContext.current
    val calling = Attention.calling(alert.kind)
    val picture = if (alert.kind == "image") rememberMxcImage(alert.mxc, 0) else null
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background.copy(alpha = 0.97f)).clickable(enabled = false) {}, contentAlignment = Alignment.Center) {
        picture?.let { Image(it, null, Modifier.fillMaxSize().background(Color.Black), contentScale = ContentScale.Fit) }
        Column(
            Modifier.then(if (picture != null) Modifier.align(Alignment.BottomCenter).padding(bottom = 36.dp).clip(RoundedCornerShape(22.dp)).background(MaterialTheme.colorScheme.surface).padding(20.dp) else Modifier.padding(24.dp)),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (picture == null) Box(Modifier.size(96.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
                Icon(if (alert.kind == "video") Icons.Rounded.Videocam else if (calling) Icons.Rounded.Call else Icons.Rounded.Notifications, null, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(48.dp))
            }
            Text(alert.sender, fontSize = 28.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
            Text(
                when (alert.kind) { "nudge" -> "wants your attention"; "image" -> "sent you something to look at"; "video" -> "is video-ringing you…"; else -> "is ringing you…" },
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (alert.chat != alert.sender) Text(alert.chat, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(Modifier.padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(28.dp)) {
                Round(Icons.Rounded.CallEnd, if (calling) "Decline" else "Dismiss", Color(0xFFEF4444)) { Attention.dismiss(context) }
                Round(if (alert.kind == "video") Icons.Rounded.Videocam else if (calling) Icons.Rounded.Call else Icons.Rounded.Notifications, if (calling) "Answer" else "Open chat", Color(0xFF22C55E)) { onAnswer(alert.roomId); Attention.dismiss(context) }
            }
            if (calling) Text("A Pager ring. Answering opens the chat; it isn't a voice or video call.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 8.dp).widthIn(max = 280.dp))
        }
    }
}

@Composable
private fun Round(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, color: Color, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.size(68.dp).clip(CircleShape).background(color).dpadFocus().clickable(onClick = onClick), contentAlignment = Alignment.Center) { Icon(icon, label, tint = Color.White, modifier = Modifier.size(32.dp)) }
        Text(label, style = MaterialTheme.typography.labelLarge)
    }
}

/** Pick how to get their attention. */
@Composable
fun AttentionSheet(onSend: (String) -> Unit, onPicture: () -> Unit, onDismiss: () -> Unit) {
    Sheet(onDismiss) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Get their attention", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Attention.kinds.forEach { k ->
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)).dpadFocus().clickable { if (k.id == "image") onPicture() else onSend(k.id) }.padding(14.dp)) {
                    Text(k.label, fontWeight = FontWeight.SemiBold)
                    Text(k.hint, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Text("Rings and nudges only alert people using Pager; on other apps they just see a short message. This is an alert, not a real voice or video call.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 8.dp))
        }
    }
}
