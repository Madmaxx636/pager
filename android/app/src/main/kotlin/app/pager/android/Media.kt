package app.pager.android

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.LruCache
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File

/** Loads Matrix media with auth, downsampled and cached in memory. Files are cached on disk. */
class MediaLoader(private val context: Context, private val http: Http) {
    private val bitmaps = object : LruCache<String, Bitmap>((Runtime.getRuntime().maxMemory() / 8).toInt().coerceAtLeast(8 shl 20)) {
        override fun sizeOf(key: String, value: Bitmap) = value.byteCount
    }
    private val dir = File(context.cacheDir, "media").apply { mkdirs() }
    private val locks = HashMap<String, Mutex>()

    private fun mxcParts(mxc: String): Pair<String, String>? =
        Regex("^mxc://([^/]+)/(.+)$").find(mxc)?.destructured?.let { it.component1() to it.component2() }

    /** [thumb] > 0 requests a server-side thumbnail of that many pixels (fast and small); 0 loads the original. */
    suspend fun bitmap(mxc: String, thumb: Int): Bitmap? {
        val key = "$mxc|$thumb"
        bitmaps.get(key)?.let { return it }
        val file = fetch(mxc, thumb) ?: return null
        return withContext(Dispatchers.Default) {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(file.path, bounds)
            val target = if (thumb > 0) thumb else 2048
            var sample = 1
            while (bounds.outWidth / (sample * 2) >= target && bounds.outHeight / (sample * 2) >= target) sample *= 2
            BitmapFactory.decodeFile(file.path, BitmapFactory.Options().apply { inSampleSize = sample })
        }?.also { bitmaps.put(key, it) }
    }

    /** Downloads (or reuses) the file on disk. */
    suspend fun fetch(mxc: String, thumb: Int = 0): File? {
        val (server, id) = mxcParts(mxc) ?: return null
        val name = "${server}_$id${if (thumb > 0) "_t$thumb" else ""}".replace(Regex("[^A-Za-z0-9._-]"), "_")
        val file = File(dir, name)
        if (file.exists() && file.length() > 0) return file
        val lock = synchronized(locks) { locks.getOrPut(name) { Mutex() } }
        return lock.withLock {
            if (file.exists() && file.length() > 0) return@withLock file
            runCatching {
                val path = if (thumb > 0) "/_matrix/client/v1/media/thumbnail/$server/$id?width=$thumb&height=$thumb&method=scale"
                else "/_matrix/client/v1/media/download/$server/$id"
                http.getRaw(path).use { res ->
                    if (!res.isSuccessful) return@withLock null
                    withContext(Dispatchers.IO) {
                        val tmp = File(dir, "$name.part")
                        res.body!!.byteStream().use { input -> tmp.outputStream().use { input.copyTo(it) } }
                        tmp.renameTo(file)
                    }
                }
                file
            }.getOrNull()
        }
    }

    /** Downloads the file and hands it to whichever app opens that type. */
    suspend fun open(mxc: String, name: String, mime: String?): Boolean {
        val src = fetch(mxc) ?: return false
        val shared = File(dir, "open").apply { mkdirs() }.let { File(it, name.replace(Regex("[^A-Za-z0-9._ -]"), "_").ifEmpty { "file" }) }
        withContext(Dispatchers.IO) { src.copyTo(shared, overwrite = true) }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", shared)
        val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime ?: "*/*").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        return runCatching { context.startActivity(intent) }.isSuccess
    }

    /** Hands the file to the system share sheet. */
    suspend fun share(mxc: String, name: String, mime: String?): Boolean {
        val src = fetch(mxc) ?: return false
        val shared = File(dir, "open").apply { mkdirs() }.let { File(it, name.replace(Regex("[^A-Za-z0-9._ -]"), "_").ifEmpty { "file" }) }
        withContext(Dispatchers.IO) { src.copyTo(shared, overwrite = true) }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", shared)
        val send = Intent(Intent.ACTION_SEND).setType(mime ?: "*/*").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        return runCatching { context.startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }.isSuccess
    }

    /** Saves a photo into the gallery (Pictures/Pager). Works without extra permission on Android 10+. */
    suspend fun saveToGallery(mxc: String, name: String, mime: String?): Boolean {
        if (android.os.Build.VERSION.SDK_INT < 29) return false
        val src = fetch(mxc) ?: return false
        return withContext(Dispatchers.IO) {
            runCatching {
                val values = android.content.ContentValues().apply {
                    put(android.provider.MediaStore.Images.Media.DISPLAY_NAME, name.ifEmpty { "pager-${System.currentTimeMillis()}.jpg" })
                    put(android.provider.MediaStore.Images.Media.MIME_TYPE, mime ?: "image/jpeg")
                    put(android.provider.MediaStore.Images.Media.RELATIVE_PATH, "Pictures/Pager")
                }
                val uri = context.contentResolver.insert(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)!!
                context.contentResolver.openOutputStream(uri)!!.use { out -> src.inputStream().use { it.copyTo(out) } }
            }.isSuccess
        }
    }

    fun clear() { bitmaps.evictAll(); dir.deleteRecursively(); dir.mkdirs() }
}

data class Picked(val uri: Uri, val name: String, val mime: String, val size: Long, val w: Int?, val h: Int?)

/** Plays one voice message at a time. */
class AudioController(private val media: MediaLoader) {
    private var player: android.media.MediaPlayer? = null
    val playing = kotlinx.coroutines.flow.MutableStateFlow<String?>(null)

    suspend fun toggle(id: String, mxc: String) {
        if (playing.value == id) { stop(); return }
        stop()
        val file = media.fetch(mxc) ?: return
        val p = android.media.MediaPlayer()
        runCatching {
            p.setDataSource(file.path)
            p.setOnCompletionListener { stop() }
            p.prepare(); p.start()
            player = p; playing.value = id
        }.onFailure { p.release() }
    }

    fun stop() {
        runCatching { player?.stop() }; player?.release(); player = null; playing.value = null
    }
}
