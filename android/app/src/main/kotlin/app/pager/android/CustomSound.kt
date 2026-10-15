package app.pager.android

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaMetadataRetriever
import android.media.MediaPlayer
import android.net.Uri
import java.io.File

/** A sound of your own for alerts: an audio file you pick, kept in the app's private storage only (never sent anywhere), up to a few seconds long. */
object CustomSound {
    const val MAX_BYTES = 3L * 1024 * 1024
    const val MAX_SECONDS = 30

    private fun file(context: Context) = File(context.filesDir, "alert-sound")
    fun exists(context: Context) = file(context).exists()

    /** Why a file can't be used as an alert sound, or null when it can. Pure, so it can be tested. */
    fun problemWith(isAudio: Boolean, bytes: Long, seconds: Double): String? = when {
        !isAudio -> "That isn't a sound file."
        bytes > MAX_BYTES -> "That file is too big (the limit is ${MAX_BYTES / 1024 / 1024} MB). Try a shorter one."
        seconds.isNaN() || seconds <= 0.0 -> "Couldn't read that sound file."
        seconds > MAX_SECONDS -> "That sound is ${Math.round(seconds)} seconds long. Alerts can be up to $MAX_SECONDS seconds."
        else -> null
    }

    /** Copies the chosen file in. Throws with a plain-words reason when it can't be used. */
    fun import(context: Context, uri: Uri) {
        val type = context.contentResolver.getType(uri).orEmpty()
        val size = context.contentResolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: -1L
        val seconds = runCatching { MediaMetadataRetriever().let { r -> try { r.setDataSource(context, uri); (r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toDoubleOrNull() ?: Double.NaN) / 1000.0 } finally { r.release() } } }.getOrDefault(Double.NaN)
        problemWith(type.startsWith("audio/"), size, seconds)?.let { throw IllegalArgumentException(it) }
        context.contentResolver.openInputStream(uri)!!.use { input -> file(context).outputStream().use { input.copyTo(it) } }
    }

    fun remove(context: Context) { file(context).delete() }

    /** Plays it at [volume] (0..1). False when none has been chosen. */
    fun play(context: Context, volume: Float, usage: Int = AudioAttributes.USAGE_NOTIFICATION): Boolean {
        val f = file(context).takeIf { it.exists() } ?: return false
        return runCatching {
            MediaPlayer().apply {
                setAudioAttributes(AudioAttributes.Builder().setUsage(usage).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                setDataSource(f.path); prepare()
                val v = volume.coerceIn(0f, 1f); setVolume(v, v)
                setOnCompletionListener { it.release() }
                start()
            }
        }.isSuccess
    }
}
