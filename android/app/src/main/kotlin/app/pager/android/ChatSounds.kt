package app.pager.android

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.sin

/** The little sounds you hear inside a page when you send or get a message. Synthesized, so there are no files; same recipes as the web app. */
object ChatSounds {
    private class Note(val f: Double, val t: Double, val d: Double, val type: String = "sine", val g: Double = 0.7, val slideTo: Double? = null)

    val choices: List<Pair<String, String>> = listOf("custom" to "Your own sound") + listOf("swoosh" to "Swoosh", "chime" to "Chime", "pop" to "Pop", "ding" to "Ding", "knock" to "Knock", "bubble" to "Bubble", "soft" to "Soft", "pager" to "Pager (three beeps)", "beepbeep" to "Beep beep", "trill" to "Trill", "twotone" to "Two tone", "sendblip" to "Blip", "tick" to "Tick", "marimba" to "Marimba", "xylophone" to "Xylophone", "glass" to "Glass", "droplet" to "Droplet", "harp" to "Harp", "radar" to "Radar", "coin" to "Coin", "bell" to "Bell", "kalimba" to "Kalimba", "zap" to "Zap", "doorbell" to "Doorbell", "rise" to "Rise", "fall" to "Fall", "morse" to "Morse", "whistle" to "Whistle", "woodblock" to "Wood block").let { it + ANDROID_SOUNDS + ("none" to "None") }

    private val recipes = mapOf(
        "swoosh" to listOf(Note(380.0, 0.0, 0.16, slideTo = 1100.0)),
        "chime" to listOf(Note(880.0, 0.0, 0.18), Note(1318.5, 0.12, 0.35)),
        "pop" to listOf(Note(520.0, 0.0, 0.09, "triangle", 0.9, 220.0)),
        "ding" to listOf(Note(1568.0, 0.0, 0.6, g = 0.6)),
        "knock" to listOf(Note(160.0, 0.0, 0.07, "triangle", 1.0), Note(150.0, 0.12, 0.08, "triangle", 1.0)),
        "bubble" to listOf(Note(400.0, 0.0, 0.16, g = 0.8, slideTo = 900.0)),
        "soft" to listOf(Note(660.0, 0.0, 0.3, g = 0.5), Note(784.0, 0.09, 0.34, g = 0.4)),
        // The classic pager family: square-wave beeps like a little speaker.
        "pager" to listOf(0.0, 0.16, 0.32).map { Note(2093.0, it, 0.09, "square", 0.45) },
        "beepbeep" to listOf(0.0, 0.2).map { Note(1760.0, it, 0.13, "square", 0.45) },
        "trill" to (0..5).map { Note(if (it % 2 == 1) 2093.0 else 1568.0, it * 0.055, 0.05, "square", 0.4) },
        "twotone" to listOf(Note(1046.5, 0.0, 0.16, "triangle", 0.8), Note(1568.0, 0.17, 0.26, "triangle", 0.8)),
        "sendblip" to listOf(Note(1200.0, 0.0, 0.07, "square", 0.35, 1900.0)),
        "tick" to listOf(Note(2600.0, 0.0, 0.035, "square", 0.35), Note(3300.0, 0.05, 0.035, "square", 0.3)),
        "marimba" to listOf(Note(523.3, 0.0, 0.22, "triangle", 0.9), Note(659.3, 0.11, 0.22, "triangle", 0.9), Note(784.0, 0.22, 0.3, "triangle", 0.9)),
        "xylophone" to listOf(Note(1318.5, 0.0, 0.12), Note(1760.0, 0.1, 0.2)),
        "glass" to listOf(Note(2349.0, 0.0, 0.7, g = 0.45), Note(3136.0, 0.02, 0.5, g = 0.25)),
        "droplet" to listOf(Note(1800.0, 0.0, 0.12, g = 0.8, slideTo = 700.0)),
        "harp" to listOf(523.3, 659.3, 784.0, 1046.5).mapIndexed { i, f -> Note(f, i * 0.07, 0.4, g = 0.55) },
        "radar" to listOf(Note(900.0, 0.0, 0.35, g = 0.5, slideTo = 1500.0), Note(900.0, 0.4, 0.35, g = 0.4, slideTo = 1500.0)),
        "coin" to listOf(Note(988.0, 0.0, 0.08, "square", 0.35), Note(1319.0, 0.08, 0.4, "square", 0.35)),
        "bell" to listOf(Note(1046.5, 0.0, 0.85, g = 0.5), Note(2093.0, 0.0, 0.6, g = 0.2), Note(2637.0, 0.0, 0.4, g = 0.12)),
        "kalimba" to listOf(Note(784.0, 0.0, 0.35, "triangle", 0.7), Note(1046.5, 0.14, 0.45, "triangle", 0.7)),
        "zap" to listOf(Note(2400.0, 0.0, 0.14, "sawtooth", 0.3, 200.0)),
        "doorbell" to listOf(Note(659.3, 0.0, 0.3), Note(523.3, 0.35, 0.55)),
        "rise" to listOf(Note(392.0, 0.0, 0.12, "triangle"), Note(523.3, 0.1, 0.12, "triangle"), Note(659.3, 0.2, 0.12, "triangle"), Note(784.0, 0.3, 0.25, "triangle")),
        "fall" to listOf(Note(784.0, 0.0, 0.12, "triangle"), Note(659.3, 0.1, 0.12, "triangle"), Note(523.3, 0.2, 0.12, "triangle"), Note(392.0, 0.3, 0.25, "triangle")),
        "morse" to listOf(Note(880.0, 0.0, 0.06, "square", 0.35), Note(880.0, 0.12, 0.18, "square", 0.35), Note(880.0, 0.36, 0.06, "square", 0.35)),
        "whistle" to listOf(Note(1400.0, 0.0, 0.3, g = 0.4, slideTo = 2200.0), Note(2200.0, 0.3, 0.15, g = 0.35, slideTo = 1800.0)),
        "woodblock" to listOf(Note(900.0, 0.0, 0.05, "triangle", 1.0), Note(700.0, 0.15, 0.06, "triangle", 1.0)),
    )

    private const val RATE = 44100
    private val cache = HashMap<String, ShortArray>()

    /** The samples of one sound: each note is a tone with a quick fade in and a smooth fade out (and an optional glide in pitch). */
    fun render(id: String): ShortArray? {
        val notes = recipes[id] ?: return null
        synchronized(cache) { cache[id]?.let { return it } }
        val total = notes.maxOf { it.t + it.d } + 0.06
        val mix = DoubleArray((total * RATE).toInt())
        for (n in notes) {
            val start = (n.t * RATE).toInt(); val len = (n.d * RATE).toInt()
            var phase = 0.0
            for (i in 0 until len) {
                val x = i.toDouble() / len
                val freq = if (n.slideTo != null) n.f * Math.pow(n.slideTo / n.f, x) else n.f
                phase += 2 * PI * freq / RATE
                val wave = when (n.type) { "triangle" -> 2 / PI * kotlin.math.asin(sin(phase)); "square" -> if (sin(phase) >= 0) 1.0 else -1.0; "sawtooth" -> 2 * ((phase / (2 * PI)) % 1.0) - 1; else -> sin(phase) }
                val attack = (i / (0.012 * RATE)).coerceAtMost(1.0)
                val decay = exp(ln(0.0001) * x) // fade to near silence by the end of the note
                if (start + i < mix.size) mix[start + i] += wave * attack * decay * n.g * 0.5
            }
        }
        val out = ShortArray(mix.size) { (mix[it].coerceIn(-1.0, 1.0) * Short.MAX_VALUE).toInt().toShort() }
        synchronized(cache) { cache[id] = out }
        return out
    }

    private var appContext: android.content.Context? = null
    /** Needed for the Android sounds, which are files in the app rather than made from tones. */
    fun init(context: android.content.Context) { appContext = context.applicationContext }

    /** Plays a sound at [volume] (0..1). Quiet if the phone's sounds are turned down. */
    fun play(id: String, volume: Float) {
        if (volume <= 0f) return
        if (id == "custom") { if (!appContext.let { c -> c != null && CustomSound.play(c, volume, android.media.AudioAttributes.USAGE_ASSISTANCE_SONIFICATION) }) play("ding", volume); return }
        if (id.startsWith("android_")) { playFile(id, volume); return }
        val pcm = render(id) ?: return
        Thread {
            runCatching {
                val track = AudioTrack.Builder()
                    .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                    .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(RATE).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                    .setBufferSizeInBytes(pcm.size * 2).setTransferMode(AudioTrack.MODE_STATIC).build()
                track.write(pcm, 0, pcm.size)
                track.setVolume(volume.coerceIn(0f, 1f))
                track.play()
                Thread.sleep((pcm.size * 1000L / RATE) + 80)
                track.release()
            }
        }.start()
    }

    private fun playFile(id: String, volume: Float) {
        val ctx = appContext ?: return
        runCatching {
            val res = ctx.resources.getIdentifier(id, "raw", ctx.packageName); if (res == 0) return
            val mp = android.media.MediaPlayer.create(ctx, res, android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_ASSISTANCE_SONIFICATION).setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION).build(), 0) ?: return
            mp.setVolume(volume.coerceIn(0f, 1f), volume.coerceIn(0f, 1f))
            mp.setOnCompletionListener { it.release() }
            mp.start()
        }
    }
}
