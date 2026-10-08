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
    var error by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    fun refresh() = scope.launch {
        runCatching { store.pager.networks() }.onSuccess { networks = it }.onFailure { error = it.message ?: "Couldn't load accounts" }
    }
    LaunchedEffect(Unit) { refresh() }

    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxWidth().padding(16.dp), shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surface) {
            Column(Modifier.verticalScroll(rememberScrollState()).padding(24.dp)) {
                val net = active
                if (net != null) {
                    LoginFlowView(store, net, onCancel = { if (initial != null) onClose() else active = null }, onDone = { active = null; refresh(); scope.launch { store.refreshBridges() }; if (initial != null) onClose() })
                } else {
                    Text("Accounts", fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    Text("Connect the apps you use. You can add more than one account per app.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp, bottom = 12.dp))
                    if (error.isNotEmpty()) Text(error, color = MaterialTheme.colorScheme.error)
                    if (networks == null && error.isEmpty()) CircularProgressIndicator(Modifier.padding(16.dp).size(24.dp))
                    networks?.forEach { n ->
                        val meta = networkMeta(n.id)
                        Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            NetDot(meta)
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
                            Button(enabled = !n.unavailable, onClick = { active = n }) { Text(if (n.logins.isEmpty()) "Connect" else "Add another") }
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
private fun NetDot(meta: NetworkMeta) {
    Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(meta.color), contentAlignment = Alignment.Center) {
        Text(meta.glyph, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
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
        NetDot(meta)
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
            Text("${meta.label} is connected. Your chats will appear shortly.")
        }
        else -> Text("This network needs a browser sign-in, which Pager doesn't support yet.", color = muted)
    }

    if (error.isNotEmpty()) Text(error, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 10.dp))
    if (s?.type != "complete") TextButton(onClick = onCancel, Modifier.padding(top = 8.dp)) { Text("Cancel") }
}
