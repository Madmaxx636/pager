package app.pager.android

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.builtins.nullable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import java.io.File
import java.util.UUID

data class Session(val baseUrl: String, val token: String, val userId: String)

@Serializable
private data class Cache(val userId: String, val since: String?, val chats: Map<String, ChatState>)

@Serializable
data class Star(val roomId: String, val eventId: String, val chat: String, val sender: String, val text: String, val ts: Long)

@Serializable
data class Scheduled(val delayId: String, val roomId: String, val chat: String, val text: String, val whenMs: Long)

/** Process-wide state: the signed-in session, all chats, and the sync loop that keeps them current. */
class Store(private val context: Context) {
    private val prefs = context.getSharedPreferences("pager", Context.MODE_PRIVATE)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val http = Http(prefs.getString("baseUrl", "") ?: "")
    val pager = PagerApi(http)
    val matrix = MatrixApi(http)
    val media = MediaLoader(context, http)
    val audio = AudioController(media)
    val settings = SettingsStore(context)
    val reminders = Reminders(context)
    private val cacheFile = File(context.filesDir, "chats.json")
    private val cacheSerializer = Cache.serializer()

    private val _session = MutableStateFlow<Session?>(null)
    val session: StateFlow<Session?> = _session.asStateFlow()
    private val _chats = MutableStateFlow<Map<String, ChatState>>(emptyMap())
    val chats: StateFlow<Map<String, ChatState>> = _chats.asStateFlow()
    private val _synced = MutableStateFlow(false)
    val synced: StateFlow<Boolean> = _synced.asStateFlow()
    private val _muted = MutableStateFlow<Set<String>>(emptySet())
    val muted: StateFlow<Set<String>> = _muted.asStateFlow()
    private val _incoming = MutableSharedFlow<Incoming>(extraBufferCapacity = 64)
    val incoming: SharedFlow<Incoming> = _incoming

    // Small things kept on the device.
    private val _drafts = MutableStateFlow(readJson("drafts", MapSerializer(String.serializer(), String.serializer()), emptyMap()))
    val drafts: StateFlow<Map<String, String>> = _drafts.asStateFlow()
    private val _stars = MutableStateFlow(readJson("stars", ListSerializer(Star.serializer()), emptyList()))
    val stars: StateFlow<List<Star>> = _stars.asStateFlow()
    private val _scheduled = MutableStateFlow(readJson("scheduled", ListSerializer(Scheduled.serializer()), emptyList()))
    val scheduled: StateFlow<List<Scheduled>> = _scheduled.asStateFlow()
    private val _userStickers = MutableStateFlow(readJson("userStickers", StickerPack.serializer().nullable, null))
    val userStickers: StateFlow<StickerPack?> = _userStickers.asStateFlow()
    val gifs = GifClient(http.client)
    private val muteUntil = MutableStateFlow(readJson("muteUntil", MapSerializer(String.serializer(), Long.serializer()), emptyMap()))
    private val _bridges = MutableStateFlow<List<Network>>(emptyList())
    val bridges: StateFlow<List<Network>> = _bridges.asStateFlow()

    @Volatile var appInForeground = false
    private var syncJob: Job? = null
    private var since: String? = null
    private val loadingOlder = HashSet<String>()
    private val previews = HashMap<String, LinkPreview?>()
    private var lastTyping = 0L

    private fun <T> readJson(key: String, ser: kotlinx.serialization.KSerializer<T>, default: T): T =
        runCatching { json.decodeFromString(ser, prefs.getString("local.$key", null) ?: return default) }.getOrDefault(default)

    private fun <T> writeJson(key: String, ser: kotlinx.serialization.KSerializer<T>, value: T) {
        prefs.edit().putString("local.$key", json.encodeToString(ser, value)).apply()
    }

    /** The inbox list, computed off the main thread whenever chats or settings change. */
    val inbox: StateFlow<List<ChatSummary>> = combine(_chats, _muted, _session, _drafts, settings.state) { chats, muted, s, drafts, st ->
        val me = s?.userId ?: ""
        chats.values.filter { !it.isBotRoom(me) && it.network !in st.hiddenNetworks }.map {
            val last = it.messages.lastOrNull()
            ChatSummary(
                it.id, SyncReducer.displayName(it, me), it.network, it.avatarMxc, it.preview, it.lastTs, it.unread,
                it.markedUnread, it.pinned, it.archived, it.id in muted, it.isGroup, drafts[it.id]?.takeIf { d -> d.isNotBlank() },
                lowPriority = it.lowPriority, labels = it.labels, pinOrder = it.pinOrder ?: Double.MAX_VALUE,
                unanswered = last != null && last.sender != me, lastFromMe = last?.sender == me, typing = it.typing.isNotEmpty(),
            )
        }.sortedWith(
            compareByDescending<ChatSummary> { it.pinned }.thenBy { if (it.pinned) it.pinOrder else 0.0 }
                .thenByDescending { st.sortUnreadFirst && (it.unread > 0 || it.markedUnread) }.thenByDescending { it.ts },
        )
    }.flowOn(Dispatchers.Default).stateIn(scope, SharingStarted.Eagerly, emptyList())

    /** Every label (custom folder) that any chat carries. */
    val labels: StateFlow<List<String>> = _chats.map { all -> all.values.flatMap { it.labels }.distinct().sorted() }
        .distinctUntilChanged().flowOn(Dispatchers.Default).stateIn(scope, SharingStarted.Eagerly, emptyList())

    fun chat(roomId: String): Flow<ChatState?> = _chats.map { it[roomId] }.distinctUntilChanged()
    fun chatNow(roomId: String): ChatState? = _chats.value[roomId]
    val me get() = _session.value?.userId ?: ""

    init {
        val base = prefs.getString("baseUrl", null)
        val token = prefs.getString("token", null)
        val user = prefs.getString("userId", null)
        if (base != null && token != null && user != null) begin(Session(base, token, user))
        scope.launch { persistLoop() }
        scope.launch { bridgeLoop() }
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
        restoreIdentity()
        loadCache(s.userId)
        _session.value = s
        syncJob?.cancel()
        syncJob = scope.launch { syncLoop(s) }
        scope.launch { refreshBridges() }
    }

    // --- Cache -------------------------------------------------------------------

    private fun loadCache(userId: String) {
        runCatching {
            if (!cacheFile.exists()) return
            val c = json.decodeFromString(cacheSerializer, cacheFile.readText())
            if (c.userId != userId) return
            // Caches from before room types were tracked can't tell DMs from groups: resync from scratch.
            if (c.chats.values.any { it.network != "matrix" && it.roomType == null }) { cacheFile.delete(); return }
            _chats.value = c.chats
            since = c.since
            _synced.value = true
        }.onFailure { cacheFile.delete() }
    }

    @OptIn(FlowPreview::class)
    private suspend fun persistLoop() {
        _chats.debounce(3000).collect { chats ->
            val me = _session.value?.userId ?: return@collect
            withContext(Dispatchers.IO) {
                runCatching {
                    // Keep the file small: recent messages only, nothing still in flight.
                    val trimmed = chats.mapValues { (_, c) ->
                        val sent = c.messages.filter { it.status == STATUS_SENT }
                        if (sent.size <= 120) c.copy(messages = sent) else c.copy(messages = sent.takeLast(60), prevBatch = null)
                    }
                    cacheFile.writeText(json.encodeToString(cacheSerializer, Cache(me, since, trimmed)))
                }
            }
        }
    }

    // --- Sync --------------------------------------------------------------------

    private suspend fun syncLoop(s: Session) {
        var backoff = 1000L
        while (scope.isActive) {
            try {
                val res = matrix.sync(since)
                val initial = since == null
                val r = SyncReducer.apply(_chats.value, res, s.userId, initial)
                _chats.value = r.chats
                r.muted?.let { _muted.value = it }
                r.userStickers?.let { _userStickers.value = it; writeJson("userStickers", StickerPack.serializer().nullable, it) }
                r.invites.forEach { id -> scope.launch { runCatching { matrix.join(id) } } }
                val muted = _muted.value
                val st = settings.value
                // Beeper-style: muted and low-priority chats stay quiet except for @mentions and replies to you.
                r.incoming.filter { m ->
                    val c = r.chats[m.roomId]
                    val quiet = m.roomId in muted || c?.lowPriority == true
                    val direct = m.mentioned || m.replyToMe
                    (!quiet || direct) && when (st.notifScope) {
                        "dm_mentions" -> !m.isGroup || direct
                        "favorites" -> c?.pinned == true || direct
                        else -> true
                    }
                }.forEach { _incoming.tryEmit(it) }
                if (settings.value.unarchiveOnMessage) {
                    r.incoming.map { it.roomId }.distinct().filter { it !in muted && r.chats[it]?.archived == true }.forEach { setTag(it, "u.archived", false) }
                }
                expireMutes()
                since = (res["next_batch"] as? JsonPrimitive)?.content ?: since
                _synced.value = true
                backoff = 1000L
            } catch (e: ApiException) {
                if (e.status == 401) { signOutLocal(); return }
                if (e.status == 400 && since != null) { since = null; _chats.value = emptyMap(); continue } // stale cache token
                delay(backoff); backoff = (backoff * 2).coerceAtMost(30_000)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                delay(backoff); backoff = (backoff * 2).coerceAtMost(30_000)
            }
        }
    }

    // --- Messaging ---------------------------------------------------------------

    private fun update(roomId: String, f: (ChatState) -> ChatState) {
        _chats.update { m -> m[roomId]?.let { m + (roomId to f(it)) } ?: m }
    }

    private fun addLocal(roomId: String, m: Msg) = update(roomId) { it.copy(messages = it.messages + m) }
    private fun setStatus(roomId: String, id: String, status: Int, newId: String? = null) = update(roomId) { c ->
        // If sync already delivered the real event it replaced the local echo, and this finds nothing.
        c.copy(messages = c.messages.map { if (it.id == id) it.copy(status = status, id = newId ?: it.id) else it })
    }

    private fun textContent(text: String, replyTo: String?, mentions: List<String>, html: String? = null) = buildJsonObject {
        put("msgtype", "m.text"); put("body", text)
        if (html != null) { put("format", "org.matrix.html"); put("formatted_body", html) }
        if (replyTo != null) putJsonObject("m.relates_to") { putJsonObject("m.in_reply_to") { put("event_id", replyTo) } }
        if (mentions.isNotEmpty()) putJsonObject("m.mentions") { put("user_ids", JsonArray(mentions.map { JsonPrimitive(it) })) }
    }

    fun send(roomId: String, text: String, replyTo: String? = null, mentions: List<String> = emptyList()) {
        val me = _session.value?.userId ?: return
        val txn = UUID.randomUUID().toString()
        val localId = "local-$txn"
        val html = if (settings.value.markdown) Format.markdownToHtml(text) else null
        addLocal(roomId, Msg(localId, me, System.currentTimeMillis(), "m.text", text, replyTo = replyTo, txn = txn, status = STATUS_SENDING, mentions = mentions, html = html))
        setDraft(roomId, "")
        scope.launch {
            runCatching { matrix.send(roomId, "m.room.message", txn, textContent(text, replyTo, mentions, html)) }
                .onSuccess { setStatus(roomId, localId, STATUS_SENT, it) }
                .onFailure { setStatus(roomId, localId, STATUS_FAILED) }
        }
    }

    fun retry(roomId: String, msg: Msg) {
        update(roomId) { c -> c.copy(messages = c.messages.filter { it.id != msg.id }) }
        send(roomId, msg.body, msg.replyTo, msg.mentions)
    }

    fun discard(roomId: String, msg: Msg) = update(roomId) { c -> c.copy(messages = c.messages.filter { it.id != msg.id }) }

    fun edit(roomId: String, eventId: String, newText: String) {
        update(roomId) { c -> c.copy(messages = c.messages.map { if (it.id == eventId) it.copy(body = newText, edited = true) else it }) }
        scope.launch {
            runCatching {
                matrix.send(roomId, "m.room.message", UUID.randomUUID().toString(), buildJsonObject {
                    put("msgtype", "m.text"); put("body", "* $newText")
                    putJsonObject("m.new_content") { put("msgtype", "m.text"); put("body", newText) }
                    putJsonObject("m.relates_to") { put("rel_type", "m.replace"); put("event_id", eventId) }
                })
            }
        }
    }

    fun delete(roomId: String, eventId: String) {
        update(roomId) { c -> c.copy(messages = c.messages.filter { it.id != eventId }) }
        _stars.update { l -> l.filterNot { it.eventId == eventId } }.also { writeJson("stars", ListSerializer(Star.serializer()), _stars.value) }
        scope.launch { runCatching { matrix.redact(roomId, eventId, UUID.randomUUID().toString()) } }
    }

    /** Adds your reaction, or removes it if you already used that emoji. */
    fun react(roomId: String, eventId: String, key: String) {
        val me = _session.value?.userId ?: return
        val chat = _chats.value[roomId] ?: return
        rememberEmoji(key)
        val existing = chat.reactionRefs.entries.firstOrNull { it.value.target == eventId && it.value.key == key && it.value.sender == me }
        if (existing != null) {
            scope.launch { runCatching { matrix.redact(roomId, existing.key, UUID.randomUUID().toString()) } }
            update(roomId) { c ->
                c.copy(
                    reactionRefs = c.reactionRefs - existing.key,
                    reactions = c.reactions.mapValues { (t, byKey) -> if (t == eventId) byKey.mapValues { (k, v) -> if (k == key) v - me else v }.filterValues { it.isNotEmpty() } else byKey },
                )
            }
        } else {
            val localRef = "local-react-${UUID.randomUUID()}"
            update(roomId) { c ->
                val byKey = c.reactions[eventId].orEmpty()
                c.copy(reactions = c.reactions + (eventId to (byKey + (key to (byKey[key].orEmpty() + me)))), reactionRefs = c.reactionRefs + (localRef to ReactionRef(eventId, key, me)))
            }
            scope.launch {
                runCatching {
                    val id = matrix.send(roomId, "m.reaction", UUID.randomUUID().toString(), buildJsonObject {
                        putJsonObject("m.relates_to") { put("rel_type", "m.annotation"); put("event_id", eventId); put("key", key) }
                    })
                    update(roomId) { c -> c.copy(reactionRefs = c.reactionRefs - localRef + (id to ReactionRef(eventId, key, me))) }
                }
            }
        }
    }

    private fun rememberEmoji(e: String) = settings.update { copy(recentEmoji = (listOf(e) + recentEmoji.filter { it != e }).take(24)) }

    fun forward(msg: Msg, toRoom: String) {
        val me = _session.value?.userId ?: return
        val txn = UUID.randomUUID().toString()
        val localId = "local-$txn"
        addLocal(toRoom, msg.copy(id = localId, sender = me, ts = System.currentTimeMillis(), txn = txn, status = STATUS_SENDING, replyTo = null, edited = false))
        scope.launch {
            runCatching {
                matrix.send(toRoom, "m.room.message", txn, buildJsonObject {
                    put("msgtype", msg.type); put("body", msg.body)
                    msg.mxc?.let { put("url", it) }
                    msg.geo?.let { put("geo_uri", it) }
                    if (msg.mime != null || msg.size != null || msg.w != null) putJsonObject("info") {
                        msg.mime?.let { put("mimetype", it) }; msg.size?.let { put("size", it) }; msg.w?.let { put("w", it) }; msg.h?.let { put("h", it) }
                    }
                })
            }.onSuccess { setStatus(toRoom, localId, STATUS_SENT, it) }.onFailure { setStatus(toRoom, localId, STATUS_FAILED) }
        }
    }

    // --- Typing, read state ------------------------------------------------------

    fun typing(roomId: String, on: Boolean) {
        if (!settings.value.sendTyping) return
        val now = System.currentTimeMillis()
        if (on && now - lastTyping < 4000) return
        lastTyping = if (on) now else 0L
        val me = _session.value?.userId ?: return
        scope.launch { runCatching { matrix.typing(me, roomId, on) } }
    }

    fun markRead(roomId: String) {
        val c = _chats.value[roomId] ?: return
        val last = c.messages.lastOrNull { it.status == STATUS_SENT } ?: return
        val me = _session.value?.userId ?: return
        if (c.unread == 0 && !c.markedUnread) return
        update(roomId) { it.copy(unread = 0, markedUnread = false) }
        Notifier.clear(context, roomId)
        val private = !settings.value.sendReadReceipts
        scope.launch {
            runCatching { matrix.markRead(roomId, last.id, private) }
            if (c.markedUnread) runCatching { matrix.setMarkedUnread(me, roomId, false) }
        }
    }

    fun markUnread(roomId: String, unread: Boolean) {
        val me = _session.value?.userId ?: return
        update(roomId) { it.copy(markedUnread = unread) }
        scope.launch { runCatching { matrix.setMarkedUnread(me, roomId, unread) } }
    }

    fun markAllRead() { _chats.value.values.filter { it.unread > 0 || it.markedUnread }.forEach { markRead(it.id) } }

    // --- Media -------------------------------------------------------------------

    fun describe(uri: Uri): Picked {
        val cr = context.contentResolver
        var name = "file"; var size = 0L
        cr.query(uri, null, null, null, null)?.use { c ->
            if (c.moveToFirst()) {
                c.getColumnIndex(OpenableColumns.DISPLAY_NAME).takeIf { it >= 0 }?.let { name = c.getString(it) ?: name }
                c.getColumnIndex(OpenableColumns.SIZE).takeIf { it >= 0 }?.let { size = c.getLong(it) }
            }
        }
        val mime = cr.getType(uri) ?: "application/octet-stream"
        var w: Int? = null; var h: Int? = null
        if (mime.startsWith("image/")) runCatching {
            val o = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
            cr.openInputStream(uri)?.use { android.graphics.BitmapFactory.decodeStream(it, null, o) }
            w = o.outWidth.takeIf { it > 0 }; h = o.outHeight.takeIf { it > 0 }
        }
        return Picked(uri, name, mime, size, w, h)
    }

    fun sendFile(roomId: String, uri: Uri) {
        val me = _session.value?.userId ?: return
        val p = describe(uri)
        // "High" quality shrinks big photos (2048px, JPEG) before upload; GIFs, WebP and other files are never touched.
        if (settings.value.imageQuality == "high" && (p.mime == "image/jpeg" || p.mime == "image/png")) {
            scope.launch {
                val shrunk = runCatching { shrink(uri) }.getOrNull()
                if (shrunk != null) sendBytes(roomId, shrunk.first, p.name.substringBeforeLast('.') + ".jpg", "image/jpeg", "m.image", shrunk.second, shrunk.third)
                else sendOriginal(roomId, uri, p)
            }
            return
        }
        sendOriginal(roomId, uri, p)
    }

    private fun shrink(uri: Uri): Triple<ByteArray, Int, Int> {
        val opts = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri)!!.use { android.graphics.BitmapFactory.decodeStream(it, null, opts) }
        var sample = 1
        while (opts.outWidth / (sample * 2) >= 2048 || opts.outHeight / (sample * 2) >= 2048) sample *= 2
        val bmp = context.contentResolver.openInputStream(uri)!!.use { android.graphics.BitmapFactory.decodeStream(it, null, android.graphics.BitmapFactory.Options().apply { inSampleSize = sample }) }!!
        val out = java.io.ByteArrayOutputStream()
        bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 85, out)
        return Triple(out.toByteArray(), bmp.width, bmp.height)
    }

    private fun sendOriginal(roomId: String, uri: Uri, p: Picked) {
        val me = _session.value?.userId ?: return
        val type = when { p.mime.startsWith("image/") -> "m.image"; p.mime.startsWith("video/") -> "m.video"; p.mime.startsWith("audio/") -> "m.audio"; else -> "m.file" }
        val txn = UUID.randomUUID().toString()
        val localId = "local-$txn"
        addLocal(roomId, Msg(localId, me, System.currentTimeMillis(), type, p.name, mxc = null, mime = p.mime, size = p.size, w = p.w, h = p.h, txn = txn, status = STATUS_SENDING))
        scope.launch {
            runCatching {
                val mxc = http.upload(p.name, p.mime, p.size) { context.contentResolver.openInputStream(uri)!! }
                matrix.send(roomId, "m.room.message", txn, buildJsonObject {
                    put("msgtype", type); put("body", p.name); put("url", mxc)
                    putJsonObject("info") {
                        put("mimetype", p.mime); put("size", p.size)
                        p.w?.let { put("w", it) }; p.h?.let { put("h", it) }
                    }
                })
            }.onSuccess { setStatus(roomId, localId, STATUS_SENT, it) }.onFailure { setStatus(roomId, localId, STATUS_FAILED) }
        }
    }

    fun sendVoice(roomId: String, file: File, durationMs: Long) {
        val me = _session.value?.userId ?: return
        val mime = if (file.extension == "ogg") "audio/ogg" else "audio/mp4"
        val txn = UUID.randomUUID().toString()
        val localId = "local-$txn"
        addLocal(roomId, Msg(localId, me, System.currentTimeMillis(), "m.audio", "Voice message", mime = mime, size = file.length(), durationMs = durationMs, voice = true, txn = txn, status = STATUS_SENDING))
        scope.launch {
            runCatching {
                val mxc = http.upload("voice-message.${file.extension}", mime, file.length()) { file.inputStream() }
                matrix.send(roomId, "m.room.message", txn, buildJsonObject {
                    put("msgtype", "m.audio"); put("body", "Voice message"); put("url", mxc)
                    putJsonObject("info") { put("mimetype", mime); put("size", file.length()); put("duration", durationMs) }
                    putJsonObject("org.matrix.msc1767.audio") { put("duration", durationMs) }
                    putJsonObject("org.matrix.msc3245.voice") {}
                })
            }.onSuccess { setStatus(roomId, localId, STATUS_SENT, it) }.onFailure { setStatus(roomId, localId, STATUS_FAILED) }
            file.delete()
        }
    }

    fun sendLocation(roomId: String, lat: Double, lon: Double) {
        val me = _session.value?.userId ?: return
        val geo = "geo:%.6f,%.6f".format(java.util.Locale.US, lat, lon)
        val txn = UUID.randomUUID().toString()
        val localId = "local-$txn"
        addLocal(roomId, Msg(localId, me, System.currentTimeMillis(), "m.location", "Location", geo = geo, txn = txn, status = STATUS_SENDING))
        scope.launch {
            runCatching {
                matrix.send(roomId, "m.room.message", txn, buildJsonObject { put("msgtype", "m.location"); put("body", "Location"); put("geo_uri", geo) })
            }.onSuccess { setStatus(roomId, localId, STATUS_SENT, it) }.onFailure { setStatus(roomId, localId, STATUS_FAILED) }
        }
    }

    // --- Scheduled send ------------------------------------------------------------

    /** Returns null on success, or a user-facing reason it failed. */
    suspend fun schedule(roomId: String, text: String, delayMs: Long): String? = try {
        val id = matrix.sendDelayed(roomId, "m.room.message", UUID.randomUUID().toString(), textContent(text, null, emptyList()), delayMs)
        val chat = _chats.value[roomId]?.let { SyncReducer.displayName(it, me) } ?: "chat"
        _scheduled.update { it + Scheduled(id, roomId, chat, text, System.currentTimeMillis() + delayMs) }
        writeJson("scheduled", ListSerializer(Scheduled.serializer()), _scheduled.value)
        setDraft(roomId, "")
        null
    } catch (e: ApiException) {
        if (e.status == 400 || e.status == 404 || e.status == 405) "Your server doesn't support scheduled messages yet (it needs Synapse with delayed events enabled)." else e.message
    } catch (e: Exception) { "Couldn't schedule: ${e.message}" }

    fun cancelScheduled(s: Scheduled) {
        _scheduled.update { l -> l.filter { it.delayId != s.delayId } }
        writeJson("scheduled", ListSerializer(Scheduled.serializer()), _scheduled.value)
        scope.launch { runCatching { matrix.cancelDelayed(s.delayId) } }
    }

    fun pruneScheduled() {
        val now = System.currentTimeMillis()
        if (_scheduled.value.any { it.whenMs < now - 60_000 }) {
            _scheduled.update { l -> l.filter { it.whenMs >= now - 60_000 } }
            writeJson("scheduled", ListSerializer(Scheduled.serializer()), _scheduled.value)
        }
    }

    // --- Drafts, stars, reminders ------------------------------------------------

    fun setDraft(roomId: String, text: String) {
        _drafts.update { if (text.isBlank()) it - roomId else it + (roomId to text) }
        writeJson("drafts", MapSerializer(String.serializer(), String.serializer()), _drafts.value)
    }

    fun draftFor(roomId: String) = _drafts.value[roomId].orEmpty()

    fun toggleStar(roomId: String, msg: Msg) {
        val chat = _chats.value[roomId]
        _stars.update { l ->
            if (l.any { it.eventId == msg.id }) l.filterNot { it.eventId == msg.id }
            else l + Star(roomId, msg.id, chat?.let { SyncReducer.displayName(it, me) } ?: "", chat?.nameOf(msg.sender) ?: msg.sender, previewOf(msg), msg.ts)
        }
        writeJson("stars", ListSerializer(Star.serializer()), _stars.value)
    }

    fun remind(roomId: String, atMs: Long) {
        val name = _chats.value[roomId]?.let { SyncReducer.displayName(it, me) } ?: "a chat"
        reminders.add(roomId, name, atMs)
    }

    // --- Search & link previews --------------------------------------------------

    suspend fun search(term: String, roomId: String? = null): List<SearchHit> = runCatching { matrix.search(term, roomId) }.getOrDefault(emptyList())

    /** Searches everything already on the device. [kind] narrows by media type: all, images, videos, links, files. */
    fun searchLocal(term: String, roomId: String?, kind: String): List<SearchHit> {
        val t = term.trim().lowercase()
        val url = Regex("https?://\\S+|www\\.\\S+")
        return _chats.value.values.filter { roomId == null || it.id == roomId }.flatMap { c ->
            c.messages.filter { m ->
                m.status == STATUS_SENT && when (kind) {
                    "images" -> m.type == "m.image" && !m.sticker
                    "videos" -> m.type == "m.video"
                    "files" -> m.type == "m.file"
                    "links" -> url.containsMatchIn(m.body)
                    else -> m.type != "m.poll" || true
                } && (t.isEmpty() || m.body.lowercase().contains(t))
            }.map { SearchHit(c.id, it.id, it.sender, previewOf(it).takeIf { _ -> it.type != "m.text" && it.type != "m.notice" } ?: it.body, it.ts) }
        }.sortedByDescending { it.ts }.take(200)
    }

    suspend fun preview(url: String): LinkPreview? {
        synchronized(previews) { if (previews.containsKey(url)) return previews[url] }
        val p = runCatching { matrix.previewUrl(url) }.getOrNull()
        synchronized(previews) { previews[url] = p }
        return p
    }

    // --- History & chat management -----------------------------------------------

    fun loadOlder(roomId: String) {
        val chat = _chats.value[roomId] ?: return
        if (chat.reachedStart) return
        // After a restart the saved token may be gone; paginate back from the last sync point instead.
        val token = chat.prevBatch ?: since ?: return
        if (!synchronized(loadingOlder) { loadingOlder.add(roomId) }) return
        scope.launch {
            try {
                val (events, end, state) = matrix.messages(roomId, token)
                update(roomId) { SyncReducer.applyHistory(it, events, end, state, me) }
            } catch (_: Exception) {
            } finally {
                synchronized(loadingOlder) { loadingOlder.remove(roomId) }
            }
        }
    }

    fun setTag(roomId: String, tag: String, on: Boolean, order: Double? = null) {
        val me = _session.value?.userId ?: return
        update(roomId) { c ->
            val t = if (on) c.tags + tag else c.tags - tag
            if (tag == "m.favourite") c.copy(tags = t, pinOrder = if (on) order ?: c.pinOrder else null) else c.copy(tags = t)
        }
        scope.launch { runCatching { matrix.setTag(me, roomId, tag, on, order) } }
    }

    private fun pinned() = _chats.value.values.filter { it.pinned }.sortedBy { it.pinOrder ?: Double.MAX_VALUE }

    /** Pins a chat at the end of the pin row, or unpins it. */
    fun pin(roomId: String, on: Boolean) {
        if (!on) { setTag(roomId, "m.favourite", false); return }
        val last = pinned().filter { it.id != roomId }.mapNotNull { it.pinOrder }.maxOrNull() ?: 0.0
        setTag(roomId, "m.favourite", true, last + 1.0)
    }

    /** Moves a pinned chat to [toIndex] within the pin row. */
    fun movePin(roomId: String, toIndex: Int) {
        val others = pinned().filter { it.id != roomId }
        val i = toIndex.coerceIn(0, others.size)
        val before = others.getOrNull(i - 1)?.pinOrder
        val after = others.getOrNull(i)?.pinOrder
        val order = when {
            before == null && after == null -> 1.0
            before == null -> after!! - 1.0
            after == null -> before + 1.0
            else -> (before + after) / 2
        }
        setTag(roomId, "m.favourite", true, order)
    }

    fun setLowPriority(roomId: String, on: Boolean) = setTag(roomId, "m.lowpriority", on)
    fun addLabel(roomId: String, name: String) = setTag(roomId, ChatState.LABEL_PREFIX + name.trim(), true)
    fun removeLabel(roomId: String, name: String) = setTag(roomId, ChatState.LABEL_PREFIX + name, false)
    fun renameLabel(old: String, new: String) {
        if (new.isBlank() || new == old) return
        _chats.value.values.filter { old in it.labels }.forEach { removeLabel(it.id, old); addLabel(it.id, new) }
    }
    fun deleteLabel(name: String) = _chats.value.values.filter { name in it.labels }.forEach { removeLabel(it.id, name) }

    /** Beeper-style snooze: tuck the chat into the archive and bring it back, unread, at [atMs]. */
    fun snooze(roomId: String, atMs: Long) {
        setTag(roomId, "u.archived", true)
        val name = _chats.value[roomId]?.let { SyncReducer.displayName(it, me) } ?: "a chat"
        reminders.add(roomId, name, atMs, snooze = true)
    }

    // --- Polls, GIFs, stickers, contacts ---------------------------------------------

    fun sendPoll(roomId: String, question: String, answers: List<String>, maxSelections: Int, disclosed: Boolean) {
        val me = _session.value?.userId ?: return
        val txn = UUID.randomUUID().toString()
        val localId = "local-$txn"
        val pollAnswers = answers.mapIndexed { i, a -> PollAnswer("a${i + 1}", a) }
        addLocal(roomId, Msg(localId, me, System.currentTimeMillis(), "m.poll", question, txn = txn, status = STATUS_SENDING, poll = PollInfo(question, pollAnswers, maxSelections, disclosed)))
        scope.launch {
            runCatching {
                matrix.send(roomId, "org.matrix.msc3381.poll.start", txn, buildJsonObject {
                    putJsonObject("org.matrix.msc3381.poll.start") {
                        put("kind", if (disclosed) "org.matrix.msc3381.poll.disclosed" else "org.matrix.msc3381.poll.undisclosed")
                        put("max_selections", maxSelections)
                        putJsonObject("question") { put("org.matrix.msc1767.text", question); put("body", question); put("msgtype", "m.text") }
                        put("answers", JsonArray(pollAnswers.map { a -> buildJsonObject { put("id", a.id); put("org.matrix.msc1767.text", a.text) } }))
                    }
                    put("org.matrix.msc1767.text", question + "\n" + pollAnswers.mapIndexed { i, a -> "${i + 1}. ${a.text}" }.joinToString("\n"))
                })
            }.onSuccess { setStatus(roomId, localId, STATUS_SENT, it) }.onFailure { setStatus(roomId, localId, STATUS_FAILED) }
        }
    }

    fun votePoll(roomId: String, pollId: String, answerIds: List<String>) {
        val me = _session.value?.userId ?: return
        update(roomId) { c -> c.copy(pollVotes = c.pollVotes + (pollId to ((c.pollVotes[pollId] ?: emptyMap()) + (me to answerIds)))) }
        scope.launch {
            runCatching {
                matrix.send(roomId, "org.matrix.msc3381.poll.response", UUID.randomUUID().toString(), buildJsonObject {
                    putJsonObject("m.relates_to") { put("rel_type", "m.reference"); put("event_id", pollId) }
                    putJsonObject("org.matrix.msc3381.poll.response") { put("answers", JsonArray(answerIds.map { JsonPrimitive(it) })) }
                })
            }
        }
    }

    fun endPoll(roomId: String, pollId: String) {
        update(roomId) { it.copy(pollEnded = it.pollEnded + pollId) }
        scope.launch {
            runCatching {
                matrix.send(roomId, "org.matrix.msc3381.poll.end", UUID.randomUUID().toString(), buildJsonObject {
                    putJsonObject("m.relates_to") { put("rel_type", "m.reference"); put("event_id", pollId) }
                    put("org.matrix.msc1767.text", "The poll has ended.")
                })
            }
        }
    }

    private fun sendBytes(roomId: String, bytes: ByteArray, name: String, mime: String, type: String, w: Int? = null, h: Int? = null) {
        val me = _session.value?.userId ?: return
        val txn = UUID.randomUUID().toString()
        val localId = "local-$txn"
        addLocal(roomId, Msg(localId, me, System.currentTimeMillis(), type, name, mime = mime, size = bytes.size.toLong(), w = w, h = h, txn = txn, status = STATUS_SENDING))
        scope.launch {
            runCatching {
                val mxc = http.upload(name, mime, bytes.size.toLong()) { java.io.ByteArrayInputStream(bytes) }
                matrix.send(roomId, "m.room.message", txn, buildJsonObject {
                    put("msgtype", type); put("body", name); put("url", mxc)
                    putJsonObject("info") { put("mimetype", mime); put("size", bytes.size.toLong()); w?.let { put("w", it) }; h?.let { put("h", it) } }
                })
            }.onSuccess { setStatus(roomId, localId, STATUS_SENT, it) }.onFailure { setStatus(roomId, localId, STATUS_FAILED) }
        }
    }

    fun sendGif(roomId: String, gif: Gif) {
        scope.launch {
            runCatching { gifs.download(gif.url) }.onSuccess { sendBytes(roomId, it, "${gif.title.ifBlank { "gif" }.take(40)}.gif", "image/gif", "m.image", gif.w.takeIf { w -> w > 0 }, gif.h.takeIf { h -> h > 0 }) }
        }
    }

    fun sendContact(roomId: String, name: String, phone: String) {
        val vcard = "BEGIN:VCARD\nVERSION:3.0\nFN:$name\nTEL;TYPE=CELL:$phone\nEND:VCARD\n"
        sendBytes(roomId, vcard.toByteArray(), "${name.replace(Regex("[^A-Za-z0-9 ._-]"), "")}.vcf", "text/vcard", "m.file")
    }

    fun stickerPacks(roomId: String?): List<StickerPack> =
        listOfNotNull(_userStickers.value?.takeIf { it.stickers.isNotEmpty() }) + (roomId?.let { _chats.value[it]?.stickerPacks }.orEmpty().filter { it.stickers.isNotEmpty() })

    fun sendSticker(roomId: String, s: Sticker) {
        val me = _session.value?.userId ?: return
        val txn = UUID.randomUUID().toString()
        val localId = "local-$txn"
        addLocal(roomId, Msg(localId, me, System.currentTimeMillis(), "m.image", s.body, mxc = s.url, mime = s.mime, w = s.w, h = s.h, sticker = true, txn = txn, status = STATUS_SENDING))
        scope.launch {
            runCatching {
                matrix.send(roomId, "m.sticker", txn, buildJsonObject {
                    put("body", s.body); put("url", s.url)
                    putJsonObject("info") { s.mime?.let { put("mimetype", it) }; s.w?.let { put("w", it) }; s.h?.let { put("h", it) } }
                })
            }.onSuccess { setStatus(roomId, localId, STATUS_SENT, it) }.onFailure { setStatus(roomId, localId, STATUS_FAILED) }
        }
    }

    /** Uploads images and adds them to your personal sticker pack. */
    suspend fun addStickers(uris: List<Uri>) {
        val me = _session.value?.userId ?: return
        val existing = _userStickers.value?.stickers.orEmpty()
        val added = uris.mapNotNull { uri ->
            runCatching {
                val p = describe(uri)
                val mxc = http.upload(p.name, p.mime, p.size) { context.contentResolver.openInputStream(uri)!! }
                Sticker(p.name.substringBeforeLast('.').replace(Regex("[^A-Za-z0-9_-]"), "_").ifEmpty { "sticker" } + "_" + (System.currentTimeMillis() % 100000), mxc, p.name.substringBeforeLast('.'), p.w, p.h, p.mime)
            }.getOrNull()
        }
        if (added.isEmpty()) return
        val all = existing + added
        _userStickers.value = StickerPack("user", "My stickers", all)
        writeJson("userStickers", StickerPack.serializer().nullable, _userStickers.value)
        runCatching {
            matrix.putAccountData(me, "im.ponies.user_emotes", buildJsonObject {
                putJsonObject("pack") { put("display_name", "My stickers") }
                putJsonObject("images") {
                    all.forEach { st ->
                        putJsonObject(st.shortcode) {
                            put("url", st.url); put("body", st.body); put("usage", JsonArray(listOf(JsonPrimitive("sticker"))))
                            putJsonObject("info") { st.mime?.let { put("mimetype", it) }; st.w?.let { put("w", it) }; st.h?.let { put("h", it) } }
                        }
                    }
                }
            })
        }
    }

    fun openUrl(uri: android.net.Uri) {
        context.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, uri).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    // --- Settings backup ---------------------------------------------------------------

    fun exportSettings(): String = json.encodeToString(AppSettings.serializer(), settings.value)
    fun importSettings(text: String): Boolean = runCatching {
        val s = json.decodeFromString(AppSettings.serializer(), text)
        settings.update { s }
    }.isSuccess

    fun setMuted(roomId: String, muted: Boolean, forMs: Long? = null) {
        _muted.update { if (muted) it + roomId else it - roomId }
        muteUntil.update { if (muted && forMs != null) it + (roomId to System.currentTimeMillis() + forMs) else it - roomId }
        writeJson("muteUntil", MapSerializer(String.serializer(), Long.serializer()), muteUntil.value)
        scope.launch { runCatching { matrix.setMuted(roomId, muted) } }
    }

    private fun expireMutes() {
        val now = System.currentTimeMillis()
        muteUntil.value.filterValues { it <= now }.keys.forEach { setMuted(it, false) }
    }

    fun muteLeft(roomId: String): Long? = muteUntil.value[roomId]?.let { it - System.currentTimeMillis() }

    suspend fun members(roomId: String): Map<String, String> = runCatching { matrix.joinedMembers(roomId) }.getOrDefault(emptyMap())

    fun rename(roomId: String, name: String) {
        update(roomId) { it.copy(name = name) }
        scope.launch { runCatching { matrix.rename(roomId, name) } }
    }

    fun leave(roomId: String) {
        _chats.update { it - roomId }
        scope.launch { runCatching { matrix.leave(roomId) } }
    }

    // --- Bridges -------------------------------------------------------------------

    suspend fun refreshBridges() {
        if (_session.value == null) return
        runCatching { pager.networks() }.onSuccess { applyIdentity(it); _bridges.value = it }
    }

    /** localpart escaping used by the bridges for ghost user ids (uppercase and odd characters are escaped). */
    private fun escLocalpart(s: String) = buildString {
        for (c in s) when {
            c in 'a'..'z' || c in '0'..'9' || c in "-./=" -> append(c)
            c == '_' -> append("__")
            c in 'A'..'Z' -> append('_').append(c.lowercaseChar())
            else -> append('=').append(c.code.toString(16).padStart(2, '0'))
        }
    }

    private fun restoreIdentity() {
        val names = prefs.getStringSet("identity.names", null) ?: return
        SyncReducer.setOwnIdentity(names, prefs.getStringSet("identity.ids", emptySet()).orEmpty())
    }

    private fun applyIdentity(nets: List<Network>) {
        val domain = _session.value?.userId?.substringAfter(':', "") ?: ""
        val names = sortedSetOf<String>(); val ids = sortedSetOf<String>()
        for (n in nets) for (l in n.logins) {
            ids.add("@${n.id}_${escLocalpart(l.id)}:$domain")
            if (l.name.isNotBlank()) names.add(l.name)
            if (l.profileName.isNotBlank()) names.add(l.profileName)
        }
        val key = names.joinToString("|") + "##" + ids.joinToString("|")
        if (key == prefs.getString("identity.key", "")) return
        prefs.edit().putString("identity.key", key).putStringSet("identity.names", names).putStringSet("identity.ids", ids).apply()
        SyncReducer.setOwnIdentity(names, ids)
        // Messages already loaded were attributed before we knew who you are on each network: start over once.
        val s = _session.value ?: return
        syncJob?.cancel()
        since = null; _chats.value = emptyMap(); _synced.value = false; cacheFile.delete()
        syncJob = scope.launch { syncLoop(s) }
    }

    private suspend fun bridgeLoop() {
        while (scope.isActive) {
            if (appInForeground) refreshBridges()
            pruneScheduled()
            delay(120_000)
        }
    }

    // --- Session -----------------------------------------------------------------

    fun signOut() {
        scope.launch { kotlinx.coroutines.withTimeoutOrNull(2500) { runCatching { matrix.logout() } }; signOutLocal() }
    }

    private fun signOutLocal() {
        syncJob?.cancel()
        prefs.edit().remove("token").remove("userId").remove("identity.key").remove("identity.names").remove("identity.ids").apply()
        SyncReducer.setOwnIdentity(emptyList(), emptyList())
        http.token = null
        since = null
        cacheFile.delete()
        media.clear()
        _chats.value = emptyMap()
        _muted.value = emptySet()
        _bridges.value = emptyList()
        _synced.value = false
        _session.value = null
    }

    fun clearCache() { media.clear() }
    fun cacheSize(): Long = File(context.cacheDir, "media").walkTopDown().filter { it.isFile }.sumOf { it.length() }
}
