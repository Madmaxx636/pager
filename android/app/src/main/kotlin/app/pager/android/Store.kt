package app.pager.android

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.UUID

data class Session(val baseUrl: String, val token: String, val userId: String)

/** Process-wide state: the signed-in session, all chats, and the sync loop that keeps them current. */
class Store(context: Context) {
    private val prefs = context.getSharedPreferences("pager", Context.MODE_PRIVATE)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val http = Http(prefs.getString("baseUrl", "") ?: "")
    val pager = PagerApi(http)
    val matrix = MatrixApi(http)

    private val _session = MutableStateFlow<Session?>(null)
    val session: StateFlow<Session?> = _session.asStateFlow()
    private val _chats = MutableStateFlow<Map<String, ChatState>>(emptyMap())
    val chats: StateFlow<Map<String, ChatState>> = _chats.asStateFlow()
    private val _synced = MutableStateFlow(false)
    val synced: StateFlow<Boolean> = _synced.asStateFlow()
    private val _incoming = MutableSharedFlow<Incoming>(extraBufferCapacity = 64)
    val incoming: SharedFlow<Incoming> = _incoming

    @Volatile var appInForeground = false
    private var syncJob: Job? = null

    init {
        val base = prefs.getString("baseUrl", null)
        val token = prefs.getString("token", null)
        val user = prefs.getString("userId", null)
        if (base != null && token != null && user != null) begin(Session(base, token, user))
    }

    val savedServer get() = prefs.getString("baseUrl", "") ?: ""

    fun normalizeServer(input: String): String {
        val t = input.trim().trimEnd('/')
        return if (t.startsWith("http://") || t.startsWith("https://")) t else "https://$t"
    }

    suspend fun signIn(server: String, username: String, password: String) {
        http.baseUrl = normalizeServer(server)
        http.token = null
        val (token, userId, _) = matrix.login(username, password)
        prefs.edit().putString("baseUrl", http.baseUrl).putString("token", token).putString("userId", userId).apply()
        begin(Session(http.baseUrl, token, userId))
    }

    private fun begin(s: Session) {
        http.baseUrl = s.baseUrl
        http.token = s.token
        _session.value = s
        syncJob?.cancel()
        syncJob = scope.launch { syncLoop(s) }
    }

    private suspend fun syncLoop(s: Session) {
        var since: String? = null
        var backoff = 1000L
        while (scope.isActive) {
            try {
                val res = matrix.sync(since)
                val initial = since == null
                val r = SyncReducer.apply(_chats.value, res, s.userId, initial)
                _chats.value = r.chats
                r.invites.forEach { id -> scope.launch { runCatching { matrix.join(id) } } }
                r.incoming.forEach { _incoming.tryEmit(it) }
                since = (res["next_batch"] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: since
                _synced.value = true
                backoff = 1000L
            } catch (e: ApiException) {
                if (e.status == 401) { signOutLocal(); return }
                delay(backoff); backoff = (backoff * 2).coerceAtMost(30_000)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                delay(backoff); backoff = (backoff * 2).coerceAtMost(30_000)
            }
        }
    }

    fun send(roomId: String, text: String) {
        val s = _session.value ?: return
        scope.launch {
            val id = runCatching { matrix.sendText(roomId, text, UUID.randomUUID().toString()) }.getOrNull() ?: return@launch
            _chats.update { m ->
                val c = m[roomId] ?: return@update m
                if (c.messages.any { it.id == id }) m
                else m + (roomId to c.copy(messages = c.messages + Msg(id, s.userId, "me", System.currentTimeMillis(), "m.text", text)))
            }
        }
    }

    fun markRead(roomId: String) {
        val c = _chats.value[roomId] ?: return
        val last = c.messages.lastOrNull() ?: return
        if (c.unread == 0) return
        _chats.update { it + (roomId to c.copy(unread = 0)) }
        scope.launch { runCatching { matrix.markRead(roomId, last.id) } }
    }

    fun signOut() {
        scope.launch { runCatching { matrix.logout() }; signOutLocal() }
    }

    private fun signOutLocal() {
        syncJob?.cancel()
        prefs.edit().remove("token").remove("userId").apply()
        http.token = null
        _chats.value = emptyMap()
        _synced.value = false
        _session.value = null
    }
}
