package app.pager.android

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

fun hueColor(s: String): Color {
    val h = s.fold(7) { acc, c -> (acc * 31 + c.code) % 360 }
    return Color.hsv(h.toFloat(), 0.45f, 0.55f)
}

@Composable
fun Avatar(name: String, network: String?, size: Dp = 46.dp) {
    Box(Modifier.size(size)) {
        Box(
            Modifier.size(size).clip(CircleShape).background(hueColor(name)),
            contentAlignment = Alignment.Center,
        ) {
            val initial = name.dropWhile { !it.isLetterOrDigit() }.firstOrNull()?.uppercase() ?: "?"
            Text(initial, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = (size.value * 0.4f).sp)
        }
        if (network != null && network != "matrix") {
            val meta = networkMeta(network)
            Box(
                Modifier.size(size * 0.4f).align(Alignment.BottomEnd).clip(CircleShape).background(MaterialTheme.colorScheme.surface),
                contentAlignment = Alignment.Center,
            ) {
                Box(Modifier.size(size * 0.33f).clip(CircleShape).background(meta.color), contentAlignment = Alignment.Center) {
                    Text(meta.glyph, color = Color.White, fontSize = (size.value * 0.19f).sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
