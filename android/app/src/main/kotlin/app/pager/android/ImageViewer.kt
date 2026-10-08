@file:OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)

package app.pager.android

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.OpenInNew
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.produceState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import android.widget.Toast
import kotlinx.coroutines.launch
import java.text.DateFormat
import java.util.Date

/** Full-screen photo viewer: swipe between the chat's photos, pinch or double-tap to zoom, share or save. */
@Composable
fun ImageViewer(images: List<Msg>, startId: String, senderName: (String) -> String, onClose: () -> Unit) {
    val store = LocalStore.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val start = images.indexOfFirst { it.id == startId }.coerceAtLeast(0)
    val pager = rememberPagerState(start) { images.size }
    var zoomed by remember { mutableStateOf(false) }
    var chrome by remember { mutableStateOf(true) }
    val current = images.getOrNull(pager.currentPage)

    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            HorizontalPager(pager, Modifier.fillMaxSize(), userScrollEnabled = !zoomed, key = { images[it].id }) { page ->
                ZoomPage(images[page], onZoomChange = { zoomed = it }, onTap = { chrome = !chrome })
            }
            if (chrome && current != null) {
                Row(Modifier.fillMaxWidth().background(Color(0x66000000)).statusBarsPadding().padding(horizontal = 4.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconBtn(Icons.Rounded.Close, "Close", onClose, tint = Color.White)
                    Column(Modifier.weight(1f).padding(start = 4.dp)) {
                        Text(senderName(current.sender), color = Color.White, style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
                        Text("${pager.currentPage + 1} of ${images.size} · ${DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(current.ts))}", color = Color(0xCCFFFFFF), style = androidx.compose.material3.MaterialTheme.typography.labelMedium)
                    }
                    IconBtn(Icons.Rounded.Share, "Share", { scope.launch { current.mxc?.let { store.media.share(it, current.body.ifEmpty { "image" }, current.mime) } } }, tint = Color.White)
                    IconBtn(Icons.Rounded.Download, "Save to gallery", {
                        scope.launch {
                            val ok = current.mxc?.let { store.media.saveToGallery(it, current.body.ifEmpty { "pager-image.jpg" }, current.mime) } == true
                            Toast.makeText(context, if (ok) "Saved to Pictures/Pager" else "Couldn't save this photo", Toast.LENGTH_SHORT).show()
                        }
                    }, tint = Color.White)
                    IconBtn(Icons.Rounded.OpenInNew, "Open in another app", { scope.launch { current.mxc?.let { store.media.open(it, current.body.ifEmpty { "image" }, current.mime) } } }, tint = Color.White)
                }
            }
        }
    }
}

@Composable
private fun ZoomPage(msg: Msg, onZoomChange: (Boolean) -> Unit, onTap: () -> Unit) {
    val store = LocalStore.current
    val full = rememberMxcImage(msg.mxc, 0)
    val isGif = msg.mime == "image/gif"
    val animated by produceState<java.io.File?>(null, msg.mxc) { value = if (isGif && android.os.Build.VERSION.SDK_INT >= 28 && msg.mxc != null) store.media.fetch(msg.mxc) else null }
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    Box(
        Modifier.fillMaxSize().pointerInput(Unit) {
            detectTapGestures(onTap = { onTap() }, onDoubleTap = { scale = if (scale > 1.2f) 1f else 2.6f; if (scale == 1f) offset = Offset.Zero; onZoomChange(scale > 1f) })
        }.pointerInput(Unit) {
            detectTransformGestures { _, pan, zoom, _ ->
                scale = (scale * zoom).coerceIn(1f, 6f)
                offset = if (scale == 1f) Offset.Zero else offset + pan
                onZoomChange(scale > 1.02f)
            }
        },
        contentAlignment = Alignment.Center,
    ) {
        val mod = Modifier.fillMaxSize().graphicsLayer { scaleX = scale; scaleY = scale; translationX = offset.x; translationY = offset.y }
        when {
            animated != null -> Box(mod) { AnimatedImage(animated!!, fit = true) }
            full != null -> Image(full, msg.body, mod, contentScale = ContentScale.Fit)
            else -> Text("Loading…", color = Color.White)
        }
    }
}
