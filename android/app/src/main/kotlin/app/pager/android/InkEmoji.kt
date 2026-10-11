package app.pager.android

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.abs

/**
 * Draws everything below it in pure black and white: colour goes to gray and the gray is pushed hard to black or white, so coloured
 * circles, emoji and badges stop being mid-gray smudges on an E-ink screen.
 */
private val EINK_MATRIX = ColorMatrix(floatArrayOf(
    0.66f, 1.30f, 0.24f, 0f, -153f,
    0.66f, 1.30f, 0.24f, 0f, -153f,
    0.66f, 1.30f, 0.24f, 0f, -153f,
    0f, 0f, 0f, 1f, 0f,
))
fun Modifier.einkFilter(on: Boolean): Modifier = if (!on) this else drawWithContent {
    drawIntoCanvas { c ->
        val p = androidx.compose.ui.graphics.Paint().apply { colorFilter = ColorFilter.colorMatrix(EINK_MATRIX) }
        c.saveLayer(Rect(0f, 0f, size.width, size.height), p)
        drawContent()
        c.restore()
    }
}

private val lineCache = HashMap<String, ImageBitmap>()

/** An emoji redrawn as a black outline on nothing: its edge and the lines inside it, no colour and no fill. */
private fun lineArt(emoji: String): ImageBitmap {
    synchronized(lineCache) { lineCache[emoji]?.let { return it } }
    val n = 128
    val bmp = Bitmap.createBitmap(n, n, Bitmap.Config.ARGB_8888)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = n * 0.78f; textAlign = Paint.Align.CENTER }
    Canvas(bmp).drawText(emoji, n / 2f, n / 2f - (paint.descent() + paint.ascent()) / 2f, paint)
    val px = IntArray(n * n); bmp.getPixels(px, 0, n, 0, 0, n, n)
    val alpha = IntArray(n * n) { px[it] ushr 24 }
    // Brightness as it looks over white paper, so a pale yellow face still has a visible edge against dark eyes and mouth.
    val lum = IntArray(n * n) {
        val a = alpha[it]; val r = (px[it] shr 16) and 255; val g = (px[it] shr 8) and 255; val b = px[it] and 255
        val gray = (r * 30 + g * 59 + b * 11) / 100
        255 - a * (255 - gray) / 255
    }
    fun edge(m: IntArray, x: Int, y: Int): Int {
        fun v(dx: Int, dy: Int) = m[(y + dy) * n + (x + dx)]
        val gx = -v(-1, -1) - 2 * v(-1, 0) - v(-1, 1) + v(1, -1) + 2 * v(1, 0) + v(1, 1)
        val gy = -v(-1, -1) - 2 * v(0, -1) - v(1, -1) + v(-1, 1) + 2 * v(0, 1) + v(1, 1)
        return abs(gx) + abs(gy)
    }
    val out = IntArray(n * n)
    for (y in 1 until n - 1) for (x in 1 until n - 1) if (edge(alpha, x, y) > 300 || edge(lum, x, y) > 130) out[y * n + x] = 0xFF000000.toInt()
    val res = Bitmap.createBitmap(out, n, n, Bitmap.Config.ARGB_8888).asImageBitmap()
    synchronized(lineCache) { lineCache[emoji] = res }
    return res
}

/** An emoji: as usual, or (in E-ink mode) as a hollow black outline. */
@Composable
fun EmojiGlyph(emoji: String, sizeSp: Float, modifier: Modifier = Modifier) {
    if (!LocalSettings.current.eink) { Text(emoji, fontSize = sizeSp.sp, modifier = modifier); return }
    val art by produceState<ImageBitmap?>(lineCache[emoji], emoji) { value = withContext(Dispatchers.Default) { lineArt(emoji) } }
    val shown = art
    if (shown == null) androidx.compose.foundation.layout.Spacer(modifier.size((sizeSp * 1.15f).dp))
    else Image(shown, emoji, modifier.size((sizeSp * 1.15f).dp))
}
