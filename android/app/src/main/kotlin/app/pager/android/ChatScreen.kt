@file:OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class, androidx.compose.material3.ExperimentalMaterial3Api::class)

package app.pager.android

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.provider.ContactsContract
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.EmojiEmotions
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.File
import java.text.DateFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.Date

private sealed interface Item {
    val key: String
    data class Day(val label: String, val date: LocalDate) : Item { override val key get() = "day-$date" }
    object Unread : Item { override val key get() = "unread-divider" }
    data class M(val msg: Msg, val index: Int, val first: Boolean, val last: Boolean) : Item { override val key get() = msg.id }
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
private fun buildItems(messages: List<Msg>, unreadBefore: String?, gapMs: Long): List<Item> {
    val out = ArrayList<Item>(messages.size + 8)
    var lastDay: LocalDate? = null
    messages.forEachIndexed { i, m ->
        val day = Instant.ofEpochMilli(m.ts).atZone(ZoneId.systemDefault()).toLocalDate()
        if (day != lastDay) { out.add(Item.Day(dayLabel(day), day)); lastDay = day }
        if (m.id == unreadBefore) out.add(Item.Unread)
        val prev = messages.getOrNull(i - 1)
        val next = messages.getOrNull(i + 1)
        val first = prev == null || prev.sender != m.sender || m.ts - prev.ts > gapMs || out.lastOrNull() is Item.Day || out.lastOrNull() is Item.Unread
        val nextDay = next?.let { Instant.ofEpochMilli(it.ts).atZone(ZoneId.systemDefault()).toLocalDate() }
        val last = next == null || next.sender != m.sender || next.ts - m.ts > gapMs || nextDay != day || next.id == unreadBefore
        out.add(Item.M(m, i, first, last))
    }
    out.reverse()
    return out
}

@Composable
fun ChatScreen(roomId: String, onBack: () -> Unit, onInfo: () -> Unit, onForward: (Msg) -> Unit, onSearch: () -> Unit, onSettings: (String) -> Unit) {
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
        r.filterKeys { it != me && !isBridgeBot(it) }.values.maxOfOrNull { id -> messages.indexOfFirst { it.id == id } } ?: -1
    }
    // Delivered = the bridge says it reached the other network (its bot sends that receipt).
    val deliveredIndex = remember(messages, chat?.receipts) {
        (chat?.receipts ?: emptyMap()).filterKeys { isBridgeBot(it) }.values.maxOfOrNull { id -> messages.indexOfFirst { it.id == id } } ?: -1
    }
    val group = remember(messages, chat?.memberCount, chat?.roomType) { (chat?.isGroup ?: false) || messages.map { it.sender }.toSet().size > 2 }
    val images = remember(messages) { messages.filter { it.type == "m.image" && it.mxc != null && !it.sticker } }

    // Where the unread messages begin; computed once when the chat opens.
    val unreadBefore = remember(roomId, chat != null) {
        val c = chat ?: return@remember null
        val read = c.receipts[me]
        val i = if (read != null) c.messages.indexOfFirst { it.id == read } else -1
        val fresh = if (i >= 0) c.messages.drop(i + 1) else if (c.unread > 0) c.messages.takeLast(c.unread) else emptyList()
        fresh.firstOrNull { it.sender != me }?.id
    }
    val items = remember(messages, unreadBefore, s.groupGapMin) { buildItems(messages, unreadBefore, s.groupGapMin * 60_000L) }

    val list = rememberLazyListState()
    // When someone starts typing and you are at the bottom, bring the dots into view.
    val typingNow = chat?.typing?.isNotEmpty() == true
    LaunchedEffect(typingNow) { if (typingNow && list.firstVisibleItemIndex <= 1) list.scrollToItem(0) }
    val scope = rememberCoroutineScope()
    val clipboard = LocalClipboardManager.current
    var text by remember(roomId) { mutableStateOf(store.draftFor(roomId)) }
    var replyTo by remember(roomId) { mutableStateOf<Msg?>(null) }
    var editing by remember(roomId) { mutableStateOf<Msg?>(null) }
    var actions by remember { mutableStateOf<Msg?>(null) }
    var selectable by remember { mutableStateOf<Msg?>(null) }
    var details by remember { mutableStateOf<Msg?>(null) }
    var viewerId by remember { mutableStateOf<String?>(null) }
    var attach by remember { mutableStateOf(false) }
    var gifSheet by remember { mutableStateOf(false) }
    var stickerSheet by remember { mutableStateOf(false) }
    var pollSheet by remember { mutableStateOf(false) }
    var emojiForText by remember { mutableStateOf(false) }
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
    val pickStickerImages = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris: List<Uri> -> if (uris.isNotEmpty()) scope.launch { store.addStickers(uris) } }
    var cameraUri by remember { mutableStateOf<Uri?>(null) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) cameraUri?.let { store.sendFile(roomId, it) } }
    val micPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok -> if (ok) recording = recorder.start() }
    val locationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { _ ->
        scope.launch { currentLocation(context)?.let { store.sendLocation(roomId, it.latitude, it.longitude) } }
    }
    val pickContact = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        val uri = res.data?.data ?: return@rememberLauncherForActivityResult
        context.contentResolver.query(uri, arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER, ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) store.sendContact(roomId, c.getString(1).orEmpty(), c.getString(0).orEmpty())
        }
    }

    val newestId = messages.lastOrNull()?.id
    val newestMine = messages.lastOrNull()?.sender == me
    var opened by remember(roomId) { mutableStateOf(false) }
    LaunchedEffect(newestId, unreadBefore) {
        if (!opened) {
            if (chat == null) return@LaunchedEffect
            opened = true
            val divider = if (s.openAtFirstUnread) items.indexOfFirst { it is Item.Unread } else -1
            if (divider >= 0) list.scrollToItem(divider) else list.scrollToItem(0)
        } else if (newestId != null && (newestMine || list.firstVisibleItemIndex <= 1)) { if (s.reduceMotion) list.scrollToItem(0) else list.animateScrollToItem(0) }
        if (s.markReadMode == "open" || (s.markReadMode == "scrolled" && list.firstVisibleItemIndex <= 2)) store.markRead(roomId)
    }
    LaunchedEffect(roomId, chat?.reachedStart) {
        snapshotFlow { list.layoutInfo.visibleItemsInfo.lastOrNull()?.index to list.layoutInfo.totalItemsCount }.collect { (last, total) ->
            if (last != null && total > 0 && last >= total - 6) store.loadOlder(roomId)
        }
    }
    LaunchedEffect(roomId, s.markReadMode) { if (s.markReadMode == "scrolled") snapshotFlow { list.firstVisibleItemIndex <= 1 }.collect { atEnd -> if (atEnd) store.markRead(roomId) } }
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
    val scheme = MaterialTheme.colorScheme

    Box(Modifier.fillMaxSize().background(scheme.background)) {
        Column(Modifier.fillMaxSize().imePadding()) {
            // Header
            Row(Modifier.fillMaxWidth().background(scheme.surface).padding(horizontal = 4.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                BackButton(onBack)
                Row(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).clickable(onClick = onInfo).padding(vertical = 2.dp, horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    val name = chat?.let { SyncReducer.displayName(it, me) } ?: "Opening…"
                    if (s.showAvatars) Avatar(name, if (s.showNetworkBadges) chat?.network else null, 40.dp, chat?.avatarMxc)
                    Column(Modifier.padding(start = 12.dp)) {
                        Text(name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        chat?.let {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.size(7.dp).clip(CircleShape).background(networkMeta(it.network).color))
                                Text(" ${networkMeta(it.network).label}${if (it.isGroup) " · ${it.peopleCount} members" else ""}", style = MaterialTheme.typography.labelMedium, color = scheme.onSurfaceVariant)
                            }
                        }
                    }
                }
                IconBtn(Icons.Rounded.Search, "Search in page", onSearch)
                IconBtn(Icons.Rounded.Info, "Page info", onInfo)
            }

            Box(Modifier.weight(1f).fillMaxWidth().let { if (wallpaper != null) it.background(wallpaper) else it }) {
                LazyColumn(Modifier.fillMaxSize(), state = list, reverseLayout = true, contentPadding = PaddingValues(horizontal = 12.dp, vertical = 10.dp)) {
                    // reverseLayout: the first item sits at the bottom, under the newest message.
                    if (chat?.typing.orEmpty().isNotEmpty()) item("typing") {
                        Column(Modifier.fillMaxWidth().padding(top = 6.dp)) {
                            if (group) Text(chat!!.typing.joinToString(", ") { chat!!.nameOf(it) }, style = MaterialTheme.typography.labelMedium, color = scheme.onSurfaceVariant, modifier = Modifier.padding(start = 14.dp, bottom = 2.dp))
                            Box(Modifier.clip(RoundedCornerShape(18.dp)).background(scheme.surface).padding(horizontal = 16.dp, vertical = 12.dp)) { TypingDots() }
                        }
                    }
                    items(items, key = { it.key }) { item ->
                        when (item) {
                            is Item.Day -> Box(Modifier.fillMaxWidth().padding(vertical = 12.dp), contentAlignment = Alignment.Center) {
                                Text(item.label, style = MaterialTheme.typography.labelMedium, color = scheme.onSurfaceVariant, modifier = Modifier.clip(CircleShape).background(scheme.surface.dim(0.9f)).padding(horizontal = 12.dp, vertical = 5.dp))
                            }
                            Item.Unread -> Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.weight(1f).height(1.dp).background(scheme.primary.dim(0.4f)))
                                Text("  New messages  ", style = MaterialTheme.typography.labelMedium, color = scheme.primary, fontWeight = FontWeight.SemiBold)
                                Box(Modifier.weight(1f).height(1.dp).background(scheme.primary.dim(0.4f)))
                            }
                            is Item.M -> MessageRow(
                                chat = chat, msg = item.msg, me = me, group = group, first = item.first, last = item.last, dark = dark,
                                reply = item.msg.replyTo?.let { byId[it] }, read = item.index <= readIndex, delivered = item.index <= deliveredIndex, starred = stars.any { it.eventId == item.msg.id },
                                onLong = { actions = item.msg },
                                onReact = { store.react(roomId, item.msg.id, it) },
                                onWho = { key -> whoFor = item.msg to key },
                                onDouble = { if (s.doubleTapReact) s.doubleTapEmoji.ifEmpty { s.quickReactions.firstOrNull().orEmpty() }.takeIf { it.isNotEmpty() }?.let { store.react(roomId, item.msg.id, it) } },
                                onTriple = { if (s.tripleTapReact) s.tripleTapEmoji.takeIf { it.isNotEmpty() }?.let { store.react(roomId, item.msg.id, it) } },
                                onReply = { replyTo = item.msg; editing = null },
                                onVote = { ids -> store.votePoll(roomId, item.msg.id, ids) },
                                onEndPoll = { store.endPoll(roomId, item.msg.id) },
                                onOpen = { m ->
                                    when {
                                        m.type == "m.location" && m.geo != null -> runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(m.geo)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                                        m.mxc == null -> {}
                                        m.type == "m.image" && !m.sticker -> viewerId = m.id
                                        m.type == "m.audio" -> scope.launch { store.audio.toggle(m.id, m.mxc) }
                                        m.type == "m.file" || m.type == "m.video" -> scope.launch { store.media.open(m.mxc, m.body.ifEmpty { "file" }, m.mime?.let { mt -> if (mt.contains("vcard")) "text/x-vcard" else mt }) }
                                    }
                                },
                            )
                        }
                    }
                }
                if (showJump) {
                    Box(
                        Modifier.align(Alignment.BottomEnd).padding(end = 16.dp, bottom = 12.dp).size(44.dp).clip(CircleShape).background(scheme.surface).clickable { scope.launch { list.animateScrollToItem(0) } },
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Rounded.KeyboardArrowDown, "Jump to latest", tint = scheme.onSurface) }
                }
            }

            replyTo?.let { r -> BannerBar("Replying to ${chat?.nameOf(r.sender) ?: ""}", previewOf(r)) { replyTo = null } }
            editing?.let { BannerBar("Editing message", it.body) { editing = null; text = "" } }

            // @mention suggestions
            val token = if (s.mentionSuggestions && group) Regex("(?:^|\\s)@([^\\s@]*)$").find(text)?.groupValues?.get(1) else null
            if (token != null) {
                val people = chat?.members?.filterKeys { it != me }?.filterValues { it.contains(token, ignoreCase = true) }?.entries?.take(12).orEmpty()
                if (people.isNotEmpty()) LazyRow(Modifier.fillMaxWidth().background(scheme.surface).padding(vertical = 6.dp), contentPadding = PaddingValues(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(people.toList()) { (id, name) ->
                        Row(Modifier.clip(CircleShape).background(scheme.surfaceVariant).clickable { text = text.dropLast(token.length + 1) + "@$name "; mentionIds[name] = id }.padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Avatar(name, null, 22.dp); Spacer(Modifier.width(6.dp)); Text(name, style = MaterialTheme.typography.labelLarge)
                        }
                    }
                }
            }

            // Composer
            Box(Modifier.fillMaxWidth().background(scheme.surface).navigationBarsPadding()) {
                if (recording) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        IconBtn(Icons.Rounded.Delete, "Cancel recording", { recorder.cancel(); recording = false }, tint = scheme.error)
                        Box(Modifier.size(10.dp).clip(CircleShape).background(Color(0xFFEF4444)))
                        Text("  Recording  %d:%02d".format(recordedMs / 60000, (recordedMs / 1000) % 60), Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
                        Box(Modifier.size(48.dp).clip(CircleShape).background(scheme.primary).clickable { recorder.stop()?.let { (f, ms) -> store.sendVoice(roomId, f, ms) }; recording = false }, contentAlignment = Alignment.Center) {
                            Icon(Icons.AutoMirrored.Rounded.Send, "Send voice message", tint = scheme.onPrimary)
                        }
                    }
                } else {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp), verticalAlignment = Alignment.Bottom) {
                        IconBtn(Icons.Rounded.Add, "Attach", { attach = true }, modifier = Modifier.padding(bottom = 4.dp), tint = scheme.primary, size = 44)
                        Row(Modifier.weight(1f).heightMin().clip(RoundedCornerShape(24.dp)).background(scheme.surfaceVariant).padding(start = 16.dp, end = 4.dp), verticalAlignment = Alignment.Bottom) {
                            Box(Modifier.weight(1f).padding(vertical = 12.dp)) {
                                if (text.isEmpty()) Text(chat?.let { "Message ${SyncReducer.displayName(it, me).substringBefore(' ')} · ${networkMeta(it.network).label}" } ?: "Message", color = scheme.onSurfaceVariant, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                BasicTextField(
                                    text, { text = it }, maxLines = 6, textStyle = MaterialTheme.typography.bodyLarge.copy(color = scheme.onSurface), cursorBrush = SolidColor(scheme.primary),
                                    keyboardOptions = KeyboardOptions(imeAction = if (s.enterSends) ImeAction.Send else ImeAction.Default), keyboardActions = KeyboardActions(onSend = { send() }),
                                    modifier = Modifier.fillMaxWidth().onPreviewKeyEvent { e ->
                                        // Hardware keyboards: Enter sends, Shift+Enter adds a new line.
                                        if (s.enterSends && e.type == androidx.compose.ui.input.key.KeyEventType.KeyDown && e.key == androidx.compose.ui.input.key.Key.Enter && !e.isShiftPressed) { if (text.isNotBlank()) send(); true } else false
                                    },
                                )
                            }
                            IconBtn(Icons.Rounded.EmojiEmotions, "Emoji", { emojiForText = true }, size = 44)
                        }
                        Spacer(Modifier.width(8.dp))
                        val hasText = text.isNotBlank()
                        Box(
                            Modifier.padding(bottom = 2.dp).size(48.dp).clip(CircleShape).background(scheme.primary)
                                .combinedClick(
                                    onClick = {
                                        if (hasText) send()
                                        else if (hasPermission(context, Manifest.permission.RECORD_AUDIO)) recording = recorder.start() else micPermission.launch(Manifest.permission.RECORD_AUDIO)
                                    },
                                    onLongClick = { if (hasText && editing == null) scheduleDialog = true },
                                ),
                            contentAlignment = Alignment.Center,
                        ) { Icon(if (hasText) Icons.AutoMirrored.Rounded.Send else Icons.Rounded.Mic, if (hasText) "Send (hold to schedule)" else "Record voice message", tint = scheme.onPrimary) }
                    }
                }
            }
        }
        ScreenEffects(messages, roomId)
    }

    // ---- Sheets & dialogs
    if (attach) AttachSheet(onDismiss = { attach = false }, onPick = { a ->
        attach = false
        when (a) {
            Attach.PHOTOS -> pickMedia.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo))
            Attach.CAMERA -> {
                val f = File(File(context.cacheDir, "media").apply { mkdirs() }, "camera-${System.currentTimeMillis()}.jpg")
                val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", f)
                cameraUri = uri; camera.launch(uri)
            }
            Attach.GIF -> gifSheet = true
            Attach.STICKERS -> stickerSheet = true
            Attach.EMOJI -> emojiForText = true
            Attach.FILE -> pickFile.launch("*/*")
            Attach.POLL -> pollSheet = true
            Attach.CONTACT -> pickContact.launch(Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI))
            Attach.LOCATION ->
                if (hasPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) || hasPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION))
                    scope.launch { currentLocation(context)?.let { store.sendLocation(roomId, it.latitude, it.longitude) } }
                else locationPermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
        }
    })
    if (gifSheet) GifSheet(onPick = { store.sendGif(roomId, it); gifSheet = false }, onSettings = { gifSheet = false; onSettings("media") }, onDismiss = { gifSheet = false })
    if (stickerSheet) StickerSheet(roomId, onPick = { store.sendSticker(roomId, it); stickerSheet = false }, onAdd = { pickStickerImages.launch("image/*") }, onDismiss = { stickerSheet = false })
    if (pollSheet) PollSheet(onCreate = { q, a, max, disclosed -> store.sendPoll(roomId, q, a, max, disclosed); pollSheet = false }, onDismiss = { pollSheet = false })
    if (emojiForText) EmojiPickerDialog(s.recentEmoji, onPick = { e -> text += e; emojiForText = false }, onDismiss = { emojiForText = false })

    selectable?.let { m ->
        AlertDialog(
            onDismissRequest = { selectable = null }, title = { Text("Select text") },
            text = { androidx.compose.foundation.text.selection.SelectionContainer { Text(m.body) } },
            confirmButton = { TextButton(onClick = { selectable = null }) { Text("Done") } },
        )
    }
    actions?.let { m ->
        val mine = m.sender == me
        ActionsSheet(
            msg = m, mine = mine, starred = stars.any { it.eventId == m.id }, quick = s.quickReactions, developer = s.developerMode, onDismiss = { actions = null },
            onReact = { store.react(roomId, m.id, it); actions = null },
            onSaveSticker = { store.saveAsSticker(m); actions = null },
            onMore = { pickerFor = m; actions = null },
            onReply = { replyTo = m; editing = null; actions = null },
            onForward = { onForward(m); actions = null },
            onCopy = { clipboard.setText(AnnotatedString(m.body)); actions = null },
            onStar = { store.toggleStar(roomId, m); actions = null },
            onEdit = if (mine && m.type == "m.text" && m.status == STATUS_SENT) ({ editing = m; replyTo = null; text = m.body; actions = null }) else null,
            onDelete = if (mine && m.status == STATUS_SENT) ({ actions = null; if (s.confirmDelete) confirmDelete = m else store.delete(roomId, m.id) }) else null,
            onInfo = { details = m; actions = null },
            onSave = m.mxc?.let { x -> {
                actions = null
                scope.launch {
                    val name = m.body.ifEmpty { "pager-${m.id.takeLast(6)}" }
                    val ok = if (m.type == "m.image") store.media.saveToGallery(x, name, m.mime) else store.media.saveToDownloads(x, name, m.mime)
                    // Older phones can't save without a permission: offer the share sheet, which includes "Save to device".
                    if (!ok && android.os.Build.VERSION.SDK_INT < 29) store.media.share(x, name, m.mime)
                    android.widget.Toast.makeText(context, if (ok) (if (m.type == "m.image") "Saved to your gallery" else "Saved to Downloads") else "Couldn't save that", android.widget.Toast.LENGTH_SHORT).show()
                }
            } },
            onOpen = m.mxc?.let { x -> { actions = null; scope.launch { if (!store.media.open(x, m.body.ifEmpty { "file" }, m.mime)) android.widget.Toast.makeText(context, "No app can open that", android.widget.Toast.LENGTH_SHORT).show() } } },
            onShare = if (m.mxc != null) ({ actions = null; scope.launch { store.media.share(m.mxc, m.body.ifEmpty { "file" }, m.mime) } })
                else ({ actions = null; context.startActivity(android.content.Intent.createChooser(android.content.Intent(android.content.Intent.ACTION_SEND).setType("text/plain").putExtra(android.content.Intent.EXTRA_TEXT, m.body), null).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)) }),
            onSelectText = { selectable = m; actions = null },
        )
    }
    details?.let { DetailsSheet(it, chat) { details = null } }
    pickerFor?.let { m -> EmojiPickerDialog(s.recentEmoji, onPick = { store.react(roomId, m.id, it); pickerFor = null }, onDismiss = { pickerFor = null }) }
    whoFor?.let { (m, key) ->
        val who = chat?.reactions?.get(m.id)?.get(key).orEmpty()
        Sheet({ whoFor = null }) {
            SheetTitle("$key  ${who.size}")
            who.forEach { u -> Row(Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) { Avatar(chat?.nameOf(u) ?: u, null, 36.dp); Spacer(Modifier.width(14.dp)); Text(if (u == me) "You" else chat?.nameOf(u) ?: u) } }
            if (me in who) SheetItem(Icons.Rounded.Close, "Remove my reaction", { store.react(roomId, m.id, key); whoFor = null })
        }
    }
    confirmDelete?.let { m ->
        AlertDialog(
            onDismissRequest = { confirmDelete = null }, title = { Text("Delete message?") },
            text = { Text("It will be removed for everyone in the page where the network allows it.") },
            confirmButton = { TextButton(onClick = { store.delete(roomId, m.id); confirmDelete = null }) { Text("Delete", color = scheme.error) } },
            dismissButton = { TextButton(onClick = { confirmDelete = null }) { Text("Cancel") } },
        )
    }
    if (scheduleDialog) WhenSheet("Send later", { at ->
        scheduleDialog = false
        val body = text.trim()
        scope.launch {
            val err = store.schedule(roomId, body, (at - System.currentTimeMillis()).coerceAtLeast(5_000))
            if (err == null) { text = ""; replyTo = null } else scheduleError = err
        }
    }, { scheduleDialog = false })
    scheduleError?.let { AlertDialog(onDismissRequest = { scheduleError = null }, title = { Text("Couldn't schedule") }, text = { Text(it) }, confirmButton = { TextButton(onClick = { scheduleError = null }) { Text("OK") } }) }
    viewerId?.let { id -> ImageViewer(images, id, senderName = { chat?.nameOf(it) ?: it }) { viewerId = null } }
}

@Composable
private fun Modifier.heightMin(): Modifier = this.then(Modifier.defaultMinSize(minHeight = 48.dp))

private fun Modifier.combinedClick(onClick: () -> Unit, onLongClick: () -> Unit) = this.then(Modifier.combinedClickable(onClick = onClick, onLongClick = onLongClick))

@Composable
private fun BannerBar(title: String, subtitle: String, onClose: () -> Unit) {
    Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).padding(start = 16.dp, end = 4.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.width(3.dp).height(36.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary))
        Column(Modifier.weight(1f).padding(start = 10.dp)) {
            Text(title, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
            Text(subtitle, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        IconBtn(Icons.Rounded.Close, "Dismiss", onClose)
    }
}
