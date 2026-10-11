package app.pager.android

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive

/**
 * Voice messages as text, made on your own server (it runs the speech recognition; nothing goes anywhere else). The words are kept on this
 * phone so a message is only sent once. Only available when the server has transcription switched on.
 */
class Transcripts(context: Context, private val http: Http, private val media: MediaLoader) {
    private val prefs = context.getSharedPreferences("transcripts", Context.MODE_PRIVATE)
    private val _book = MutableStateFlow(prefs.all.mapNotNull { (k, v) -> (v as? String)?.let { k to it } }.toMap())
    val book: StateFlow<Map<String, String>> = _book.asStateFlow()
    private val _busy = MutableStateFlow(setOf<String>())
    val busy: StateFlow<Set<String>> = _busy.asStateFlow()
    private val _failed = MutableStateFlow(setOf<String>())
    val failed: StateFlow<Set<String>> = _failed.asStateFlow()
    @Volatile private var can: Boolean? = null

    suspend fun available(): Boolean {
        can?.let { return it }
        val v = runCatching { (http.request("GET", "/api/config")["transcribe"] as? JsonPrimitive)?.content == "true" }.getOrNull() ?: return false
        can = v; return v
    }

    suspend fun transcribe(id: String, mxc: String) {
        if (id in _busy.value || id in _book.value) return
        _busy.update { it + id }; _failed.update { it - id }
        try {
            val file = media.fetch(mxc) ?: error("no file")
            val text = http.postFile("/api/transcribe", "application/octet-stream", file)["text"].let { (it as? JsonPrimitive)?.content.orEmpty() }.trim().ifEmpty { "(no speech found)" }
            _book.update { (it + (id to text)).let { m -> if (m.size > 300) m.entries.drop(m.size - 300).associate { e -> e.key to e.value } else m } }
            prefs.edit().clear().apply { _book.value.forEach { (k, v) -> putString(k, v) } }.apply()
        } catch (_: Exception) { _failed.update { it + id } }
        _busy.update { it - id }
    }

    fun forgetAll() { _book.value = emptyMap(); prefs.edit().clear().apply() }
}

/** The words of a voice message, or a button to make them (when your server can). */
@Composable
fun Words(id: String, mxc: String, fg: Color) {
    val store = LocalStore.current
    val s = LocalSettings.current
    val book by store.transcripts.book.collectAsState()
    val busy by store.transcripts.busy.collectAsState()
    val failed by store.transcripts.failed.collectAsState()
    var can by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
    LaunchedEffect(Unit) { can = store.transcripts.available() }
    LaunchedEffect(can, s.autoTranscribe, id) { if (can && s.autoTranscribe && id !in book) store.transcripts.transcribe(id, mxc) }
    val text = book[id]
    when {
        text != null -> Text(text, color = fg, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 6.dp))
        !can -> Unit
        id in busy -> Text("Writing it out…", color = fg.dim(0.6f), style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 6.dp))
        else -> {
            val scope = androidx.compose.runtime.rememberCoroutineScope()
            TextButton(onClick = { scope.launchIn { store.transcripts.transcribe(id, mxc) } }) { Text(if (id in failed) "Couldn't write it out. Try again" else "Write it out", color = fg) }
        }
    }
}

private fun kotlinx.coroutines.CoroutineScope.launchIn(block: suspend () -> Unit) { launch { block() } }
