package app.pager.android

import android.graphics.Bitmap
import android.graphics.Color as AColor
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.Checkbox
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.RadioButton
import androidx.compose.runtime.collectAsState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import kotlinx.coroutines.launch

private fun qrBitmap(data: String, px: Int = 480): Bitmap {
    val m = QRCodeWriter().encode(data, BarcodeFormat.QR_CODE, px, px, mapOf(com.google.zxing.EncodeHintType.MARGIN to 1))
    val bmp = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888)
    for (x in 0 until px) for (y in 0 until px) bmp.setPixel(x, y, if (m[x, y]) AColor.BLACK else AColor.WHITE)
    return bmp
}

@Composable
fun AccountsDialog(store: Store, initial: Network? = null, onClose: () -> Unit) {
    var networks by remember { mutableStateOf<List<Network>?>(null) }
    var active by remember { mutableStateOf(initial) }
    var asked by remember { mutableStateOf(false) }
    val job by store.importJob.collectAsState()
    val busy = job?.busy == true
    var error by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    fun refresh() = scope.launch {
        runCatching { store.pager.networks() }.onSuccess { networks = it }.onFailure { error = it.message ?: "Couldn't load accounts" }
    }
    LaunchedEffect(Unit) { refresh() }

    Sheet(onClose) {
        run {
            Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 8.dp)) {
                val net = active
                if (net != null && !asked) {
                    ImportOptions(store, net, onCancel = { if (initial != null) onClose() else active = null }, onStart = { mode ->
                        val base = store.chats.value.values.count { it.network == net.id }
                        store.setImport(ImportJob(net.id, net.name, mode, System.currentTimeMillis(), base))
                        asked = true
                    })
                } else if (net != null) {
                    LoginFlowView(store, net,
                        onCancel = { if (store.importJob.value?.phase == "linking") store.setImport(null); asked = false; if (initial != null) onClose() else active = null },
                        onDone = { asked = false; active = null; refresh(); scope.launch { store.refreshBridges() }; if (initial != null) onClose() })
                } else {
                    Text("Accounts", fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    Text("Connect the apps you use. You can add more than one account per app.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp, bottom = 12.dp))
                    if (busy) ImportProgressCard(store)
                    if (error.isNotEmpty()) Text(error, color = MaterialTheme.colorScheme.error)
                    if (networks == null && error.isEmpty()) CircularProgressIndicator(Modifier.padding(16.dp).size(24.dp))
                    networks?.forEach { n ->
                        val meta = networkMeta(n.id)
                        Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            NetDot(meta, n.id)
                            Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
                                Text(n.name, fontWeight = FontWeight.SemiBold)
                                if (n.unavailable) Text("Unavailable right now", fontSize = 12.sp, color = Color(0xFFF5B85A))
                                n.logins.forEach { l ->
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(l.name, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        TextButton(onClick = { scope.launch { runCatching { store.pager.logout(n.id, l.id) }; refresh() } }) { Text("Disconnect", fontSize = 12.sp) }
                                    }
                                }
                            }
                            Button(enabled = !n.unavailable && !busy, onClick = { active = n }) { Text(if (n.logins.isEmpty()) "Connect" else "Add another") }
                        }
                    }
                    Text(
                        "WhatsApp, Instagram and similar apps don't officially support third-party clients. It works fine for most people, but it's not endorsed by those companies.",
                        fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 12.dp),
                    )
                    TextButton(onClick = onClose, Modifier.align(Alignment.End)) { Text("Close") }
                }
            }
        }
    }
}

@Composable
private fun NetDot(meta: NetworkMeta, id: String) {
    Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(meta.color), contentAlignment = Alignment.Center) {
        val icon = networkIcon(id)
        if (icon != null) Icon(icon, null, Modifier.size(22.dp), tint = Color.White) else Text(meta.glyph, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
    }
}

/** Walks one bridge login: start → (QR / form / wait)* → complete. */
@Composable
private fun LoginFlowView(store: Store, net: Network, onCancel: () -> Unit, onDone: () -> Unit) {
    val meta = networkMeta(net.id)
    var flows by remember { mutableStateOf<List<LoginFlow>?>(null) }
    var step by remember { mutableStateOf<LoginStep?>(null) }
    var error by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val values = remember { mutableStateMapOf<String, String>() }
    val scope = rememberCoroutineScope()
    var cancelled by remember { mutableStateOf(false) }
    DisposableEffect(Unit) { onDispose { cancelled = true } }

    // Blocks server-side until the user acts on their phone, so each wait step re-enters here.
    fun advance(next: LoginStep) {
        if (cancelled) return
        values.clear()
        step = next
        when (next.type) {
            "complete" -> scope.launch { kotlinx.coroutines.delay(900); if (!cancelled) onDone() }
            "display_and_wait" -> scope.launch {
                runCatching { store.pager.step(net.id, next) }.onSuccess { advance(it) }.onFailure { if (!cancelled) error = it.message ?: "Login failed" }
            }
        }
    }

    fun begin(flowId: String) = scope.launch {
        busy = true; error = ""
        runCatching { store.pager.start(net.id, flowId) }.onSuccess { advance(it) }.onFailure { error = it.message ?: "Login failed" }
        busy = false
    }

    LaunchedEffect(Unit) {
        runCatching { store.pager.flows(net.id) }
            .onSuccess { f -> if (f.size == 1) begin(f[0].id) else flows = f }
            .onFailure { error = it.message ?: "Couldn't start" }
    }

    Row(verticalAlignment = Alignment.CenterVertically) {
        NetDot(meta, net.id)
        Text("Connect ${meta.label}", fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 12.dp))
    }
    Spacer(Modifier.height(16.dp))

    val s = step
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    if (s == null) {
        flows?.let { list ->
            Text("How would you like to sign in?", color = muted)
            list.forEach { f -> Button(onClick = { begin(f.id) }, Modifier.fillMaxWidth().padding(top = 8.dp)) { Text(f.name) } }
        }
        if (flows == null && error.isEmpty()) Row(verticalAlignment = Alignment.CenterVertically) {
            CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp); Text("  Starting…", color = muted)
        }
    } else when (s.type) {
        "display_and_wait" -> Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            s.instructions?.let { Text(it, modifier = Modifier.padding(bottom = 12.dp)) }
            if (s.displayType == "qr" && s.displayData != null) {
                val bmp = remember(s.displayData) { qrBitmap(s.displayData).asImageBitmap() }
                Image(bmp, "QR code", Modifier.size(240.dp).clip(RoundedCornerShape(14.dp)).background(Color.White))
            } else if (s.displayData != null) {
                Text(s.displayData, fontFamily = FontFamily.Monospace, fontSize = 26.sp, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surfaceVariant).padding(16.dp))
            }
            Row(Modifier.padding(top = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp); Text("  Waiting for you…", color = muted)
            }
        }
        "user_input" -> Column {
            s.instructions?.let { Text(it, modifier = Modifier.padding(bottom = 8.dp)) }
            s.fields.forEach { f ->
                OutlinedTextField(
                    values[f.id] ?: "", { values[f.id] = it }, label = { Text(f.name) }, singleLine = true,
                    placeholder = f.hint?.let { { Text(it) } },
                    visualTransformation = if (f.secret) PasswordVisualTransformation() else VisualTransformation.None,
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                )
            }
            Button(
                enabled = !busy && s.fields.all { !values[it.id].isNullOrEmpty() },
                modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
                onClick = {
                    scope.launch {
                        busy = true; error = ""
                        runCatching { store.pager.step(net.id, s, values.toMap()) }.onSuccess { advance(it) }.onFailure { error = it.message ?: "Login failed" }
                        busy = false
                    }
                },
            ) { Text(if (busy) "Checking…" else "Continue") }
        }
        "complete" -> Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("✓", fontSize = 40.sp, color = MaterialTheme.colorScheme.primary)
            Text("${meta.label} is connected. Your pages will appear shortly.")
        }
        else -> Text("This network needs a browser sign-in, which Pager doesn't support yet.", color = muted)
    }

    if (error.isNotEmpty()) Text(error, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 10.dp))
    if (s?.type != "complete") TextButton(onClick = onCancel, Modifier.padding(top = 8.dp)) { Text("Cancel") }
}

/** How far back each network can be asked to go when an account is linked. Other networks offer no choice. */
private val REACH = mapOf(
    "whatsapp" to Triple("historyDays", "How far back", listOf("Last month" to 30, "Last 3 months" to 90, "Last 6 months" to 180, "Last year" to 365, "Everything the phone sends" to 36500)),
    "gmessages" to Triple("chatCount", "How many chats", listOf("Latest 25" to 25, "Latest 100" to 100, "Latest 500" to 500, "All of them" to 10000)),
)

/** Asked before linking an account: everything or pick chats afterwards, and how far back where the network allows it. */
@Composable
private fun ImportOptions(store: Store, net: Network, onStart: (String) -> Unit, onCancel: () -> Unit) {
    val meta = networkMeta(net.id)
    val reach = REACH[net.id]
    var mode by remember { mutableStateOf("all") }
    var current by remember { mutableStateOf<Int?>(null) }
    var picked by remember { mutableStateOf<Int?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    LaunchedEffect(net.id) {
        if (reach != null) runCatching { store.pager.bridgeNumbers(net.id) }.onSuccess { rows -> rows.firstOrNull { it.key == reach.first }?.let { current = it.value; picked = it.value } }
    }
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) { NetDot(meta, net.id); Text("Import from ${meta.label}", fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 12.dp)) }
        Row(Modifier.fillMaxWidth().padding(top = 12.dp), verticalAlignment = Alignment.Top) {
            RadioButton(mode == "all", { mode = "all" })
            Column(Modifier.padding(top = 12.dp)) { Text("Import all chats", fontWeight = FontWeight.SemiBold); Text("Everything ${meta.label} offers comes in.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            RadioButton(mode == "choose", { mode = "choose" })
            Column(Modifier.padding(top = 12.dp)) { Text("Let me choose chats", fontWeight = FontWeight.SemiBold); Text("Everything comes in, then you tick the chats to keep. The rest go to the archive; nothing is deleted.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        if (reach != null && current != null) {
            Text(reach.second, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 12.dp))
            reach.third.forEach { (label, v) ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { RadioButton(picked == v, { picked = v }); Text(label) }
            }
            if (picked != current) Text("${meta.label}'s connection restarts for a moment when you continue.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else if (reach == null) Text("${meta.label} doesn't send older messages, so only new ones will show up after linking.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 12.dp))
        else Text("Only an admin can change how far back ${meta.label} imports.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 12.dp))
        if (error.isNotEmpty()) Text(error, color = MaterialTheme.colorScheme.error)
        Text("Only one account can be imported at a time. The next one unlocks when this import has finished.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 12.dp))
        Button(enabled = !busy, onClick = {
            busy = true; error = ""
            scope.launch {
                runCatching { if (reach != null && picked != null && picked != current) store.pager.saveBridgeNumber(net.id, reach.first, picked!!) }
                    .onSuccess { onStart(mode) }.onFailure { error = it.message ?: "Couldn't apply that"; busy = false }
            }
        }, modifier = Modifier.fillMaxWidth()) { Text(if (busy) "Applying…" else "Continue and link") }
        TextButton(onClick = onCancel, Modifier.align(Alignment.End)) { Text("Cancel") }
    }
}

/** The progress of the import in flight, with the chat picker once the chats have arrived. */
@Composable
fun ImportProgressCard(store: Store) {
    val job by store.importJob.collectAsState()
    val chats by store.chats.collectAsState()
    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { while (true) { kotlinx.coroutines.delay(2_000); now = System.currentTimeMillis() } }
    val j = job ?: return
    val mine = chats.values.filter { it.network == j.network && !it.archived }.sortedBy { it.name.lowercase() }
    var keep by remember(j.phase) { mutableStateOf<Set<String>?>(null) }
    val chosen = keep ?: mine.map { it.id }.toSet()
    Surface(Modifier.fillMaxWidth().padding(vertical = 8.dp), shape = RoundedCornerShape(12.dp), tonalElevation = 2.dp) {
        Column(Modifier.padding(14.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(j.name, fontWeight = FontWeight.Bold)
                Text(when (j.phase) { "linking" -> "Waiting for you to finish linking…"; "importing" -> "Importing…"; "choosing" -> "Choose the chats to keep"; else -> "Done" }, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            LinearProgressIndicator(progress = { if (j.phase == "linking" || j.chats == 0) 0.04f else j.fraction(now) }, modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp))
            Text("${j.chats} chats, ${"%,d".format(j.messages)} messages so far", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (j.phase == "choosing") {
                LazyColumn(Modifier.heightIn(max = 320.dp)) {
                    items(mine, key = { it.id }) { c ->
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(c.id in chosen, { on -> keep = if (on) chosen + c.id else chosen - c.id })
                            Text(c.name)
                        }
                    }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = { keep = if (chosen.size == mine.size) emptySet() else mine.map { it.id }.toSet() }) { Text(if (chosen.size == mine.size) "Select none" else "Select all") }
                    Button(onClick = { mine.forEach { if (it.id !in chosen) store.setTag(it.id, "u.archived", true) }; store.setImport(j.copy(phase = "done")) }) { Text("Keep ${chosen.size} chat${if (chosen.size == 1) "" else "s"}") }
                }
            } else if (j.busy) Text("You can add another account once this one finishes.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
            if (j.stuck(now) || j.phase == "done") TextButton(onClick = { store.setImport(null) }) { Text(if (j.phase == "done") "Dismiss" else "Nothing is coming in: stop waiting") }
        }
    }
}
