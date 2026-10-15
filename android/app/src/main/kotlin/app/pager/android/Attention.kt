package app.pager.android

import android.content.Context
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Getting someone's attention: a nudge, a ring or a full-screen picture. It is an ordinary message with an extra field that Pager apps act
 * on; every other app and network just shows the words. It is a loud alert, not a voice or video call.
 */
object Attention {
    const val FIELD = "app.pager.attention"
    class Kind(val id: String, val label: String, val hint: String)
    val kinds = listOf(
        Kind("nudge", "Nudge", "A loud alert that shakes their screen"),
        Kind("ring", "Ring", "Rings like a phone call until they answer"),
        Kind("video", "Video ring", "Rings like a video call; opens the chat when answered"),
        Kind("image", "Full-screen picture", "Fills their screen with a picture you pick"),
    )
    fun valid(k: String?) = kinds.any { it.id == k }
    fun kindOf(content: JsonObject): String? = ((content[FIELD] as? JsonObject)?.get("kind") as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { valid(it) }
    /** The words other apps show instead. */
    fun text(kind: String) = when (kind) { "nudge" -> "👋 Nudge! Someone wants your attention"; "ring" -> "📞 Ringing you on Pager"; "video" -> "🎥 Video-ringing you on Pager"; else -> "🔔 Look at this!" }
    /** Only fresh ones ring: an old nudge that arrives with a backlog must not wake the phone. */
    fun fresh(ts: Long, now: Long = System.currentTimeMillis()) = now - ts < 90_000 && ts - now < 60_000
    fun calling(kind: String) = kind == "ring" || kind == "video"

    class Alert(val id: String, val roomId: String, val chat: String, val sender: String, val kind: String, val mxc: String? = null)
    private val _alert = MutableStateFlow<Alert?>(null)
    val alert: StateFlow<Alert?> = _alert
    private val seen = HashSet<String>()
    private val handler = Handler(Looper.getMainLooper())
    private var ringtone: Ringtone? = null
    private var tick: Runnable? = null
    private var vib: Vibrator? = null
    private var toneGen: ToneGenerator? = null

    /** [inApp]: Pager is on screen, so it rings itself; otherwise the notification's own channel rings. */
    fun raise(context: Context, a: Alert, inApp: Boolean) {
        if (!seen.add(a.id)) return
        _alert.value = a
        if (inApp) startSound(context, a.kind)
        handler.postDelayed({ if (_alert.value?.id == a.id) dismiss(context) }, if (calling(a.kind)) 45_000 else 12_000)
    }

    fun dismiss(context: Context) {
        stopSound()
        _alert.value?.let { Notifier.clearAttention(context) }
        _alert.value = null
    }

    private fun vibrator(context: Context): Vibrator? = context.getSystemService(Vibrator::class.java)

    private fun startSound(context: Context, kind: String) {
        stopSound()
        vib = vibrator(context)
        if (calling(kind)) {
            runCatching {
                ringtone = RingtoneManager.getRingtone(context, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE))?.also { r -> if (Build.VERSION.SDK_INT >= 28) r.isLooping = true; r.play() }
            }
            runCatching { vibrator(context)?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 600, 400), 0)) }
        } else {
            val tone = runCatching { ToneGenerator(AudioManager.STREAM_ALARM, 100) }.getOrNull().also { toneGen = it }
            val r = object : Runnable {
                override fun run() {
                    tone?.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 700)
                    runCatching { vibrator(context)?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 150, 100, 150, 100, 300), -1)) }
                    handler.postDelayed(this, 1800)
                }
            }
            tick = r; handler.post(r)
        }
    }

    private fun stopSound() {
        tick?.let { handler.removeCallbacks(it) }; tick = null
        runCatching { ringtone?.stop() }; ringtone = null
        runCatching { vib?.cancel() }; vib = null
        runCatching { toneGen?.release() }; toneGen = null
    }
}
