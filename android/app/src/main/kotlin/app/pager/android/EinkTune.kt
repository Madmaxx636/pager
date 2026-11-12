package app.pager.android

import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.draw.drawWithContent

/** Screen-wide contrast for e-ink: 0 leaves the picture alone, 100 pushes every tone hard towards black or white. */
fun contrastScale(level: Int): Float = 1f + level.coerceIn(0, 100) / 40f

/** Picture brightness for e-ink: -100 darkens every tone, 0 leaves it, 100 lifts every tone (about half the range at the ends). */
fun brightnessShift(level: Int): Float = level.coerceIn(-100, 100) / 100f * 0.5f * 255f

/** The 4x5 colour matrix: contrast stretches each channel around mid-gray, brightness then shifts it. */
fun toneMatrixValues(contrast: Int, brightness: Int): FloatArray {
    val k = contrastScale(contrast)
    val off = 255f * (0.5f - 0.5f * k) + brightnessShift(brightness)
    return floatArrayOf(
        k, 0f, 0f, 0f, off,
        0f, k, 0f, 0f, off,
        0f, 0f, k, 0f, off,
        0f, 0f, 0f, 1f, 0f,
    )
}

fun Modifier.einkTone(contrast: Int, brightness: Int): Modifier = if (contrast <= 0 && brightness == 0) this else drawWithContent {
    drawIntoCanvas { c ->
        val p = Paint().apply { colorFilter = ColorFilter.colorMatrix(ColorMatrix(toneMatrixValues(contrast, brightness))) }
        c.saveLayer(Rect(0f, 0f, size.width, size.height), p)
        drawContent()
        c.restore()
    }
}

/** What a deep refresh draws: alternating black and white, ending on white. Each step is (black?, milliseconds). */
fun deepRefreshSteps(rounds: Int): List<Pair<Boolean, Long>> =
    (0 until rounds.coerceIn(1, 4)).flatMap { listOf(true to 220L, false to 220L) }

/** Counts events and says when the Nth one has arrived (for "deep refresh every N chat changes"). */
class EveryNth(private val n: () -> Int) {
    private var seen = 0
    fun hit(): Boolean { seen++; if (seen >= n().coerceAtLeast(1)) { seen = 0; return true }; return false }
}
