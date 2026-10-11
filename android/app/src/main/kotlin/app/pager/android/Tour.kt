package app.pager.android

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** One bubble of the welcome tour: what Pager says, how the mascot looks while saying it, and an optional button that takes you somewhere. */
data class TourStep(val id: String, val text: String, val mood: MascotMood, val actionLabel: String? = null, val go: String? = null)

object TourSteps {
    const val TYPE = "app.pager.tour"

    /** The tour for this person: administrators also hear about inviting people. Same words as the web and desktop apps. */
    fun forFacts(admin: Boolean, hasKey: Boolean, server: String): List<TourStep> = buildList {
        add(TourStep("hello", "Hi! I'm Pager. I'll show you around. It takes about a minute!", MascotMood.Idle))
        add(TourStep("pages", "Every chat from every app lands here as a Page. One inbox for everything. Beep!", MascotMood.Ring))
        add(TourStep("connect", "First, let's plug in an app. WhatsApp, Signal, Messenger, Google Messages and more are ready to go.", MascotMood.Idle, "Connect an app", "settings/bridges"))
        add(
            if (hasKey) TourStep("secure", "Your messages are locked so only your own devices can read them. Keep your recovery key safe. It's the only way back in on a new phone!", MascotMood.Idle)
            else TourStep("secure", "Your messages are locked so only your own devices can read them. Make a recovery key now, so a lost phone never means lost history!", MascotMood.Idle, "Make my key", "settings/privacy"),
        )
        if (admin) add(TourStep("people", "You're the boss here! Invite your family and friends from Admin. Share the invite code, never your password.", MascotMood.Ring, "Open Admin", "settings/admin"))
        add(TourStep("phone", "Take me with you! On your computer, open ${server.removePrefix("https://").removePrefix("http://")} to get the desktop app and the web app.", MascotMood.Idle))
        add(TourStep("done", "That's everything! Tap Page someone whenever you want to start a chat. I'll be right here!", MascotMood.Ring))
    }
}

/** The mascot's first-start tour, in comic speech bubbles above its head. Shown once per account (this phone remembers, and so does the server). */
@Composable
fun TourGate(onGo: (String) -> Unit, forceOpen: Boolean = false, onClose: () -> Unit = {}) {
    val store = LocalStore.current
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val session by store.session.collectAsState()
    val admin by store.isAdmin.collectAsState()
    val synced by store.synced.collectAsState()
    val enc by store.encryption.collectAsState()
    val keyPrefs = ctx.getSharedPreferences("pager.keysetup", android.content.Context.MODE_PRIVATE)
    val prefs = ctx.getSharedPreferences("pager.tour", android.content.Context.MODE_PRIVATE)
    var open by remember { mutableStateOf(forceOpen) }
    var index by remember { mutableIntStateOf(0) }
    val user = session?.userId.orEmpty()
    // Encryption still starting: the recovery-key screen may be about to appear and comes first.
    val keyDealtWith = KeySetupState.finished >= 0 && (if (enc.ready) enc.backupHere || keyPrefs.getBoolean("done." + enc.deviceId, false) else enc.error != null)

    LaunchedEffect(user, synced, keyDealtWith) {
        if (forceOpen || open || user.isEmpty() || !synced || !keyDealtWith || prefs.getBoolean("done.$user", false)) return@LaunchedEffect
        val done = try { store.matrix.accountData(user, TourSteps.TYPE) != null } catch (_: Exception) { true /* unreachable: stay quiet rather than nag */ }
        if (done) prefs.edit().putBoolean("done.$user", true).apply() else { index = 0; open = true }
    }
    if (!open) return

    val scope = rememberCoroutineScope()
    val steps = TourSteps.forFacts(admin, enc.backupHere, session?.baseUrl.orEmpty())
    val step = steps[index.coerceIn(0, steps.lastIndex)]
    val still = LocalSettings.current.reduceMotion
    var shown by remember(step.id) { mutableIntStateOf(if (still) step.text.length else 0) }
    LaunchedEffect(step.id) { while (shown < step.text.length) { delay(22); shown++ } }
    val typing = shown < step.text.length

    fun finish(go: String? = null) {
        open = false
        if (!forceOpen && user.isNotEmpty()) {
            prefs.edit().putBoolean("done.$user", true).apply()
            scope.launch { runCatching { store.matrix.putAccountData(user, TourSteps.TYPE, buildJsonObject { put("done", true); put("at", System.currentTimeMillis()) }) } }
        }
        onClose()
        if (go != null) onGo(go)
    }

    val ink = Color(0xFF0A0B0C)
    // A short screen (a small phone, or a landscape one) gets a smaller mascot and tighter bubble, and the whole thing scrolls if it must.
    val compact = androidx.compose.ui.platform.LocalConfiguration.current.screenHeightDp < 600
    Dialog(onDismissRequest = { finish() }, properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnClickOutside = false)) {
        Box(Modifier.fillMaxSize().background(Color(0xCC0A0C10)).padding(16.dp), contentAlignment = Alignment.Center) {
            Column(Modifier.widthIn(max = 420.dp).fillMaxWidth().verticalScroll(androidx.compose.foundation.rememberScrollState()), horizontalAlignment = Alignment.CenterHorizontally) {
                // The bubble: one outline with the tail built in, an offset black shadow behind it like a comic panel.
                Column(
                    Modifier.fillMaxWidth().drawBehind { drawBubble(ink) }.clickable(enabled = typing) { shown = step.text.length }.padding(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 14.dp),
                ) {
                    Text(
                        step.text.take(shown), color = ink, fontSize = 17.sp, lineHeight = 23.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.SansSerif,
                        modifier = Modifier.fillMaxWidth().height(if (compact) 80.dp else 96.dp),
                    )
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.End)) {
                        if (step.actionLabel != null && !typing) ComicButton(step.actionLabel, Color.White, ink) { finish(step.go) }
                        ComicButton(if (typing) "Skip" else if (index >= steps.lastIndex) "Let's go!" else "Next", MaterialThemeAccent(), Color.White) { if (typing) shown = step.text.length else if (index >= steps.lastIndex) finish() else index++ }
                    }
                }
                Spacer(Modifier.height(if (compact) 30.dp else 36.dp))
                PagerMascot(if (compact) 96.dp else 150.dp, mood = step.mood)
                Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    steps.forEachIndexed { n, _ -> Box(Modifier.size(9.dp).background(if (n == index) Color.White else if (n < index) Color(0xB3FFFFFF) else Color(0x59FFFFFF), androidx.compose.foundation.shape.CircleShape)) }
                }
                Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (index > 0) TextButton(onClick = { index-- }) { Text("Back", color = Color.White) }
                    TextButton(onClick = { finish() }) { Text("Skip tour", color = Color.White) }
                }
            }
        }
    }
}

@Composable private fun MaterialThemeAccent() = androidx.compose.material3.MaterialTheme.colorScheme.primary

@Composable
private fun ComicButton(label: String, fill: Color, text: Color, onClick: () -> Unit) {
    val ink = Color(0xFF0A0B0C)
    Box(
        Modifier.dpadFocus(RoundedCornerShape(14.dp)).clickable(onClick = onClick)
            .drawBehind { drawRoundRect(ink, Offset(3.dp.toPx(), 3.dp.toPx()), size, androidx.compose.ui.geometry.CornerRadius(14.dp.toPx())) }
            .background(fill, RoundedCornerShape(14.dp)).border(BorderStroke(3.dp, ink), RoundedCornerShape(14.dp)).padding(horizontal = 16.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) { Text(label, color = text, fontWeight = FontWeight.Bold, fontSize = 15.sp) }
}

/** White speech bubble with a thick outline, a tail under it pointing down at the mascot, and a hard offset shadow. */
private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawBubble(ink: Color) {
    val r = 30.dp.toPx(); val small = 10.dp.toPx(); val stroke = 4.dp.toPx(); val tail = 30.dp.toPx()
    val w = size.width; val h = size.height; val tx = w * 0.56f; val tw = 24.dp.toPx()
    fun outline(dx: Float, dy: Float) = Path().apply {
        moveTo(r + dx, 0f + dy)
        lineTo(w - r + dx, 0f + dy); arcTo(Rect(w - 2 * r + dx, dy, w + dx, 2 * r + dy), -90f, 90f, false)
        lineTo(w + dx, h - r + dy); arcTo(Rect(w - 2 * r + dx, h - 2 * r + dy, w + dx, h + dy), 0f, 90f, false)
        lineTo(tx + tw + dx, h + dy); lineTo(tx + tw * 0.35f + dx, h + tail + dy); lineTo(tx + dx, h + dy)
        lineTo(small + dx, h + dy); arcTo(Rect(dx, h - 2 * small + dy, 2 * small + dx, h + dy), 90f, 90f, false)
        lineTo(dx, r + dy); arcTo(Rect(dx, dy, 2 * r + dx, 2 * r + dy), 180f, 90f, false)
        close()
    }
    drawPath(outline(7.dp.toPx(), 7.dp.toPx()), ink)
    drawPath(outline(0f, 0f), Color.White)
    drawPath(outline(0f, 0f), ink, style = Stroke(stroke, join = StrokeJoin.Round))
}
