package app.pager.android

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

val LocalStore = staticCompositionLocalOf<Store> { error("Store not provided") }

fun hueColor(s: String): Color {
    val h = s.fold(7) { acc, c -> (acc * 31 + c.code) % 360 }
    return Color.hsv(h.toFloat(), 0.45f, 0.55f)
}

/** Loads a Matrix image (thumbnail of [thumb] px; 0 = original). Returns null while loading or on failure. */
@Composable
fun rememberMxcImage(mxc: String?, thumb: Int, enabled: Boolean = true): ImageBitmap? {
    val media = LocalStore.current.media
    val bmp by produceState<ImageBitmap?>(null, mxc, thumb, enabled) {
        value = if (mxc == null || !enabled) null else media.bitmap(mxc, thumb)?.asImageBitmap()
    }
    return bmp
}

@Composable
fun Avatar(name: String, network: String?, size: Dp = 46.dp, mxc: String? = null) {
    Box(Modifier.size(size)) {
        val img = rememberMxcImage(mxc, (size.value * 3).toInt())
        Box(Modifier.size(size).clip(CircleShape).background(hueColor(name)), contentAlignment = Alignment.Center) {
            if (img != null) Image(img, null, Modifier.size(size), contentScale = ContentScale.Crop)
            else {
                val initial = name.dropWhile { !it.isLetterOrDigit() }.firstOrNull()?.uppercase() ?: "?"
                Text(initial, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = (size.value * 0.4f).sp)
            }
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
