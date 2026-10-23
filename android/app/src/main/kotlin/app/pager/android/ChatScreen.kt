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
import androidx.compose.foundation.content.contentReceiver
import androidx.compose.foundation.content.consume
import androidx.compose.material.icons.automirrored.rounded.InsertDriveFile
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.produceState
import androidx.compose.ui.graphics.asImageBitmap
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import androidx.compose.material.icons.rounded.Videocam
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
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.isShiftPressed
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.border
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.Key
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
        val first = prev == null || prev.sender != m.sender || prev.room != m.room || m.ts - prev.ts > gapMs || out.lastOrNull() is Item.Day || out.lastOrNull() is Item.Unread
        val nextDay = next?.let { Instant.ofEpochMilli(it.ts).atZone(ZoneId.systemDefault()).toLocalDate() }
        val last = next == null || next.sender != m.sender || next.room != m.room || next.ts - m.ts > gapMs || nextDay != day || next.id == unreadBefore
        out.add(Item.M(m, i, first, last))
    }
    out.reverse()
    return out
}

@Composable
fun ChatScreen(roomId: String, onBack: () -> Unit, onOpen: (String) -> Unit, onInfo: () -> Unit, onForward: (Msg) -> Unit, onSearch: () -> Unit, onSettings: (String) -> Unit) {
    val store = LocalStore.current
    val s = LocalSettings.current
    val context = LocalContext.current
    val chat by remember(roomId) { store.chatMerged(roomId) }.collectAsState(null)
    // A person on several networks reads as one conversation: every chat in their group, in time order, unless you picked one network.
    val links by store.links.collectAsState()
    val allChats by store.chats.collectAsState()
    val solo by store.solo.collectAsState()
    val groupIds = Links.groupOf(links, roomId)?.filter { it in allChats }.orEmpty().ifEmpty { listOf(roomId) }
    val merged = groupIds.size > 1 && roomId !in solo
    var via by remember(roomId) { mutableStateOf<String?>(null) }
    val sendRoom = if (merged) (via?.takeIf { it in groupIds } ?: chat?.messages?.lastOrNull()?.room ?: roomId) else roomId
    val me = store.session.collectAsState().value?.userId ?: ""
    val stars by store.stars.collectAsState()
    val messages = chat?.messages ?: emptyList()
    val byId = remember(messages) { messages.associateBy { it.id } }
    val readIndex = remember(messages, chat?.receipts) {
        val r = chat?.receipts ?: emptyMap()
        r.filterKeys { it != me && !isBridgeBot(it) }.values.maxOfOrNull { id -> messages.indexOfFirst { it.id == id } } ?: -1
    }
    // Delivered = the bridge says it reached the other network (its bot sends that receipt).
    val deliveredIndex = remember(messages, chat?.receipts, chat?.deliveredTo, chat?.statusSeen) {
        // Once the bridge reports deliveries in this chat, only those count (its own receipt then just means "sent"); until then its receipt is the best we have.
        if (chat?.statusSeen == true) (chat?.deliveredTo?.keys.orEmpty()).maxOfOrNull { id -> messages.indexOfFirst { it.id == id } } ?: -1
        else (chat?.receipts ?: emptyMap()).filterKeys { isBridgeBot(it) }.values.maxOfOrNull { id -> messages.indexOfFirst { it.id == id } } ?: -1
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
    // Tapping the quote on a reply takes you to the message it answers, loading older messages first when it is further back.
    var flashId by remember { mutableStateOf<String?>(null) }
    val itemsNow by androidx.compose.runtime.rememberUpdatedState(items)

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
    // Keypad phones: the d-pad picks a message (Up/Down), the center key opens its actions, and typing starts at once.
    val keypad = LocalKeypad.current
    var selId by remember(roomId) { mutableStateOf<String?>(null) }
    val composerFocus = remember { FocusRequester() }
    LaunchedEffect(roomId, keypad) { if (keypad) { kotlinx.coroutines.delay(400); runCatching { composerFocus.requestFocus() } } }
    BackHandler(enabled = selId != null) { selId = null }
    var selectable by remember { mutableStateOf<Msg?>(null) }
    var details by remember { mutableStateOf<Msg?>(null) }
    var viewerId by remember { mutableStateOf<String?>(null) }
    var attach by remember { mutableStateOf(false) }
    var gifSheet by remember { mutableStateOf(false) }
    var stickerSheet by remember { mutableStateOf(false) }
    var pollSheet by remember { mutableStateOf(false) }
    var attentionSheet by remember { mutableStateOf(false) }
    val pickAttentionPicture = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> if (uri != null) store.sendFile(sendRoom, uri, caption = "\uD83D\uDD14 Look at this!", attention = "image") }
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
    // Push to talk: hold the microphone to record and let go to send; slide to the left to cancel. A quick tap keeps recording until you press send.
    var holding by remember { mutableStateOf(false) }
    var holdCancel by remember { mutableStateOf(false) }
    var lastGesture by remember { mutableStateOf(0L) }
    var composerCoords by remember { mutableStateOf<androidx.compose.ui.layout.LayoutCoordinates?>(null) }
    var micCoords by remember { mutableStateOf<androidx.compose.ui.layout.LayoutCoordinates?>(null) }

    val currentText by rememberUpdatedState(text)
    val currentEditing by rememberUpdatedState(editing)
    DisposableEffect(roomId) { onDispose { if (currentEditing == null) store.setDraft(roomId, currentText); store.typing(roomId, false); recorder.cancel() } }
    LaunchedEffect(text) {
        if (text.isNotBlank()) store.typing(sendRoom, true) else store.typing(roomId, false)
        delay(500)
        if (editing == null) store.setDraft(roomId, text)
    }
    LaunchedEffect(recording) { while (recording) { recordedMs = recorder.elapsedMs; delay(200) } }

    // Pictures, videos, files and GIFs wait in the message box until you press send, so you can add more and write something with them.
    val staged = remember(roomId) { mutableStateListOf<StagedItem>() }
    fun stage(uri: Uri, viewOnce: Boolean = false) { val p = store.describe(uri); staged.add(StagedItem(uri = uri, name = p.name, mime = p.mime, viewOnce = viewOnce)) }
    var onceNext by remember { mutableStateOf(false) } // the next pictures go out as view-once
    val pickMedia = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(8)) { uris: List<Uri> -> val once = onceNext; onceNext = false; uris.forEach { stage(it, once) } }
    val pickFile = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris: List<Uri> -> uris.forEach { stage(it) } }
    val pickStickerImages = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris: List<Uri> -> if (uris.isNotEmpty()) scope.launch { store.addStickers(uris) } }
    var cameraUri by remember { mutableStateOf<Uri?>(null) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) cameraUri?.let { stage(it) } }
    val micPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok -> if (ok) recording = recorder.start() }
    val locationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { _ ->
        scope.launch { currentLocation(context)?.let { store.sendLocation(sendRoom, it.latitude, it.longitude) } }
    }
    val pickContact = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        val uri = res.data?.data ?: return@rememberLauncherForActivityResult
        context.contentResolver.query(uri, arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER, ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) store.sendContact(sendRoom, c.getString(1).orEmpty(), c.getString(0).orEmpty())
        }
    }

    val newestId = messages.lastOrNull()?.id
    val newestMine = messages.lastOrNull()?.sender == me
    var opened by remember(roomId) { mutableStateOf(false) }
    LaunchedEffect(newestId, unreadBefore) {
        if (!opened) {
            if (chat == null) return@LaunchedEffect
            opened = true
            val divider = if (s.openAtUnread) items.indexOfFirst { it is Item.Unread } else -1
            if (divider >= 0) list.scrollToItem(divider) else list.scrollToItem(0)
        // (a day label, a typing row or an unread line can sit above the old newest message, so a few items from the end still counts)
        } else if (newestId != null && (newestMine || list.firstVisibleItemIndex <= 4)) { if (s.reduceMotion) list.scrollToItem(0) else list.animateScrollToItem(0) }
        // Only while the app is on screen: a message that arrives while the phone is in your pocket with this page open is not read yet.
        if (store.attended && (s.markReadMode == "open" || (s.markReadMode == "scrolled" && list.firstVisibleItemIndex <= 2))) store.markRead(roomId)
    }
    LaunchedEffect(roomId) {
        snapshotFlow { list.firstVisibleItemIndex > 4 }.collect { up -> groupIds.forEach { id -> store.readingOlder(id, up) } }
    }
    DisposableEffect(roomId) { onDispose { groupIds.forEach { id -> store.readingOlder(id, false) } } }
    LaunchedEffect(roomId, chat?.reachedStart) {
        snapshotFlow { list.layoutInfo.visibleItemsInfo.lastOrNull()?.index to list.layoutInfo.totalItemsCount }.collect { (last, total) ->
            if (last != null && total > 0 && last >= total - 6) groupIds.forEach { id -> store.loadOlder(id) }
        }
    }
    // An empty or short chat never scrolls, so the "near the top" check above never fires and its history would stay blank until a message
    // arrived. Ask for older messages directly whenever there are few to show.
    val fewMessages = chat?.let { !it.reachedStart && it.messages.size < 30 } == true
    LaunchedEffect(roomId, fewMessages, chat?.messages?.size) { if (fewMessages) groupIds.forEach { id -> store.loadOlder(id) } }
    LaunchedEffect(roomId, s.markReadMode) { if (s.markReadMode == "scrolled") snapshotFlow { list.firstVisibleItemIndex <= 1 }.collect { atEnd -> if (atEnd && store.attended) store.markRead(roomId) } }
    // Coming back to the phone after it sat idle: what arrived meanwhile is read now.
    val interacting by store.interacting.collectAsState()
    LaunchedEffect(roomId, interacting, s.markReadMode) { if (interacting && store.appInForeground && (s.markReadMode == "open" || (s.markReadMode == "scrolled" && list.firstVisibleItemIndex <= 2))) store.markRead(roomId) }
    val showJump by remember { derivedStateOf { list.firstVisibleItemIndex > 3 } }

    fun send() {
        val body = text.trim()
        if (body.isEmpty() && (staged.isEmpty() || editing != null)) return
        if (staged.isNotEmpty() && editing == null) {
            // The words go with the first item; the rest follow on their own.
            staged.toList().forEachIndexed { i, x ->
                val cap = if (i == 0 && body.isNotEmpty()) body else null
                if (x.gif != null) store.sendGif(sendRoom, x.gif, cap) else x.uri?.let { store.sendFile(sendRoom, it, x.viewOnce, cap) }
            }
            staged.clear(); text = ""; replyTo = null; mentionIds.clear(); store.setDraft(roomId, "")
            return
        }
        val e = editing
        if (e != null) store.edit(roomId, e.id, body)
        else store.send(sendRoom, body, replyTo?.id, mentionIds.filterKeys { body.contains("@$it") }.values.toList())
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
                var switcher by remember { mutableStateOf(false) }
                Box(Modifier.weight(1f)) {
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).dpadFocus().clickable { if (groupIds.size > 1) switcher = true else onInfo() }.padding(vertical = 2.dp, horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    // A page that never arrives (removed, or you left it) must say so instead of waiting forever.
                    var gaveUp by remember(roomId) { mutableStateOf(false) }
                    LaunchedEffect(roomId, chat == null) { gaveUp = false; if (chat == null) { kotlinx.coroutines.delay(12_000); gaveUp = true } }
                    val name = chat?.let { SyncReducer.displayName(it, me) } ?: if (gaveUp) "Couldn't open this page" else "Opening…"
                    if (s.showAvatars) ChatAvatar(name, if (s.showNetworkBadges) chat?.network else null, 40.dp, chat?.avatarMxc, chat?.takeIf { it.isGroup }?.let { groupFaces(it, me) }.orEmpty())
                    Column(Modifier.padding(start = 12.dp)) {
                        Text(name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        chat?.let {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.size(7.dp).clip(CircleShape).background(networkMeta(it.network).color))
                                Text(" ${if (merged) "${groupIds.size} networks together" else networkMeta(it.network).label}${if (it.isGroup) " · ${it.peopleCount} members" else ""}${if (it.encrypted) " · \uD83D\uDD12 Encrypted" else ""}", style = MaterialTheme.typography.labelMedium, color = scheme.onSurfaceVariant)
                            }
                        }
                    }
                }
                androidx.compose.material3.DropdownMenu(expanded = switcher, onDismissRequest = { switcher = false }) {
                    Text("Show", style = MaterialTheme.typography.labelMedium, color = scheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
                    androidx.compose.material3.DropdownMenuItem(text = { Text("All, ${groupIds.size} chats together" + if (merged) "  ✓" else "") }, onClick = { store.setSolo(roomId, false); switcher = false })
                    groupIds.forEach { id ->
                        val c = allChats[id]; val n = networkMeta(c?.network ?: "matrix"); val here = !merged && id == roomId
                        androidx.compose.material3.DropdownMenuItem(
                            leadingIcon = { Box(Modifier.size(9.dp).clip(CircleShape).background(n.color)) },
                            text = { Text(n.label + if (here) "  ✓" else if ((c?.unread ?: 0) > 0) "  ${c?.unread}" else "") },
                            onClick = { store.setSolo(id, true); switcher = false; if (id != roomId) onOpen(id) },
                        )
                    }
                }
                }
                IconBtn(Icons.Rounded.Search, "Search in page", onSearch)
                IconBtn(Icons.Rounded.Info, "Page info", onInfo)
            }
            LinkedBar(roomId, onOpen)

            Box(Modifier.weight(1f).fillMaxWidth().let { if (wallpaper != null) it.background(wallpaper) else it }) {
                if (s.wallpaper == "custom") {
                    val photo = remember(s.wallpaper) { WallpaperPhoto.load(context) }
                    if (photo != null) androidx.compose.foundation.Image(photo, null, Modifier.fillMaxSize(), contentScale = androidx.compose.ui.layout.ContentScale.Crop)
                }
                if (s.wallpaperDim > 0 && s.wallpaper != "none") Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = s.wallpaperDim.coerceAtMost(70) / 100f)))
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
                            is Item.M -> Box(if (selId == item.msg.id || flashId == item.msg.id) Modifier.border(3.dp, scheme.primary, RoundedCornerShape(16.dp)) else Modifier) { MessageRow(
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
                                onJump = { target -> scope.launch { repeat(14) { val at = itemsNow.indexOfFirst { it is Item.M && it.msg.id == target }; if (at >= 0) { list.animateScrollToItem(at + (if (typingNow) 1 else 0)); flashId = target; delay(1800); flashId = null; return@launch }; groupIds.forEach { store.loadOlder(it) }; delay(450) } } },
                                onOpen = { m ->
                                    when {
                                        m.type == "m.location" && m.geo != null -> runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(m.geo)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                                        m.mxc == null -> {}
                                        m.type == "m.image" && !m.sticker -> viewerId = m.id
                                        m.type == "m.audio" -> scope.launch { store.audio.toggle(m.id, m.mxc) }
                                        m.type == "m.file" || m.type == "m.video" -> scope.launch { store.media.open(m.mxc, m.body.ifEmpty { "file" }, m.mime?.let { mt -> if (mt.contains("vcard")) "text/x-vcard" else mt }) }
                                    }
                                },
                            ) }
                        }
                    }
                }
                if (showJump) {
                    Box(
                        Modifier.align(Alignment.BottomEnd).padding(end = 16.dp, bottom = 12.dp).size(44.dp).clip(CircleShape).background(scheme.surface).dpadFocus().clickable { scope.launch { list.animateScrollToItem(0) } },
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
                        Row(Modifier.clip(CircleShape).background(scheme.surfaceVariant).dpadFocus().clickable { text = text.dropLast(token.length + 1) + "@$name "; mentionIds[name] = id }.padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Avatar(name, null, 22.dp); Spacer(Modifier.width(6.dp)); Text(name, style = MaterialTheme.typography.labelLarge)
                        }
                    }
                }
            }

            if (merged) ViaPick(groupIds, sendRoom) { via = it }
            // Composer
            val canHold by rememberUpdatedState(text.isBlank() && (staged.isEmpty() || editing != null) && !recording && hasPermission(context, Manifest.permission.RECORD_AUDIO))
            Box(Modifier.fillMaxWidth().background(scheme.surface).navigationBarsPadding()
                .onGloballyPositioned { composerCoords = it }
                .pointerInput(Unit) {
                    awaitEachGesture {
                        val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                        val box = composerCoords?.let { c -> micCoords?.takeIf { it.isAttached }?.let { m -> c.localBoundingBoxOf(m) } }
                        if (!canHold || box == null || !box.contains(down.position)) return@awaitEachGesture
                        lastGesture = System.currentTimeMillis()
                        if (!recorder.start()) return@awaitEachGesture
                        recording = true; holding = true; holdCancel = false
                        val began = System.currentTimeMillis()
                        var dx = 0f
                        while (true) {
                            val change = awaitPointerEvent(PointerEventPass.Initial).changes.firstOrNull() ?: break
                            dx = change.position.x - down.position.x
                            holdCancel = dx < -80.dp.toPx()
                            if (!change.pressed) break
                        }
                        holding = false
                        if (System.currentTimeMillis() - began > 450) {
                            if (holdCancel) recorder.cancel() else recorder.stop()?.let { (f, ms) -> store.sendVoice(sendRoom, f, ms) }
                            recording = false; holdCancel = false
                        }
                    }
                }) {
                if (recording) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        IconBtn(Icons.Rounded.Delete, "Cancel recording", { recorder.cancel(); recording = false }, tint = scheme.error)
                        Box(Modifier.size(10.dp).clip(CircleShape).background(Color(0xFFEF4444)))
                        Text(if (holding && holdCancel) "  Let go to cancel" else "  Recording  %d:%02d".format(recordedMs / 60000, (recordedMs / 1000) % 60) + if (holding) "  ·  let go to send, slide left to cancel" else "", Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
                        Box(Modifier.size(48.dp).clip(CircleShape).background(scheme.primary).dpadFocus().clickable { recorder.stop()?.let { (f, ms) -> store.sendVoice(sendRoom, f, ms) }; recording = false }, contentAlignment = Alignment.Center) {
                            Icon(Icons.AutoMirrored.Rounded.Send, "Send voice message", tint = scheme.onPrimary)
                        }
                    }
                } else {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp), verticalAlignment = Alignment.Bottom) {
                        IconBtn(Icons.Rounded.Add, "Attach", { attach = true }, modifier = Modifier.padding(bottom = 4.dp), tint = scheme.primary, size = 44)
                        // One rounded card holds what is waiting to be sent, the text, and the send button.
                        Column(Modifier.weight(1f).clip(RoundedCornerShape(24.dp)).background(scheme.surfaceVariant)) {
                        if (staged.isNotEmpty() && editing == null) StagedTray(staged)
                        Row(Modifier.fillMaxWidth().heightMin().padding(start = 16.dp, end = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.Bottom) {
                            Box(Modifier.weight(1f).padding(vertical = 12.dp)) {
                                if (text.isEmpty()) Text(if (staged.isNotEmpty() && editing == null) "Add a message…" else chat?.let { "Message ${SyncReducer.displayName(it, me).substringBefore(' ')} · ${networkMeta(it.network).label}" } ?: "Message", color = scheme.onSurfaceVariant, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                BasicTextField(
                                    text, { text = it }, maxLines = 6, textStyle = MaterialTheme.typography.bodyLarge.copy(color = scheme.onSurface), cursorBrush = SolidColor(scheme.primary),
                                    keyboardOptions = KeyboardOptions(imeAction = if (s.enterSends) ImeAction.Send else ImeAction.Default), keyboardActions = KeyboardActions(onSend = { send() }),
                                    modifier = Modifier.fillMaxWidth().focusRequester(composerFocus)
                                        // Pictures, GIFs and other files pasted or sent from the keyboard wait in the message box too.
                                        .contentReceiver(object : androidx.compose.foundation.content.ReceiveContentListener {
                                            override fun onReceive(transferableContent: androidx.compose.foundation.content.TransferableContent): androidx.compose.foundation.content.TransferableContent? =
                                                transferableContent.consume { item -> val u = item.uri; if (u != null && editing == null) { stage(u); true } else false }
                                        })
                                        .onPreviewKeyEvent { e ->
                                        if (keypad && e.type == KeyEventType.KeyDown && text.isEmpty()) {
                                            val ids = messages.map { it.id }
                                            val at = ids.indexOf(selId)
                                            fun pick(id: String?) {
                                                selId = id
                                                if (id == null) scope.launch { list.animateScrollToItem(0) }
                                                else scope.launch { val i = items.indexOfFirst { it is Item.M && it.msg.id == id }; if (i >= 0) list.animateScrollToItem(i + (if (typingNow) 1 else 0)) }
                                            }
                                            when (e.key) {
                                                Key.DirectionUp -> { if (ids.isNotEmpty()) pick(if (at < 0) ids.last() else ids[maxOf(0, at - 1)]); return@onPreviewKeyEvent true }
                                                Key.DirectionDown -> { if (selId != null) pick(if (at < 0 || at >= ids.lastIndex) null else ids[at + 1]); return@onPreviewKeyEvent selId != null || at >= 0 }
                                                Key.DirectionCenter, Key.Enter -> if (selId != null) { messages.firstOrNull { it.id == selId }?.let { actions = it }; return@onPreviewKeyEvent true }
                                            }
                                        }
                                        // Hardware keyboards: Enter sends, Shift+Enter adds a new line.
                                        if (s.enterSends && e.type == androidx.compose.ui.input.key.KeyEventType.KeyDown && e.key == androidx.compose.ui.input.key.Key.Enter && !e.isShiftPressed) { if (text.isNotBlank()) send(); true } else false
                                    },
                                )
                            }
                            IconBtn(Icons.Rounded.EmojiEmotions, "Emoji", { emojiForText = true }, size = 44)
                        Spacer(Modifier.width(2.dp))
                        val hasText = text.isNotBlank() || (staged.isNotEmpty() && editing == null)
                        Box(
                            Modifier.padding(bottom = 4.dp).size(40.dp).clip(CircleShape).background(scheme.primary)
                                .onGloballyPositioned { micCoords = it }
                                .dpadFocus().combinedClick(
                                    onClick = {
                                        if (hasText) send()
                                        else if (System.currentTimeMillis() - lastGesture < 1500 && hasPermission(context, Manifest.permission.RECORD_AUDIO)) Unit // the press already started recording
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
            }
        }
        ScreenEffects(messages, roomId)
    }

    // ---- Sheets & dialogs
    if (attach) AttachSheet(canViewOnce = chat?.network == "signal", onDismiss = { attach = false }, onPick = { a ->
        attach = false
        when (a) {
            Attach.VIEWONCE -> { onceNext = true; pickMedia.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo)) }
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
            Attach.ATTENTION -> attentionSheet = true
            Attach.CONTACT -> pickContact.launch(Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI))
            Attach.LOCATION ->
                if (hasPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) || hasPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION))
                    scope.launch { currentLocation(context)?.let { store.sendLocation(sendRoom, it.latitude, it.longitude) } }
                else locationPermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
        }
    })
    if (gifSheet) GifSheet(onPick = { staged.add(StagedItem(gif = it, name = "${it.title.ifBlank { "GIF" }}", mime = "image/gif")); gifSheet = false }, onSettings = { gifSheet = false; onSettings("media") }, onDismiss = { gifSheet = false })
    if (stickerSheet) StickerSheet(roomId, onPick = { store.sendSticker(sendRoom, it); stickerSheet = false }, onAdd = { pickStickerImages.launch("image/*") }, onDismiss = { stickerSheet = false })
    if (attentionSheet) AttentionSheet(onSend = { store.sendAttention(sendRoom, it); attentionSheet = false }, onPicture = { attentionSheet = false; pickAttentionPicture.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, onDismiss = { attentionSheet = false })
    if (pollSheet) PollSheet(onCreate = { q, a, max, disclosed -> store.sendPoll(sendRoom, q, a, max, disclosed); pollSheet = false }, onDismiss = { pollSheet = false })
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
            val err = store.schedule(sendRoom, body, (at - System.currentTimeMillis()).coerceAtLeast(5_000))
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


/** Something waiting in the message box to be sent: a file from the phone, or a GIF. */
data class StagedItem(val uri: Uri? = null, val gif: Gif? = null, val name: String, val mime: String, val viewOnce: Boolean = false, val id: Long = System.nanoTime())

/** A small preview of a staged picture or video; other files get an icon. */
@Composable
private fun StagedThumb(item: StagedItem, onRemove: () -> Unit) {
    val context = LocalContext.current
    val scheme = MaterialTheme.colorScheme
    val thumb by produceState<androidx.compose.ui.graphics.ImageBitmap?>(null, item.id) {
        val uri = item.uri ?: return@produceState
        value = withContext(Dispatchers.IO) {
            runCatching {
                when {
                    item.mime.startsWith("image/") -> {
                        val o = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
                        context.contentResolver.openInputStream(uri)?.use { android.graphics.BitmapFactory.decodeStream(it, null, o) }
                        var sample = 1
                        while (o.outWidth / (sample * 2) >= 240 && o.outHeight / (sample * 2) >= 240) sample *= 2
                        context.contentResolver.openInputStream(uri)?.use { android.graphics.BitmapFactory.decodeStream(it, null, android.graphics.BitmapFactory.Options().apply { inSampleSize = sample }) }?.asImageBitmap()
                    }
                    item.mime.startsWith("video/") -> android.media.MediaMetadataRetriever().let { r -> try { r.setDataSource(context, uri); r.getFrameAtTime(0)?.asImageBitmap() } finally { r.release() } }
                    else -> null
                }
            }.getOrNull()
        }
    }
    Box(Modifier.size(68.dp).clip(RoundedCornerShape(12.dp)).background(scheme.surface), contentAlignment = Alignment.Center) {
        val t = thumb
        if (t != null) androidx.compose.foundation.Image(t, item.name, Modifier.fillMaxSize(), contentScale = androidx.compose.ui.layout.ContentScale.Crop)
        else Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(4.dp)) {
            Icon(if (item.gif != null) Icons.Rounded.EmojiEmotions else Icons.AutoMirrored.Rounded.InsertDriveFile, null, tint = scheme.onSurfaceVariant)
            Text(item.name, style = MaterialTheme.typography.labelSmall, maxLines = 2, overflow = TextOverflow.Ellipsis, color = scheme.onSurfaceVariant)
        }
        if (item.mime.startsWith("video/")) Icon(Icons.Rounded.Videocam, null, tint = Color.White, modifier = Modifier.align(Alignment.BottomStart).padding(4.dp).size(16.dp))
        if (item.gif != null || item.mime == "image/gif") Text("GIF", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.align(Alignment.BottomStart).padding(4.dp).background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(6.dp)).padding(horizontal = 4.dp))
        Box(Modifier.align(Alignment.TopEnd).padding(3.dp).size(22.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.65f)).clickable(onClick = onRemove), contentAlignment = Alignment.Center) {
            Icon(Icons.Rounded.Close, "Remove ${item.name}", tint = Color.White, modifier = Modifier.size(14.dp))
        }
    }
}

@Composable
private fun StagedTray(items: androidx.compose.runtime.snapshots.SnapshotStateList<StagedItem>) {
    LazyRow(Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, top = 12.dp, bottom = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(items.toList(), key = { it.id }) { x -> StagedThumb(x) { items.remove(x) } }
    }
}
