package app.pager.android

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import kotlinx.coroutines.delay

/**
 * E-ink screens keep a faint ghost of what was there. Two levels of clearing it:
 *  - quick: a brief white flash, when you open or leave a chat, or every few seconds;
 *  - deep: black then white, a full-panel refresh that wipes stubborn ghosting; every few chat changes, every few minutes, when the screen wakes, or on demand.
 */
object ScreenCleanTrigger {
    var page by mutableStateOf("")
    /** Bumped by the "refresh now" buttons in settings. */
    var quickNow by mutableIntStateOf(0)
    var deepNow by mutableIntStateOf(0)
}

@Composable
fun ScreenCleanOverlay(s: AppSettings) {
    var white by remember { mutableStateOf(false) }
    var black by remember { mutableStateOf(false) }
    val quick = remember { mutableIntStateOf(0) }
    val deep = remember { mutableIntStateOf(0) }
    val page = ScreenCleanTrigger.page
    var first by remember { mutableStateOf(true) }
    val deepChats by rememberUpdatedState(s.deepCleanChats)
    val nth = remember { EveryNth { deepChats } }
    val mode = s.screenClean
    val deepMode = s.deepClean
    LaunchedEffect(page) {
        if (first) { first = false; return@LaunchedEffect }
        if (deepMode == "chats" && nth.hit()) deep.intValue++ else if (mode == "chats") quick.intValue++
    }
    LaunchedEffect(mode, s.screenCleanSec) { if (mode != "timed") return@LaunchedEffect; while (true) { delay(s.screenCleanSec.coerceAtLeast(3) * 1000L); quick.intValue++ } }
    LaunchedEffect(deepMode, s.deepCleanMin) { if (deepMode != "timed") return@LaunchedEffect; while (true) { delay(s.deepCleanMin.coerceAtLeast(1) * 60_000L); deep.intValue++ } }
    // When the screen comes back on or the app returns to the front, one deep refresh.
    val owner = LocalLifecycleOwner.current
    val onWake by rememberUpdatedState(s.deepCleanOnWake)
    DisposableEffect(owner) {
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_RESUME && onWake) deep.intValue++ }
        owner.lifecycle.addObserver(obs)
        onDispose { owner.lifecycle.removeObserver(obs) }
    }
    LaunchedEffect(ScreenCleanTrigger.quickNow) { if (ScreenCleanTrigger.quickNow > 0) quick.intValue++ }
    LaunchedEffect(ScreenCleanTrigger.deepNow) { if (ScreenCleanTrigger.deepNow > 0) deep.intValue++ }
    LaunchedEffect(quick.intValue) { if (quick.intValue == 0) return@LaunchedEffect; white = true; delay(90); white = false }
    LaunchedEffect(deep.intValue) {
        if (deep.intValue == 0) return@LaunchedEffect
        for ((isBlack, ms) in deepRefreshSteps(2)) { black = isBlack; white = !isBlack; delay(ms) }
        black = false; white = false
    }
    if (black) Box(Modifier.fillMaxSize().background(Color.Black))
    else if (white) Box(Modifier.fillMaxSize().background(Color.White))
}
