package app.pager.android

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** How the mascot behaves: idle (bobbing, waves pulsing), ring (it just got a message: shaking) or still. */
enum class MascotMood { Idle, Ring }

/**
 * Pager's mascot: a little pager that is going off and smiling. Built from stacked vector parts so the body, antenna, sound waves
 * and ring marks each move on their own. Stays still with "Reduce motion" (and in E-ink mode).
 */
@Composable
fun PagerMascot(size: Dp = 120.dp, modifier: Modifier = Modifier, mood: MascotMood = MascotMood.Idle) {
    val still = LocalSettings.current.reduceMotion
    val t = rememberInfiniteTransition(label = "mascot")
    val ring = mood == MascotMood.Ring
    val bob by t.animateFloat(0f, 1f, infiniteRepeatable(tween(if (ring) 250 else 1100, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "bob")
    val wiggle by t.animateFloat(-1f, 1f, infiniteRepeatable(tween(800, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "wiggle")
    val wave by t.animateFloat(0f, 1f, infiniteRepeatable(tween(if (ring) 800 else 1500), RepeatMode.Restart), label = "wave")
    val flash by t.animateFloat(0.15f, 1f, infiniteRepeatable(tween(if (ring) 250 else 750), RepeatMode.Reverse), label = "flash")
    val s = if (still) 0f else 1f
    Box(modifier.size(size)) {
        // Sound waves: fade in as they grow, then out.
        for ((i, delay) in listOf(0f, 0.25f).withIndex()) {
            val p = ((wave + delay) % 1f)
            Image(
                painterResource(R.drawable.pager_waves), null,
                Modifier.size(size).graphicsLayer {
                    // Only the inner or outer pair shows per layer: draw both layers but fade the other by index.
                    alpha = if (still) 0.8f else (if (p < 0.35f) p / 0.35f else (1f - p) / 0.65f).coerceIn(0f, 1f) * (if (i == 0) 1f else 0.6f)
                    val sc = 0.84f + 0.32f * p * s; scaleX = sc; scaleY = sc
                },
            )
        }
        Image(painterResource(R.drawable.pager_shadow), null, Modifier.size(size).graphicsLayer { alpha = 0.7f; scaleX = 1f - 0.12f * bob * s })
        Box(
            Modifier.size(size).graphicsLayer {
                translationY = -bob * size.toPx() * (if (ring) 0.01f else 0.025f) * s
                rotationZ = if (ring) wiggle * 4f * s else 0f
                transformOrigin = TransformOrigin(0.5f, 0.9f)
            },
        ) {
            Image(painterResource(R.drawable.pager_body), null, Modifier.size(size))
            Image(
                painterResource(R.drawable.pager_antenna), null,
                Modifier.size(size).graphicsLayer { rotationZ = wiggle * 9f * s; transformOrigin = TransformOrigin(0.5f, 0.235f) },
            )
        }
        Image(painterResource(R.drawable.pager_ring), null, Modifier.size(size).graphicsLayer { alpha = if (still) 0.9f else flash })
    }
}

/** The Pager mark used on sign-in and in empty states. */
@Composable
fun PagerLogo(size: Dp = 56.dp, modifier: Modifier = Modifier) = PagerMascot(size, modifier)
