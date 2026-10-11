package app.pager.android

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import kotlinx.coroutines.delay

/** E-ink screens keep a faint ghost of what was there. A brief white flash clears it: when you open or leave a chat, or every few seconds. */
object ScreenCleanTrigger { var page by mutableStateOf("") }

@Composable
fun ScreenCleanOverlay(mode: String, everySec: Int) {
    var on by androidx.compose.runtime.remember { mutableStateOf(false) }
    val tick = androidx.compose.runtime.remember { mutableIntStateOf(0) }
    val page = ScreenCleanTrigger.page
    var first by androidx.compose.runtime.remember { mutableStateOf(true) }
    LaunchedEffect(page) { if (first) { first = false; return@LaunchedEffect }; if (mode == "chats") tick.intValue++ }
    LaunchedEffect(mode, everySec) { if (mode != "timed") return@LaunchedEffect; while (true) { delay(everySec.coerceAtLeast(3) * 1000L); tick.intValue++ } }
    LaunchedEffect(tick.intValue) { if (tick.intValue == 0) return@LaunchedEffect; on = true; delay(90); on = false }
    if (on) Box(Modifier.fillMaxSize().background(Color.White))
}
