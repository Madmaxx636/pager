package app.pager.android

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import kotlin.random.Random

/** Full-screen message effects, triggered by what a message says. Purely local: nothing extra is sent. */
enum class Effect { Confetti, Hearts, Balloons, Snow, Sparkles }

object Effects {
    private val heartsOnly = Regex("^(?:❤️|💕|💖|💗|💘|😍|🥰|😘|♥️|💞|❤)+$")

    fun effectFor(text: String): Effect? {
        val t = text.lowercase()
        fun has(vararg n: String) = n.any { t.contains(it) }
        if (has("🎉", "🎊", "🥳", "congrats", "congratulations")) return Effect.Confetti
        if (has("🎈", "happy birthday", "🎂")) return Effect.Balloons
        if (has("❄️", "⛄", "☃️", "🌨", "let it snow")) return Effect.Snow
        if (has("✨", "🌟", "⭐", "🪄")) return Effect.Sparkles
        val stripped = text.filterNot { it.isWhitespace() }
        if (stripped.isNotEmpty() && stripped.length <= 12 && heartsOnly.matches(stripped)) return Effect.Hearts
        if (has("i love you", "love you")) return Effect.Hearts
        return null
    }

    class Particle(var x: Float, var y: Float, val vx: Float, val vy: Float, val size: Float, var rot: Float, val vr: Float, val color: Color, val glyph: String?, var life: Float, var wobble: Float)

    private val colors = listOf(0xFFFF5D73, 0xFFFFB703, 0xFF2DD4BF, 0xFF60A5FA, 0xFFC084FC, 0xFF34D399, 0xFFF472B6).map { Color(it) }
    private fun r(a: Float, b: Float) = a + Random.nextFloat() * (b - a)

    fun spawn(e: Effect, w: Float, h: Float): List<Particle> {
        val n = when (e) { Effect.Snow -> 90; Effect.Confetti -> 140; else -> 40 }
        return List(n) { i ->
            val c = colors[i % colors.size]
            when (e) {
                Effect.Confetti -> Particle(r(0f, w), r(-h * .4f, 0f), r(-1.5f, 1.5f), r(2f, 5f), r(6f, 11f), r(0f, 6.28f), r(-.2f, .2f), c, null, 1f, r(0f, 6.28f))
                Effect.Hearts -> Particle(r(0f, w), h + r(0f, h * .5f), r(-.5f, .5f), r(-4.5f, -2f), r(18f, 34f), 0f, 0f, c, listOf("❤️", "💕", "💖", "💗")[i % 4], 1f, r(0f, 6.28f))
                Effect.Balloons -> Particle(r(0f, w), h + r(0f, h * .6f), r(-.3f, .3f), r(-3.2f, -1.6f), r(28f, 44f), 0f, 0f, c, "🎈", 1f, r(0f, 6.28f))
                Effect.Snow -> Particle(r(0f, w), r(-h, 0f), r(-.6f, .6f), r(1f, 2.8f), r(2f, 5f), 0f, 0f, Color.White, null, 1f, r(0f, 6.28f))
                Effect.Sparkles -> Particle(r(0f, w), r(0f, h), 0f, r(-.3f, .3f), r(10f, 22f), 0f, 0f, c, "✨", r(.2f, 1f), r(0f, 6.28f))
            }
        }
    }

    /** Advances one frame (units are "per 60 fps frame", scaled by [k]); returns whether anything is still visible. */
    fun step(ps: List<Particle>, e: Effect, h: Float, k: Float = 1f): Boolean {
        var alive = false
        for (p in ps) {
            p.wobble += 0.06f * k
            p.x += (p.vx + kotlin.math.sin(p.wobble) * (if (e == Effect.Snow) .5f else if (e == Effect.Confetti) .9f else .6f)) * k
            p.y += p.vy * k
            p.rot += p.vr * k
            when (e) {
                Effect.Sparkles -> { p.life -= 0.012f * k; if (p.life > 0f) alive = true }
                Effect.Hearts, Effect.Balloons -> if (p.y > -60f) alive = true
                else -> if (p.y < h + 20f) alive = true
            }
        }
        return alive
    }
}

/** Plays a full-screen effect when a fresh message (sent or received) calls for one. */
@Composable
fun ScreenEffects(messages: List<Msg>, roomId: String) {
    val s = LocalSettings.current
    val last = messages.lastOrNull()
    var seen by remember(roomId) { mutableStateOf<String?>(null) }
    var first by remember(roomId) { mutableStateOf(true) }
    var playing by remember { mutableStateOf<Effect?>(null) }
    var token by remember { mutableLongStateOf(0L) }

    LaunchedEffect(last?.id) {
        val id = last?.id ?: return@LaunchedEffect
        val wasFirst = first
        first = false
        val changed = seen != id
        seen = id
        if (wasFirst || !changed || !s.screenEffects || s.reduceMotion) return@LaunchedEffect
        if (System.currentTimeMillis() - last.ts > 6000 || last.type != "m.text") return@LaunchedEffect
        Effects.effectFor(last.body)?.let { playing = it; token++ }
    }

    val effect = playing ?: return
    val density = LocalDensity.current.density
    var frame by remember(token) { mutableLongStateOf(0L) }
    var particles by remember(token) { mutableStateOf<List<Effects.Particle>?>(null) }
    var size by remember(token) { mutableStateOf(Size.Zero) }

    LaunchedEffect(token, size) {
        if (size.width <= 0f) return@LaunchedEffect
        val ps = Effects.spawn(effect, size.width / density, size.height / density)
        particles = ps
        var prev = 0L
        val start = System.nanoTime()
        while (true) {
            val now = androidx.compose.runtime.withFrameNanos { it }
            val k = if (prev == 0L) 1f else ((now - prev) / 16_666_667f).coerceIn(0.5f, 3f)
            prev = now
            val alive = Effects.step(ps, effect, size.height / density, k)
            frame = now
            if (!alive || System.nanoTime() - start > 6_500_000_000L) break
        }
        playing = null
    }

    Canvas(Modifier.fillMaxSize().onSizeChanged { size = Size(it.width.toFloat(), it.height.toFloat()) }) {
        frame // read to redraw each frame
        val ps = particles ?: return@Canvas
        val paint = android.graphics.Paint().apply { isAntiAlias = true; textAlign = android.graphics.Paint.Align.CENTER }
        for (p in ps) {
            val x = p.x * density; val y = p.y * density
            if (effect == Effect.Sparkles && p.life <= 0f) continue
            when {
                p.glyph != null -> {
                    paint.textSize = p.size * density
                    paint.alpha = if (effect == Effect.Sparkles) (kotlin.math.sin(p.life * Math.PI).coerceAtLeast(0.0) * 255).toInt() else 255
                    drawContext.canvas.nativeCanvas.drawText(p.glyph, x, y, paint)
                }
                effect == Effect.Snow -> drawCircle(p.color.copy(alpha = 0.85f), p.size * density, Offset(x, y))
                else -> rotate(p.rot * 57.2958f, Offset(x, y)) { drawRect(p.color, Offset(x - p.size * density / 2, y - p.size * density / 4), Size(p.size * density, p.size * density / 2)) }
            }
        }
    }
}
