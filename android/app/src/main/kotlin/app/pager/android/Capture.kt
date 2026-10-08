package app.pager.android

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.media.MediaRecorder
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import androidx.core.content.ContextCompat
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.File
import kotlin.coroutines.resume

/** Records a voice message. Opus in an Ogg container where the device supports it (WhatsApp/Signal friendly), AAC otherwise. */
class VoiceRecorder(private val context: Context) {
    private var rec: MediaRecorder? = null
    private var file: File? = null
    private var startedAt = 0L

    @Suppress("DEPRECATION")
    fun start(): Boolean {
        cancel()
        val ogg = Build.VERSION.SDK_INT >= 29
        val f = File(context.cacheDir, "voice-${System.currentTimeMillis()}.${if (ogg) "ogg" else "m4a"}")
        val r = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(context) else MediaRecorder()
        return runCatching {
            r.setAudioSource(MediaRecorder.AudioSource.MIC)
            if (ogg) { r.setOutputFormat(MediaRecorder.OutputFormat.OGG); r.setAudioEncoder(MediaRecorder.AudioEncoder.OPUS) }
            else { r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4); r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC) }
            r.setAudioSamplingRate(48000); r.setAudioEncodingBitRate(32000)
            r.setOutputFile(f.path)
            r.prepare(); r.start()
            rec = r; file = f; startedAt = System.currentTimeMillis()
            true
        }.getOrElse { r.release(); false }
    }

    val elapsedMs get() = if (rec == null) 0L else System.currentTimeMillis() - startedAt

    /** Finishes and returns the recording, or null if it was too short or failed. */
    fun stop(): Pair<File, Long>? {
        val r = rec ?: return null
        val f = file ?: return null
        val ms = elapsedMs
        rec = null; file = null
        val ok = runCatching { r.stop() }.isSuccess
        r.release()
        if (!ok || ms < 700) { f.delete(); return null }
        return f to ms
    }

    fun cancel() {
        rec?.let { runCatching { it.stop() }; it.release() }
        file?.delete()
        rec = null; file = null
    }
}

fun hasPermission(context: Context, permission: String) = ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

/** Current position: a fresh fix when possible, otherwise the last known one. */
@SuppressLint("MissingPermission")
suspend fun currentLocation(context: Context): Location? {
    if (!hasPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) && !hasPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)) return null
    val lm = context.getSystemService(LocationManager::class.java)
    val providers = lm.getProviders(true)
    if (Build.VERSION.SDK_INT >= 30) {
        val p = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).firstOrNull { it in providers }
        if (p != null) {
            val fresh = suspendCancellableCoroutine<Location?> { cont ->
                val cancel = android.os.CancellationSignal()
                cont.invokeOnCancellation { cancel.cancel() }
                lm.getCurrentLocation(p, cancel, ContextCompat.getMainExecutor(context)) { cont.resume(it) }
            }
            if (fresh != null) return fresh
        }
    }
    return providers.mapNotNull { lm.getLastKnownLocation(it) }.maxByOrNull { it.time }
}

/** True when media may be fetched automatically under the user's data setting. */
fun mediaAllowed(context: Context, mode: String): Boolean = when (mode) {
    "never" -> false
    "wifi" -> {
        val cm = context.getSystemService(ConnectivityManager::class.java)
        cm.getNetworkCapabilities(cm.activeNetwork)?.let { it.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || it.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) } ?: false
    }
    else -> true
}
