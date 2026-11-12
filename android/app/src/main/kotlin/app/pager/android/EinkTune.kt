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

/** The 4x5 colour matrix for [contrastScale]: every channel is stretched around mid-gray. */
fun contrastMatrixValues(level: Int): FloatArray {
    val k = contrastScale(level)
    val off = 255f * (0.5f - 0.5f * k)
    return floatArrayOf(
        k, 0f, 0f, 0f, off,
        0f, k, 0f, 0f, off,
        0f, 0f, k, 0f, off,
        0f, 0f, 0f, 1f, 0f,
    )
}

/** The window brightness to ask for: null means "leave it to the system". */
fun windowBrightness(level: Int): Float? = if (level <= 0) null else level.coerceIn(1, 100) / 100f

fun Modifier.einkContrast(level: Int): Modifier = if (level <= 0) this else drawWithContent {
    drawIntoCanvas { c ->
        val p = Paint().apply { colorFilter = ColorFilter.colorMatrix(ColorMatrix(contrastMatrixValues(level))) }
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
