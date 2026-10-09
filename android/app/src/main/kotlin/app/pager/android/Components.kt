package app.pager.android

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Brush
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.border
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

val LocalStore = staticCompositionLocalOf<Store> { error("Store not provided") }

fun hueOf(s: String): Float = s.fold(7) { acc, c -> (acc * 31 + c.code) % 360 }.toFloat()
fun hueColor(s: String): Color = Color.hsv(hueOf(s), 0.45f, 0.55f)

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
        val shape = if (LocalSettings.current.avatarShape == "squircle") RoundedCornerShape(size * 0.32f) else CircleShape
        val h = hueOf(name)
        val eink = LocalSettings.current.eink
        Box(
            Modifier.size(size).clip(shape)
                .background(if (eink) Brush.linearGradient(listOf(Color.White, Color.White)) else Brush.linearGradient(listOf(Color.hsv(h, 0.55f, 0.78f), Color.hsv((h + 28f) % 360f, 0.65f, 0.58f))))
                .let { if (eink) it.border(2.dp, Color.Black, shape) else it },
            contentAlignment = Alignment.Center,
        ) {
            if (img != null) Image(img, null, Modifier.size(size), contentScale = ContentScale.Crop, colorFilter = if (eink) androidx.compose.ui.graphics.ColorFilter.colorMatrix(androidx.compose.ui.graphics.ColorMatrix().apply { setToSaturation(0f) }) else null)
            else {
                // Unnamed contacts show up as phone numbers: a person glyph beats a meaningless digit.
                val unnamed = name.isNotEmpty() && name.all { it.isDigit() || it in "+ -()" }
                if (unnamed) Icon(Icons.Rounded.Person, null, Modifier.size(size * 0.55f), tint = if (eink) Color.Black else Color.White.copy(alpha = 0.9f))
                else {
                    val initial = name.dropWhile { !it.isLetterOrDigit() }.firstOrNull()?.uppercase() ?: "?"
                    Text(initial, color = if (eink) Color.Black else Color.White, fontWeight = FontWeight.SemiBold, fontSize = (size.value * 0.4f).sp)
                }
            }
        }
        if (network != null && network != "matrix") {
            val meta = networkMeta(network)
            Box(
                Modifier.size(size * 0.42f).align(Alignment.BottomEnd).clip(CircleShape).background(MaterialTheme.colorScheme.background),
                contentAlignment = Alignment.Center,
            ) {
                Box(Modifier.size(size * 0.33f).clip(CircleShape).background(if (eink) Color.Black else meta.color), contentAlignment = Alignment.Center) {
                    val icon = networkIcon(network)
                    if (icon != null) Icon(icon, null, Modifier.size(size * 0.2f), tint = Color.White)
                    else Text(meta.glyph, color = Color.White, fontSize = (size.value * 0.19f).sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
