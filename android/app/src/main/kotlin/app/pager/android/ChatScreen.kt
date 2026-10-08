@file:OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package app.pager.android

import android.Manifest
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withLink
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.FileProvider
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.File
import java.text.DateFormat
import java.text.SimpleDateFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.Date
import java.util.Locale

private sealed interface Item {
    val key: String
    data class Day(val label: String, val date: LocalDate) : Item { override val key get() = "day-$date" }
    object Unread : Item { override val key get() = "unread-divider" }
    data class M(val msg: Msg, val index: Int, val first: Boolean) : Item { override val key get() = msg.id }
}

private fun dayLabel(d: LocalDate): String {
    val today = LocalDate.now()
    return when (d) {
        today -> "Today"
        today.minusDays(1) -> "Yesterday"
        else -> DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date.from(d.atStartOfDay(ZoneId.systemDefault()).toInstant()))
    }
}

/** Newest-first list with day separators and an optional "new messages" divider, ready for a reversed LazyColumn. */
private fun buildItems(messages: List<Msg>, unreadBefore: String?): List<Item> {
    val out = ArrayList<Item>(messages.size + 8)
    var lastDay: LocalDate? = null
    messages.forEachIndexed { i, m ->
        val day = Instant.ofEpochMilli(m.ts).atZone(ZoneId.systemDefault()).toLocalDate()
        if (day != lastDay) { out.add(Item.Day(dayLabel(day), day)); lastDay = day }
        if (m.id == unreadBefore) out.add(Item.Unread)
        out.add(Item.M(m, i, first = messages.getOrNull(i - 1)?.sender != m.sender || out.lastOrNull() is Item.Day || out.lastOrNull() is Item.Unread))
    }
    out.reverse()
    return out
}

// DateFormat is expensive to create and these run for every visible bubble; share one per thread.
private val timeSystem = ThreadLocal.withInitial { DateFormat.getTimeInstance(DateFormat.SHORT) }
private val time12 = ThreadLocal.withInitial { SimpleDateFormat("h:mm a", Locale.getDefault()) }
private val time24 = ThreadLocal.withInitial { SimpleDateFormat("HH:mm", Locale.getDefault()) }
fun formatClock(ts: Long, mode: String): String = when (mode) {
    "12" -> time12.get()!!.format(Date(ts))
    "24" -> time24.get()!!.format(Date(ts))
    else -> timeSystem.get()!!.format(Date(ts))
}

private val URL_REGEX = android.util.Patterns.WEB_URL.toRegex()
private fun firstUrl(text: String): String? = URL_REGEX.find(text)?.value?.let { if (it.startsWith("http")) it else "https://$it" }

private fun linkified(text: String, linkColor: Color): AnnotatedString = buildAnnotatedString {
    var last = 0
    for (m in URL_REGEX.findAll(text)) {
        if (m.range.first < last) continue
        append(text.substring(last, m.range.first))
        val url = if (m.value.startsWith("http")) m.value else "https://${m.value}"
        withLink(LinkAnnotation.Url(url, TextLinkStyles(SpanStyle(color = linkColor, textDecoration = TextDecoration.Underline)))) { append(m.value) }
        last = m.range.last + 1
    }
    append(text.substring(last))
}

private fun senderColor(name: String, dark: Boolean) =
    Color.hsv((name.fold(7) { a, c -> (a * 31 + c.code) % 360 }).toFloat(), if (dark) 0.45f else 0.7f, if (dark) 0.95f else 0.6f)

@Composable
fun ChatScreen(roomId: String, onBack: () -> Unit, onInfo: () -> Unit, onForward: (Msg) -> Unit, onSearch: () -> Unit) {
    val store = LocalStore.current
    val s = LocalSettings.current
    val context = LocalContext.current
    val chat by remember(roomId) { store.chat(roomId) }.collectAsState(null)
    val me = store.session.collectAsState().value?.userId ?: ""
    val stars by store.stars.collectAsState()
    val messages = chat?.messages ?: emptyList()
    val byId = remember(messages) { messages.associateBy { it.id } }
    val readIndex = remember(messages, chat?.receipts) {
        val r = chat?.receipts ?: emptyMap()
        r.filterKeys { it != me }.values.maxOfOrNull { id -> messages.indexOfFirst { it.id == id } } ?: -1
    }
    val group = remember(messages, chat?.memberCount) { (chat?.memberCount ?: 0) > 2 || messages.map { it.sender }.toSet().size > 2 }

    // Where the unread messages begin; computed once when the chat opens.
    val unreadBefore = remember(roomId, chat != null) {
        val c = chat ?: return@remember null
        val read = c.receipts[me]
        val i = if (read != null) c.messages.indexOfFirst { it.id == read } else -1
        val fresh = if (i >= 0) c.messages.drop(i + 1) else if (c.unread > 0) c.messages.takeLast(c.unread) else emptyList()
        fresh.firstOrNull { it.sender != me }?.id
    }
    val items = remember(messages, unreadBefore) { buildItems(messages, unreadBefore) }

    val list = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val clipboard = LocalClipboardManager.current
    var text by remember(roomId) { mutableStateOf(store.draftFor(roomId)) }
    var replyTo by remember(roomId) { mutableStateOf<Msg?>(null) }
    var editing by remember(roomId) { mutableStateOf<Msg?>(null) }
    var actions by remember { mutableStateOf<Msg?>(null) }
    var viewer by remember { mutableStateOf<Msg?>(null) }
    var attachMenu by remember { mutableStateOf(false) }
    var pickerFor by remember { mutableStateOf<Msg?>(null) }
    var whoFor by remember { mutableStateOf<Pair<Msg, String>?>(null) }
    var confirmDelete by remember { mutableStateOf<Msg?>(null) }
    var scheduleDialog by remember { mutableStateOf(false) }
    var scheduleError by remember { mutableStateOf<String?>(null) }
    val mentionIds = remember(roomId) { mutableStateMapOf<String, String>() }
    val recorder = remember { VoiceRecorder(context) }
    var recording by remember { mutableStateOf(false) }
    var recordedMs by remember { mutableStateOf(0L) }

    val currentText by rememberUpdatedState(text)
    val currentEditing by rememberUpdatedState(editing)
    DisposableEffect(roomId) { onDispose { if (currentEditing == null) store.setDraft(roomId, currentText); store.typing(roomId, false); recorder.cancel() } }
    LaunchedEffect(text) {
        if (text.isNotBlank()) store.typing(roomId, true) else store.typing(roomId, false)
        delay(500)
        if (editing == null) store.setDraft(roomId, text)
    }
    LaunchedEffect(recording) { while (recording) { recordedMs = recorder.elapsedMs; delay(200) } }

    val pickMedia = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(8)) { uris: List<Uri> -> uris.forEach { store.sendFile(roomId, it) } }
    val pickFile = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris: List<Uri> -> uris.forEach { store.sendFile(roomId, it) } }
    var cameraUri by remember { mutableStateOf<Uri?>(null) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) cameraUri?.let { store.sendFile(roomId, it) } }
    val micPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok -> if (ok) recording = recorder.start() }
    val locationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { _ ->
        scope.launch { currentLocation(context)?.let { store.sendLocation(roomId, it.latitude, it.longitude) } }
    }

    val newestId = messages.lastOrNull()?.id
    val newestMine = messages.lastOrNull()?.sender == me
    var opened by remember(roomId) { mutableStateOf(false) }
    LaunchedEffect(newestId, unreadBefore) {
        if (!opened) {
            if (chat == null) return@LaunchedEffect
            opened = true
            val divider = items.indexOfFirst { it is Item.Unread }
            if (divider >= 0) list.scrollToItem(divider) else list.scrollToItem(0)
        } else if (newestId != null && (newestMine || list.firstVisibleItemIndex <= 1)) list.animateScrollToItem(0)
        if (list.firstVisibleItemIndex <= 2) store.markRead(roomId)
    }
    LaunchedEffect(roomId, chat?.reachedStart) {
        snapshotFlow { list.layoutInfo.visibleItemsInfo.lastOrNull()?.index to list.layoutInfo.totalItemsCount }.collect { (last, total) ->
            if (last != null && total > 0 && last >= total - 6) store.loadOlder(roomId)
        }
    }
    LaunchedEffect(roomId) { snapshotFlow { list.firstVisibleItemIndex <= 1 }.collect { atEnd -> if (atEnd) store.markRead(roomId) } }
    val showJump by remember { derivedStateOf { list.firstVisibleItemIndex > 3 } }

    fun send() {
        val body = text.trim()
        if (body.isEmpty()) return
        val e = editing
        if (e != null) store.edit(roomId, e.id, body)
        else store.send(roomId, body, replyTo?.id, mentionIds.filterKeys { body.contains("@$it") }.values.toList())
        text = ""; replyTo = null; editing = null; mentionIds.clear()
    }

    val dark = isDarkTheme(s)
    val wallpaper = wallpaperBrush(s.wallpaper, dark)

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().imePadding()) {
            Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).padding(horizontal = 4.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onBack) { Text("‹", fontSize = 28.sp) }
                Row(Modifier.weight(1f).clickable(onClick = onInfo), verticalAlignment = Alignment.CenterVertically) {
                    val name = chat?.let { SyncReducer.displayName(it, me) } ?: "Opening…"
                    if (s.showAvatars) Avatar(name, if (s.showNetworkBadges) chat?.network else null, 38.dp, chat?.avatarMxc)
                    Column(Modifier.padding(start = 12.dp)) {
                        Text(name, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        val typing = chat?.typing.orEmpty()
                        if (typing.isNotEmpty()) {
                            Text(if (typing.size == 1) "${chat!!.nameOf(typing.first())} is typing…" else "Several people are typing…", fontSize = 12.sp, color = MaterialTheme.colorScheme.primary)
                        } else chat?.let {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.size(7.dp).clip(CircleShape).background(networkMeta(it.network).color))
                                Text(" ${networkMeta(it.network).label}${if (it.isGroup) " · ${it.memberCount} members" else ""}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
                TextButton(onClick = onSearch) { Text("🔍", fontSize = 18.sp) }
            }

            Box(Modifier.weight(1f).fillMaxWidth().let { if (wallpaper != null) it.background(wallpaper) else it }) {
                LazyColumn(
                    Modifier.fillMaxSize(), state = list, reverseLayout = true,
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 10.dp),
                ) {
                    items(items, key = { it.key }) { item ->
                        when (item) {
                            is Item.Day -> Box(Modifier.fillMaxWidth().padding(vertical = 10.dp), contentAlignment = Alignment.Center) {
                                Text(item.label, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant).padding(horizontal = 12.dp, vertical = 4.dp))
                            }
                            Item.Unread -> Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.weight(1f).height(1.dp).background(MaterialTheme.colorScheme.primary.copy(alpha = 0.5f)))
                                Text("  New messages  ", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
                                Box(Modifier.weight(1f).height(1.dp).background(MaterialTheme.colorScheme.primary.copy(alpha = 0.5f)))
                            }
                            is Item.M -> MessageRow(
                                chat = chat, msg = item.msg, me = me, group = group, first = item.first, dark = dark,
                                reply = item.msg.replyTo?.let { byId[it] }, read = item.index <= readIndex,
                                onLong = { actions = item.msg },
                                onReact = { store.react(roomId, item.msg.id, it) },
                                onWho = { key -> whoFor = item.msg to key },
                                onDouble = { if (s.doubleTapReact) s.quickReactions.firstOrNull()?.let { store.react(roomId, item.msg.id, it) } },
                                onOpen = { m ->
                                    when {
                                        m.type == "m.location" && m.geo != null -> runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(m.geo)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                                        m.mxc == null -> {}
                                        m.type == "m.image" -> viewer = m
                                        m.type == "m.audio" -> scope.launch { store.audio.toggle(m.id, m.mxc) }
                                        m.type == "m.file" || m.type == "m.video" -> scope.launch { store.media.open(m.mxc, m.body.ifEmpty { "file" }, m.mime) }
                                    }
                                },
                            )
                        }
                    }
                }
                if (showJump) {
                    Box(
                        Modifier.align(Alignment.BottomEnd).padding(end = 16.dp, bottom = 12.dp).size(44.dp).clip(CircleShape)
                            .background(MaterialTheme.colorScheme.surface).clickable { scope.launch { list.animateScrollToItem(0) } },
                        contentAlignment = Alignment.Center,
                    ) { Text("↓", fontSize = 20.sp) }
                }
            }

            replyTo?.let { r -> BannerBar("Replying to ${chat?.nameOf(r.sender) ?: ""}", previewOf(r)) { replyTo = null } }
            editing?.let { BannerBar("Editing message", it.body) { editing = null; text = "" } }

            // @mention suggestions
            val token = if (s.mentionSuggestions && group) Regex("(?:^|\\s)@([^\\s@]*)$").find(text)?.groupValues?.get(1) else null
            if (token != null) {
                val people = chat?.members?.filterKeys { it != me }?.filterValues { it.contains(token, ignoreCase = true) }?.entries?.take(12).orEmpty()
                if (people.isNotEmpty()) LazyRow(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).padding(vertical = 6.dp), contentPadding = PaddingValues(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(people.toList()) { (id, name) ->
                        Row(
                            Modifier.clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant).clickable {
                                text = text.dropLast(token.length + 1) + "@$name "; mentionIds[name] = id
                            }.padding(horizontal = 12.dp, vertical = 6.dp),
                        ) { Text("@$name") }
                    }
                }
            }

            if (recording) {
                Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(12.dp).clip(CircleShape).background(Color(0xFFEF4444)))
                    Text("  Recording  %d:%02d".format(recordedMs / 60000, (recordedMs / 1000) % 60), Modifier.weight(1f))
                    TextButton(onClick = { recorder.cancel(); recording = false }) { Text("Cancel") }
                    TextButton(onClick = { recorder.stop()?.let { (f, ms) -> store.sendVoice(roomId, f, ms) }; recording = false }) { Text("Send", fontWeight = FontWeight.Bold) }
                }
            } else Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).padding(8.dp), verticalAlignment = Alignment.Bottom) {
                Box {
                    TextButton(onClick = { attachMenu = true }, Modifier.size(48.dp)) { Text("＋", fontSize = 22.sp) }
                    DropdownMenu(attachMenu, { attachMenu = false }) {
                        DropdownMenuItem(text = { Text("📷  Photo or video") }, onClick = { attachMenu = false; pickMedia.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo)) })
                        DropdownMenuItem(text = { Text("📸  Camera") }, onClick = {
                            attachMenu = false
                            val f = File(File(context.cacheDir, "media").apply { mkdirs() }, "camera-${System.currentTimeMillis()}.jpg")
                            val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", f)
                            cameraUri = uri; camera.launch(uri)
                        })
                        DropdownMenuItem(text = { Text("📎  File") }, onClick = { attachMenu = false; pickFile.launch("*/*") })
                        DropdownMenuItem(text = { Text("📍  Location") }, onClick = {
                            attachMenu = false
                            if (hasPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) || hasPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION))
                                scope.launch { currentLocation(context)?.let { store.sendLocation(roomId, it.latitude, it.longitude) } }
                            else locationPermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
                        })
                    }
                }
                OutlinedTextField(
                    text, { text = it }, placeholder = { Text("Message") }, modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(22.dp), maxLines = 5,
                    keyboardOptions = KeyboardOptions(imeAction = if (s.enterToSend) ImeAction.Send else ImeAction.Default),
                    keyboardActions = KeyboardActions(onSend = { send() }),
                )
                Spacer(Modifier.size(8.dp))
                val hasText = text.isNotBlank()
                Box(
                    Modifier.size(52.dp).clip(CircleShape)
                        .background(if (hasText || editing == null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant)
                        .combinedClickable(
                            onClick = {
                                if (hasText) send()
                                else if (hasPermission(context, Manifest.permission.RECORD_AUDIO)) recording = recorder.start() else micPermission.launch(Manifest.permission.RECORD_AUDIO)
                            },
                            onLongClick = { if (hasText && editing == null) scheduleDialog = true },
                        ),
                    contentAlignment = Alignment.Center,
                ) { Text(if (hasText) "➤" else "🎤", color = MaterialTheme.colorScheme.onPrimary, fontSize = 18.sp) }
            }
        }
    }

    actions?.let { m ->
        val mine = m.sender == me
        ActionsDialog(
            msg = m, mine = mine, starred = stars.any { it.eventId == m.id }, quick = s.quickReactions, onDismiss = { actions = null },
            onReact = { store.react(roomId, m.id, it); actions = null },
            onMore = { pickerFor = m; actions = null },
            onReply = { replyTo = m; editing = null; actions = null },
            onForward = { onForward(m); actions = null },
            onCopy = { clipboard.setText(AnnotatedString(m.body)); actions = null },
            onStar = { store.toggleStar(roomId, m); actions = null },
            onEdit = if (mine && m.type == "m.text" && m.status == STATUS_SENT) ({ editing = m; replyTo = null; text = m.body; actions = null }) else null,
            onDelete = if (mine && m.status == STATUS_SENT) ({ actions = null; if (s.confirmDelete) confirmDelete = m else store.delete(roomId, m.id) }) else null,
        )
    }
    pickerFor?.let { m -> EmojiPickerDialog(s.recentEmoji, onPick = { store.react(roomId, m.id, it); pickerFor = null }, onDismiss = { pickerFor = null }) }
    whoFor?.let { (m, key) ->
        val who = chat?.reactions?.get(m.id)?.get(key).orEmpty()
        AlertDialog(
            onDismissRequest = { whoFor = null },
            title = { Text("$key  ${who.size}") },
            text = { Column { who.forEach { Text(if (it == me) "You" else chat?.nameOf(it) ?: it, Modifier.padding(vertical = 6.dp)) } } },
            confirmButton = { TextButton(onClick = { whoFor = null }) { Text("Close") } },
            dismissButton = if (me in who) ({ TextButton(onClick = { store.react(roomId, m.id, key); whoFor = null }) { Text("Remove mine") } }) else null,
        )
    }
    confirmDelete?.let { m ->
        AlertDialog(
            onDismissRequest = { confirmDelete = null }, title = { Text("Delete message?") },
            text = { Text("It will be removed for everyone in the chat where the network allows it.") },
            confirmButton = { TextButton(onClick = { store.delete(roomId, m.id); confirmDelete = null }) { Text("Delete", color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = { confirmDelete = null }) { Text("Cancel") } },
        )
    }
    if (scheduleDialog) TimePresetDialog("Send later", { at ->
        scheduleDialog = false
        val body = text.trim()
        scope.launch {
            val err = store.schedule(roomId, body, (at - System.currentTimeMillis()).coerceAtLeast(5_000))
            if (err == null) { text = ""; replyTo = null } else scheduleError = err
        }
    }, { scheduleDialog = false })
    scheduleError?.let { AlertDialog(onDismissRequest = { scheduleError = null }, title = { Text("Couldn't schedule") }, text = { Text(it) }, confirmButton = { TextButton(onClick = { scheduleError = null }) { Text("OK") } }) }
    viewer?.let { ImageViewer(it) { viewer = null } }
}

@Composable
private fun BannerBar(title: String, subtitle: String, onClose: () -> Unit) {
    Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).padding(start = 16.dp, end = 4.dp, top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.width(3.dp).height(34.dp).background(MaterialTheme.colorScheme.primary))
        Column(Modifier.weight(1f).padding(start = 10.dp)) {
            Text(title, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
            Text(subtitle, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        TextButton(onClick = onClose) { Text("✕") }
    }
}

@Composable
private fun MessageRow(
    chat: ChatState?, msg: Msg, me: String, group: Boolean, first: Boolean, dark: Boolean, reply: Msg?, read: Boolean,
    onLong: () -> Unit, onReact: (String) -> Unit, onWho: (String) -> Unit, onDouble: () -> Unit, onOpen: (Msg) -> Unit,
) {
    val store = LocalStore.current
    val s = LocalSettings.current
    val context = LocalContext.current
    val mine = msg.sender == me
    val scheme = MaterialTheme.colorScheme
    val fg = if (mine) scheme.onPrimaryContainer else scheme.onSurface
    val shape = bubbleShape(s.bubbleStyle)
    val vGap = if (s.density == "compact") 1.dp else 2.dp

    Column(
        Modifier.fillMaxWidth().padding(top = if (first) 8.dp else vGap),
        horizontalAlignment = if (mine) Alignment.End else Alignment.Start,
    ) {
        if (group && !mine && first) {
            val n = chat?.nameOf(msg.sender) ?: msg.sender
            Text(n, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = if (s.colorSenderNames) senderColor(n, dark) else scheme.onSurfaceVariant, modifier = Modifier.padding(start = 12.dp, bottom = 2.dp))
        }
        val bare = msg.sticker // stickers float without a bubble
        Box(
            Modifier.widthIn(max = 300.dp).clip(shape)
                .background(if (bare) Color.Transparent else if (mine) scheme.primaryContainer else scheme.surfaceVariant)
                .combinedClickable(
                    onClick = { if (msg.status == STATUS_FAILED) chat?.id?.let { store.retry(it, msg) } else onOpen(msg) },
                    onLongClick = onLong, onDoubleClick = onDouble,
                ),
        ) {
            Column(Modifier.padding(horizontal = if (bare) 0.dp else 12.dp, vertical = if (bare) 0.dp else 7.dp)) {
                if (msg.replyTo != null) {
                    Row(Modifier.padding(bottom = 6.dp).height(IntrinsicSize.Min)) {
                        Box(Modifier.width(3.dp).fillMaxHeight().background(fg.copy(alpha = 0.5f)))
                        Column(Modifier.padding(start = 8.dp)) {
                            Text(reply?.let { chat?.nameOf(it.sender) } ?: "Earlier message", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = fg.copy(alpha = 0.8f))
                            Text(reply?.let { previewOf(it) } ?: "…", fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, color = fg.copy(alpha = 0.7f))
                        }
                    }
                }
                when (msg.type) {
                    "m.image" -> ImageContent(msg, allowAuto = mediaAllowed(context, s.autoDownload))
                    "m.video" -> FileChip("🎬", msg.body.ifEmpty { "Video" }, msg.size, fg)
                    "m.audio" -> AudioContent(msg, fg)
                    "m.file" -> FileChip("📎", msg.body.ifEmpty { "File" }, msg.size, fg)
                    "m.location" -> Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("📍", fontSize = 26.sp)
                        Column(Modifier.padding(start = 10.dp)) {
                            Text("Shared location", color = fg, fontWeight = FontWeight.SemiBold)
                            Text(msg.geo?.removePrefix("geo:")?.substringBefore(';') ?: "", fontSize = 12.sp, color = fg.copy(alpha = 0.7f))
                            Text("Tap to open map", fontSize = 11.sp, color = fg.copy(alpha = 0.6f))
                        }
                    }
                    "m.emote" -> Text("* ${chat?.nameOf(msg.sender) ?: ""} ${msg.body}", color = fg, fontStyle = FontStyle.Italic)
                    "m.notice" -> Text(linkified(msg.body, scheme.primary), color = fg.copy(alpha = 0.75f), fontSize = 14.sp)
                    else -> {
                        Text(linkified(msg.body, if (mine) fg else scheme.primary), color = fg)
                        if (s.linkPreviews) firstUrl(msg.body)?.let { LinkPreviewCard(it, fg) }
                    }
                }
                if (!bare && (s.showMessageTimes || (mine && s.showReadTicks) || msg.edited)) {
                    Row(Modifier.align(Alignment.End).padding(top = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                        if (msg.edited) Text("edited  ", fontSize = 10.sp, fontStyle = FontStyle.Italic, color = fg.copy(alpha = 0.6f))
                        if (s.showMessageTimes) Text(remember(msg.ts, s.timeFormat) { formatClock(msg.ts, s.timeFormat) }, fontSize = 10.sp, color = fg.copy(alpha = 0.6f))
                        if (mine && s.showReadTicks) Text(
                            when { msg.status == STATUS_SENDING -> "  ⏳"; msg.status == STATUS_FAILED -> "  ⚠"; read -> "  ✓✓"; else -> "  ✓" },
                            fontSize = 10.sp, color = if (read && msg.status == STATUS_SENT) scheme.onPrimaryContainer else fg.copy(alpha = 0.6f),
                            fontWeight = if (read) FontWeight.Bold else FontWeight.Normal,
                        )
                    }
                }
            }
        }
        if (msg.status == STATUS_FAILED) Text("Not sent · tap to retry", fontSize = 12.sp, color = scheme.error, modifier = Modifier.padding(horizontal = 8.dp))
        val reactions = chat?.reactions?.get(msg.id).orEmpty()
        if (reactions.isNotEmpty()) {
            FlowRow(Modifier.padding(top = 3.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                reactions.forEach { (key, who) ->
                    val minePicked = me in who
                    Row(
                        Modifier.clip(CircleShape).background(if (minePicked) scheme.primary.copy(alpha = 0.25f) else scheme.surfaceVariant)
                            .combinedClickable(onClick = { onReact(key) }, onLongClick = { onWho(key) }).padding(horizontal = 8.dp, vertical = 3.dp),
                    ) { Text(key, fontSize = 13.sp); if (who.size > 1) Text(" ${who.size}", fontSize = 12.sp, color = scheme.onSurfaceVariant) }
                }
            }
        }
    }
}

@Composable
private fun ImageContent(msg: Msg, allowAuto: Boolean) {
    var tapped by remember(msg.id) { mutableStateOf(false) }
    val img = rememberMxcImage(msg.mxc, if (msg.sticker) 320 else 640, enabled = allowAuto || tapped || msg.status != STATUS_SENT)
    val ratio = if (msg.w != null && msg.h != null && msg.h > 0) (msg.w.toFloat() / msg.h).coerceIn(0.5f, 2f) else 4f / 3f
    val width = if (msg.sticker) 160.dp else 276.dp
    Box(
        Modifier.widthIn(max = width).fillMaxWidth().aspectRatio(ratio).clip(RoundedCornerShape(12.dp))
            .background(if (msg.sticker) Color.Transparent else Color.Black.copy(alpha = 0.15f)).let { if (img == null && !allowAuto && !tapped) it.clickable { tapped = true } else it },
        contentAlignment = Alignment.Center,
    ) {
        if (img != null) Image(img, msg.body, Modifier.fillMaxSize(), contentScale = if (msg.sticker) ContentScale.Fit else ContentScale.Crop)
        else Text(if (msg.status == STATUS_SENDING) "Sending…" else if (!allowAuto && !tapped) "Tap to load${msg.size?.let { " · ${humanSize(it)}" } ?: ""}" else "📷", fontSize = 14.sp)
    }
}

@Composable
private fun FileChip(icon: String, name: String, size: Long?, fg: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(icon, fontSize = 22.sp)
        Column(Modifier.padding(start = 10.dp)) {
            Text(name, color = fg, maxLines = 2, overflow = TextOverflow.Ellipsis)
            size?.takeIf { it > 0 }?.let { Text(humanSize(it), fontSize = 11.sp, color = fg.copy(alpha = 0.6f)) }
        }
    }
}

@Composable
private fun AudioContent(msg: Msg, fg: Color) {
    val store = LocalStore.current
    val playing by store.audio.playing.collectAsState()
    val on = playing == msg.id
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(34.dp).clip(CircleShape).background(fg.copy(alpha = 0.18f)), contentAlignment = Alignment.Center) { Text(if (on) "■" else "▶", color = fg, fontSize = 14.sp) }
        Text(
            msg.durationMs?.let { "  %d:%02d".format(it / 60000, (it / 1000) % 60) } ?: if (msg.voice) "  Voice message" else "  ${msg.body}",
            color = fg, fontSize = 14.sp,
        )
    }
}

@Composable
private fun LinkPreviewCard(url: String, fg: Color) {
    val store = LocalStore.current
    val uri = LocalUriHandler.current
    val p by produceState<LinkPreview?>(null, url) { value = store.preview(url) }
    val card = p ?: return
    Column(Modifier.padding(top = 6.dp).clip(RoundedCornerShape(10.dp)).background(fg.copy(alpha = 0.1f)).clickable { runCatching { uri.openUri(url) } }.padding(10.dp)) {
        card.site?.let { Text(it, fontSize = 11.sp, color = fg.copy(alpha = 0.65f)) }
        card.title?.let { Text(it, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, color = fg) }
        card.description?.let { Text(it, fontSize = 12.sp, maxLines = 3, overflow = TextOverflow.Ellipsis, color = fg.copy(alpha = 0.8f)) }
        val img = rememberMxcImage(card.imageMxc, 480)
        if (img != null) Image(img, null, Modifier.padding(top = 6.dp).fillMaxWidth().height(130.dp).clip(RoundedCornerShape(8.dp)), contentScale = ContentScale.Crop)
    }
}

fun humanSize(b: Long) = when {
    b >= 1 shl 20 -> "%.1f MB".format(b / 1048576.0)
    b >= 1 shl 10 -> "%d KB".format(b shr 10)
    else -> "$b B"
}

@Composable
private fun ActionsDialog(
    msg: Msg, mine: Boolean, starred: Boolean, quick: List<String>, onDismiss: () -> Unit, onReact: (String) -> Unit, onMore: () -> Unit,
    onReply: () -> Unit, onForward: () -> Unit, onCopy: () -> Unit, onStar: () -> Unit, onEdit: (() -> Unit)?, onDelete: (() -> Unit)?,
) {
    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = RoundedCornerShape(22.dp), color = MaterialTheme.colorScheme.surface) {
            Column(Modifier.padding(vertical = 8.dp)) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    quick.forEach { e -> Text(e, fontSize = 26.sp, modifier = Modifier.clip(CircleShape).clickable { onReact(e) }.padding(6.dp)) }
                    Text("＋", fontSize = 22.sp, color = MaterialTheme.colorScheme.primary, modifier = Modifier.clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant).clickable(onClick = onMore).padding(horizontal = 10.dp, vertical = 4.dp))
                }
                ActionRow("Reply", onReply)
                ActionRow("Forward", onForward)
                if (msg.type == "m.text" || msg.type == "m.notice" || msg.type == "m.emote") ActionRow("Copy text", onCopy)
                ActionRow(if (starred) "Remove star" else "Star", onStar)
                onEdit?.let { ActionRow("Edit", it) }
                onDelete?.let { ActionRow("Delete", it, danger = true) }
                if (!mine && onDelete == null && onEdit == null) Spacer(Modifier.height(2.dp))
            }
        }
    }
}

@Composable
private fun ActionRow(label: String, onClick: () -> Unit, danger: Boolean = false) {
    Text(label, color = if (danger) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 22.dp, vertical = 14.dp))
}

@Composable
private fun ImageViewer(msg: Msg, onClose: () -> Unit) {
    val store = LocalStore.current
    val scope = rememberCoroutineScope()
    val full = rememberMxcImage(msg.mxc, 0)
    var scale by remember { mutableStateOf(1f) }
    var offset by remember { mutableStateOf(androidx.compose.ui.geometry.Offset.Zero) }
    val state = rememberTransformableState { zoom, pan, _ ->
        scale = (scale * zoom).coerceIn(1f, 6f)
        offset = if (scale == 1f) androidx.compose.ui.geometry.Offset.Zero else offset + pan
    }
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black).clickable(onClick = onClose), contentAlignment = Alignment.Center) {
            if (full != null) Image(
                full, msg.body,
                Modifier.fillMaxSize().transformable(state).graphicsLayer { scaleX = scale; scaleY = scale; translationX = offset.x; translationY = offset.y },
                contentScale = ContentScale.Fit,
            ) else Text("Loading…", color = Color.White)
            Text("Open in another app", color = Color.White, fontSize = 13.sp,
                modifier = Modifier.align(Alignment.BottomCenter).padding(24.dp).clip(CircleShape).background(Color(0x66000000))
                    .clickable { scope.launch { msg.mxc?.let { store.media.open(it, msg.body.ifEmpty { "image" }, msg.mime) } } }.padding(horizontal = 16.dp, vertical = 8.dp))
        }
    }
}
