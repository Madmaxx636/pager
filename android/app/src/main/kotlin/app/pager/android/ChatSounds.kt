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

    val choices = listOf("swoosh" to "Swoosh", "chime" to "Chime", "pop" to "Pop", "ding" to "Ding", "knock" to "Knock", "bubble" to "Bubble", "soft" to "Soft", "none" to "None")

    private val recipes = mapOf(
        "swoosh" to listOf(Note(380.0, 0.0, 0.16, slideTo = 1100.0)),
        "chime" to listOf(Note(880.0, 0.0, 0.18), Note(1318.5, 0.12, 0.35)),
        "pop" to listOf(Note(520.0, 0.0, 0.09, "triangle", 0.9, 220.0)),
        "ding" to listOf(Note(1568.0, 0.0, 0.6, g = 0.6)),
        "knock" to listOf(Note(160.0, 0.0, 0.07, "triangle", 1.0), Note(150.0, 0.12, 0.08, "triangle", 1.0)),
        "bubble" to listOf(Note(400.0, 0.0, 0.16, g = 0.8, slideTo = 900.0)),
        "soft" to listOf(Note(660.0, 0.0, 0.3, g = 0.5), Note(784.0, 0.09, 0.34, g = 0.4)),
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
                val wave = if (n.type == "triangle") 2 / PI * kotlin.math.asin(sin(phase)) else sin(phase)
                val attack = (i / (0.012 * RATE)).coerceAtMost(1.0)
                val decay = exp(ln(0.0001) * x) // fade to near silence by the end of the note
                if (start + i < mix.size) mix[start + i] += wave * attack * decay * n.g * 0.5
            }
        }
        val out = ShortArray(mix.size) { (mix[it].coerceIn(-1.0, 1.0) * Short.MAX_VALUE).toInt().toShort() }
        synchronized(cache) { cache[id] = out }
        return out
    }

    /** Plays a sound at [volume] (0..1). Quiet if the phone's sounds are turned down. */
    fun play(id: String, volume: Float) {
        if (volume <= 0f) return
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
}
