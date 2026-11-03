package app.pager.android

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

private fun ago(t: Double): String {
    val s = (System.currentTimeMillis() / 1000.0 - t).coerceAtLeast(0.0)
    return when { s < 90 -> "just now"; s < 5400 -> "${(s / 60).toInt()} min ago"; s < 129600 -> "${(s / 3600).toInt()} h ago"; else -> "${(s / 86400).toInt()} days ago" }
}

/** Admin > Logs: what went wrong on the server, live. Errors, crashes and things needing attention, with the lines around them; warnings are counted and hidden. */
@Composable
fun AdminLogsTab(store: Store, setErr: (String) -> Unit) {
    var level by remember { mutableStateOf("important") }
    var data by remember { mutableStateOf<LogsAnswer?>(null) }
    var open by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var refresh by remember { mutableStateOf(0) }
    val scope = rememberCoroutineScope()
    val clip = LocalClipboardManager.current
    // Live: ask every few seconds while this page is on screen (the answer is tiny when nothing has changed).
    LaunchedEffect(level, refresh) {
        var since = 0.0
        while (isActive) {
            runCatching { store.pager.adminLogs(level, since) }.onSuccess { if (!it.unchanged) { since = it.updated; data = it } }.onFailure { setErr(it.message ?: "Couldn't load the log") }
            delay(3000)
        }
    }
    fun copy(text: String) { clip.setText(AnnotatedString(text)); note = "Copied"; scope.launch { delay(1500); note = "" } }
    fun dismiss(fps: List<String>?) = scope.launch { runCatching { store.pager.adminAckLogs(fps) }.onFailure { setErr(it.message ?: "Failed") }; refresh++ }
    val list = data?.incidents.orEmpty()
    val c = data?.counts.orEmpty()
    val muted = MaterialTheme.colorScheme.onSurfaceVariant

    if (data?.available == false) Text("The log watcher isn't running. Run this once on the server: cd ~/pager/server && ./scripts/logwatch.sh --install", Modifier.padding(horizontal = 20.dp, vertical = 8.dp), color = MaterialTheme.colorScheme.error)
    SettingsGroup("Server log", footer = "Only errors, crashes and things needing your attention are shown. Warnings are counted and hidden. Tap one to see the lines around it.") {
        ChoiceRow("Show", listOf("important" to "Errors, crashes and attention", "errors" to "Errors and crashes only", "all" to "Everything, warnings too"), level) { level = it; data = null }
        if (data != null) {
            Text("${c["crash"] ?: 0} crashes · ${c["error"] ?: 0} errors · ${c["attention"] ?: 0} needing attention · ${c["warning"] ?: 0} warnings (hidden)", Modifier.padding(horizontal = 16.dp, vertical = 8.dp), style = MaterialTheme.typography.bodyMedium, color = muted)
            Row(Modifier.padding(horizontal = 8.dp)) {
                TextButton(enabled = list.isNotEmpty(), onClick = { copy(list.joinToString("\n\n--------\n\n") { incidentText(it) }) }) { Text(note.ifEmpty { "Copy all" }) }
                TextButton(enabled = list.isNotEmpty(), onClick = { dismiss(null) }) { Text("Dismiss all") }
            }
            if (list.isEmpty() && data?.available == true) Text("Nothing to show. No errors or crashes. This page updates by itself.", Modifier.padding(16.dp), color = muted)
        } else Text("Loading…", Modifier.padding(16.dp), color = muted)
    }
    list.forEach { i ->
        val dot = when (i.severity) { "crash" -> Color(0xFFDC2626); "error" -> Color(0xFFF97316); "attention" -> Color(0xFFEAB308); else -> Color(0xFF9CA3AF) }
        Column(Modifier.fillMaxWidth().clickable { open = if (open == i.fp) "" else i.fp }.padding(horizontal = 20.dp, vertical = 10.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.padding(top = 6.dp).size(10.dp).clip(CircleShape).background(dot))
                Column(Modifier.weight(1f)) {
                    Text(i.message, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                    Text("${when (i.severity) { "crash" -> "Crash"; "error" -> "Error"; "attention" -> "Needs attention"; else -> "Warning" }} · ${i.service} · ${if (i.count > 1) "${i.count} times · " else ""}${ago(i.last)}", style = MaterialTheme.typography.labelMedium, color = muted)
                }
            }
            if (open == i.fp) {
                Column(Modifier.padding(top = 8.dp)) {
                    if (i.before.isNotEmpty()) Text(i.before.joinToString("\n"), fontFamily = FontFamily.Monospace, fontSize = 11.sp, lineHeight = 15.sp, color = muted)
                    Text(i.message, fontFamily = FontFamily.Monospace, fontSize = 11.sp, lineHeight = 15.sp, fontWeight = FontWeight.Bold, color = dot)
                    if (i.after.isNotEmpty()) Text(i.after.joinToString("\n"), fontFamily = FontFamily.Monospace, fontSize = 11.sp, lineHeight = 15.sp, color = muted)
                    Row { TextButton(onClick = { copy(incidentText(i)) }) { Text("Copy") }; TextButton(onClick = { dismiss(listOf(i.fp)) }) { Text("Dismiss") } }
                }
            }
        }
    }
}
