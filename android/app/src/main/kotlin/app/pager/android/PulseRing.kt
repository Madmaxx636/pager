package app.pager.android

import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp

/**
 * A ring that grows around a picture and fades, for a page with something new. It is only drawn (nothing is laid out again) and stops with
 * "Reduce motion" and on E-ink screens, so it costs next to nothing.
 */
@Composable
fun Modifier.pulseRing(active: Boolean, color: Color): Modifier {
    if (!active || LocalSettings.current.reduceMotion || Ink.on) return this
    val t = rememberInfiniteTransition(label = "pulse")
    val p by t.animateFloat(0f, 1f, infiniteRepeatable(tween(2600, easing = LinearOutSlowInEasing), RepeatMode.Restart), label = "p")
    return this.drawBehind {
        val r = size.minDimension / 2f
        drawCircle(color.copy(alpha = ((1f - p) * 0.75f).coerceIn(0f, 1f)), radius = r * (1f + 0.22f * p), style = Stroke(2.dp.toPx()))
    }
}
