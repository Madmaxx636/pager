package app.pager.android

import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp

/**
 * A ring that grows around a picture and fades, for a page with something new. It pulses three times and then rests as a still ring: an
 * animation that never ends keeps the screen redrawing and drains the battery. It is only drawn (nothing is laid out again), and the pulse
 * stops with "Reduce motion" and on E-ink screens.
 */
@Composable
fun Modifier.pulseRing(active: Boolean, color: Color): Modifier {
    if (!active) return this
    val still = LocalSettings.current.reduceMotion || Ink.on
    val p = remember { Animatable(0f) }
    LaunchedEffect(still) {
        if (still) return@LaunchedEffect
        repeat(3) { p.snapTo(0f); p.animateTo(1f, tween(2600, easing = LinearOutSlowInEasing)) }
    }
    return this.drawBehind {
        val r = size.minDimension / 2f
        drawCircle(color.copy(alpha = 0.55f), radius = r * 1.04f, style = Stroke(2.dp.toPx()))
        val v = p.value
        if (!still && v in 0.001f..0.999f) drawCircle(color.copy(alpha = ((1f - v) * 0.75f).coerceIn(0f, 1f)), radius = r * (1f + 0.22f * v), style = Stroke(2.dp.toPx()))
    }
}
