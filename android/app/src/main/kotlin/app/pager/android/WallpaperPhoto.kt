package app.pager.android

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import java.io.File

/** A wallpaper photo of your own. It is kept in the app's private storage only and shrunk first, so a big photo doesn't sit in memory. */
object WallpaperPhoto {
    /** Largest side, in pixels, a saved photo is shrunk to. */
    const val MAX = 1920
    private var cached: ImageBitmap? = null

    private fun file(context: Context) = File(context.filesDir, "wallpaper.jpg")
    fun exists(context: Context) = file(context).exists()

    /** The size to shrink to: the same shape, no side longer than [max]. */
    fun fit(w: Int, h: Int, max: Int = MAX): Pair<Int, Int> {
        val k = minOf(1f, max.toFloat() / maxOf(w, h))
        return maxOf(1, Math.round(w * k)) to maxOf(1, Math.round(h * k))
    }

    fun import(context: Context, uri: Uri) {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        require(bounds.outWidth > 0) { "That isn't a picture." }
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX) sample *= 2
        val raw = context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
            ?: throw IllegalArgumentException("Couldn't read that picture.")
        val (w, h) = fit(raw.width, raw.height)
        val scaled = if (w == raw.width) raw else Bitmap.createScaledBitmap(raw, w, h, true)
        file(context).outputStream().use { scaled.compress(Bitmap.CompressFormat.JPEG, 85, it) }
        cached = null
    }

    fun remove(context: Context) { file(context).delete(); cached = null }

    fun load(context: Context): ImageBitmap? {
        cached?.let { return it }
        val f = file(context); if (!f.exists()) return null
        return BitmapFactory.decodeFile(f.path)?.asImageBitmap()?.also { cached = it }
    }
}
