@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class, androidx.compose.foundation.ExperimentalFoundationApi::class)

package app.pager.android

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Forward
import androidx.compose.material.icons.automirrored.rounded.Reply
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContactPage
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.OpenInNew
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.TextFields
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.EmojiEmotions
import androidx.compose.material.icons.rounded.Gif
import androidx.compose.material.icons.rounded.InsertDriveFile
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.PhotoCamera
import androidx.compose.material.icons.rounded.PhotoLibrary
import androidx.compose.material.icons.rounded.Poll
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.StarBorder
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.StickyNote2
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** What the + button offers, in a Google/Apple-Messages-style tile grid. */
enum class Attach(val label: String, val icon: ImageVector, val color: Color) {
    PHOTOS("Photos", Icons.Rounded.PhotoLibrary, Color(0xFF3B82F6)),
    CAMERA("Camera", Icons.Rounded.PhotoCamera, Color(0xFF6B7280)),
    GIF("GIF", Icons.Rounded.Gif, Color(0xFFEC4899)),
    STICKERS("Stickers", Icons.Rounded.StickyNote2, Color(0xFFF59E0B)),
    EMOJI("Emoji", Icons.Rounded.EmojiEmotions, Color(0xFFEAB308)),
    FILE("File", Icons.Rounded.InsertDriveFile, Color(0xFF14B8A6)),
    POLL("Poll", Icons.Rounded.Poll, Color(0xFF8B5CF6)),
    CONTACT("Contact", Icons.Rounded.ContactPage, Color(0xFF0EA5E9)),
    LOCATION("Location", Icons.Rounded.LocationOn, Color(0xFFEF4444)),
}

@Composable
fun AttachSheet(onPick: (Attach) -> Unit, onDismiss: () -> Unit) {
    Sheet(onDismiss) {
        val rows = Attach.entries.chunked(3)
        Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
            rows.forEach { row ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                    row.forEach { a ->
                        Column(Modifier.width(88.dp).clip(RoundedCornerShape(16.dp)).clickable { onPick(a) }.padding(vertical = 4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Box(Modifier.size(60.dp).clip(CircleShape).background(a.color), contentAlignment = Alignment.Center) { Icon(a.icon, a.label, tint = Color.White, modifier = Modifier.size(28.dp)) }
                            Text(a.label, style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 8.dp))
                        }
                    }
                }
            }
        }
    }
}

// ---- GIFs -------------------------------------------------------------------------------------

@Composable
fun GifSheet(onPick: (Gif) -> Unit, onSettings: () -> Unit, onDismiss: () -> Unit) {
    val store = LocalStore.current
    val s = LocalSettings.current
    val favorites by store.favoriteGifs.collectAsState()
    var tab by remember { mutableStateOf(if (favorites.isNotEmpty() || s.gifKey.isBlank()) "favorites" else "search") }
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<Gif>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    LaunchedEffect(query, s.gifKey, s.gifProvider, tab) {
        if (s.gifKey.isBlank() || tab != "search") return@LaunchedEffect
        delay(if (query.isEmpty()) 0 else 350)
        busy = true; error = null
        runCatching { store.gifs.search(s.gifProvider, s.gifKey, query.trim()) }.onSuccess { results = it }.onFailure { error = it.message; results = emptyList() }
        busy = false
    }
    Sheet(onDismiss) {
        Column(Modifier.heightIn(min = 420.dp, max = 560.dp).padding(horizontal = 16.dp)) {
            Row(Modifier.padding(bottom = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                androidx.compose.material3.FilterChip(selected = tab == "favorites", onClick = { tab = "favorites" }, label = { Text("Favorites" + if (favorites.isNotEmpty()) " (${favorites.size})" else "") })
                androidx.compose.material3.FilterChip(selected = tab == "search", onClick = { tab = "search" }, label = { Text("Search") })
            }
            val grid: @Composable (List<Gif>) -> Unit = { list ->
                LazyVerticalGrid(GridCells.Fixed(2), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxSize()) {
                    items(list, key = { it.id + it.url }) { g -> GifTile(g, starred = favorites.any { it.url == g.url }, onStar = { store.toggleFavoriteGif(g) }) { onPick(g) } }
                }
            }
            when {
                tab == "favorites" -> if (favorites.isEmpty()) EmptyState(Icons.Rounded.Gif, "No favorite GIFs yet", "Search for a GIF and tap the star to keep it here. Your favorites follow your account to every device.") else grid(favorites)
                s.gifKey.isBlank() -> EmptyState(Icons.Rounded.Gif, "Set up GIF search", "Add a free Giphy or Tenor API key in Settings → Stickers & GIFs. Pager doesn't ship a shared key.") { Button(onClick = onSettings) { Text("Open settings") } }
                else -> {
                    SearchPill(query, { query = it }, "Search ${if (s.gifProvider == "tenor") "Tenor" else "GIPHY"}")
                    Spacer(Modifier.height(10.dp))
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(8.dp)) }
                    if (busy && results.isEmpty()) Text("Loading…", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(8.dp))
                    grid(results)
                }
            }
        }
    }
}

@Composable
private fun GifTile(g: Gif, starred: Boolean, onStar: () -> Unit, onClick: () -> Unit) {
    val store = LocalStore.current
    val bmp by produceState<androidx.compose.ui.graphics.ImageBitmap?>(null, g.previewUrl) {
        value = runCatching { store.gifs.download(g.previewUrl).let { b -> BitmapFactory.decodeByteArray(b, 0, b.size)?.asImageBitmap() } }.getOrNull()
    }
    val ratio = if (g.w > 0 && g.h > 0) (g.w.toFloat() / g.h).coerceIn(0.6f, 2f) else 1.4f
    Box(Modifier.fillMaxWidth().aspectRatio(ratio).clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceVariant).clickable(onClick = onClick)) {
        bmp?.let { Image(it, g.title, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
        Box(Modifier.align(Alignment.TopEnd).padding(6.dp).size(32.dp).clip(CircleShape).background(Color(0x99000000)).clickable(onClick = onStar), contentAlignment = Alignment.Center) {
            Icon(if (starred) Icons.Rounded.Star else Icons.Rounded.StarBorder, if (starred) "Remove from favorites" else "Add to favorites", tint = Color(0xFFFFD54A), modifier = Modifier.size(20.dp))
        }
    }
}

// ---- Stickers -------------------------------------------------------------------------------------

@Composable
fun StickerSheet(roomId: String, onPick: (Sticker) -> Unit, onAdd: () -> Unit, onDismiss: () -> Unit) {
    val store = LocalStore.current
    val user by store.userStickers.collectAsState()
    val chats by store.chats.collectAsState()
    val packs = remember(user, chats[roomId]?.stickerPacks) { store.stickerPacks(roomId) }
    var tab by remember { mutableStateOf(0) }
    Sheet(onDismiss) {
        Column(Modifier.heightIn(min = 380.dp, max = 520.dp)) {
            if (packs.isEmpty()) EmptyState(Icons.Rounded.StickyNote2, "No stickers yet", "Add images from your photos and they become stickers you can send in any page.") { Button(onClick = onAdd) { Text("Add stickers") } }
            else {
                LazyRow(contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(packs.size) { i ->
                        val on = tab == i
                        Text(packs[i].name, color = if (on) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelLarge,
                            modifier = Modifier.clip(RoundedCornerShape(50)).background(if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant).clickable { tab = i }.padding(horizontal = 14.dp, vertical = 8.dp))
                    }
                    item { Box(Modifier.size(36.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant).clickable(onClick = onAdd), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.Add, "Add stickers", modifier = Modifier.size(20.dp)) } }
                }
                Spacer(Modifier.height(12.dp))
                val pack = packs.getOrNull(tab) ?: packs.first()
                LazyVerticalGrid(GridCells.Fixed(4), contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxSize()) {
                    items(pack.stickers, key = { it.shortcode + it.url }) { st ->
                        val img = rememberMxcImage(st.url, 256)
                        Box(Modifier.aspectRatio(1f).clip(RoundedCornerShape(12.dp)).clickable { onPick(st) }, contentAlignment = Alignment.Center) {
                            if (img != null) Image(img, st.body, Modifier.fillMaxSize().padding(4.dp), contentScale = ContentScale.Fit)
                        }
                    }
                }
            }
        }
    }
}

// ---- Poll creator -----------------------------------------------------------------------------------

@Composable
fun PollSheet(onCreate: (String, List<String>, Int, Boolean) -> Unit, onDismiss: () -> Unit) {
    var question by remember { mutableStateOf("") }
    val options = remember { mutableStateListOf("", "") }
    var multiple by remember { mutableStateOf(false) }
    var hidden by remember { mutableStateOf(false) }
    val valid = question.isNotBlank() && options.count { it.isNotBlank() } >= 2
    Sheet(onDismiss) {
        Column(Modifier.padding(horizontal = 24.dp).heightIn(max = 600.dp)) {
            Text("Create poll", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(bottom = 12.dp))
            OutlinedTextField(question, { question = it }, label = { Text("Question") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            Spacer(Modifier.height(8.dp))
            options.forEachIndexed { i, text ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(text, { options[i] = it }, label = { Text("Option ${i + 1}") }, modifier = Modifier.weight(1f).padding(vertical = 4.dp), singleLine = true, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next))
                    if (options.size > 2) IconBtn(Icons.Rounded.Close, "Remove option", { options.removeAt(i) })
                }
            }
            if (options.size < 10) TextButton(onClick = { options.add("") }) { Icon(Icons.Rounded.Add, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Add option") }
            Row(Modifier.fillMaxWidth().clickable { multiple = !multiple }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) { Text("Allow multiple answers", Modifier.weight(1f)); Switch(multiple, { multiple = it }) }
            Row(Modifier.fillMaxWidth().clickable { hidden = !hidden }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) { Text("Hide results until the poll ends", Modifier.weight(1f)); Switch(hidden, { hidden = it }) }
            Button(onClick = { val a = options.map { it.trim() }.filter { it.isNotEmpty() }; onCreate(question.trim(), a, if (multiple) a.size else 1, !hidden) }, enabled = valid, modifier = Modifier.fillMaxWidth().padding(top = 8.dp).height(50.dp)) { Text("Send poll") }
            Text("Polls work in Matrix and on networks whose bridge supports them (WhatsApp does).", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
        }
    }
}

// ---- Message actions ----------------------------------------------------------------------------------

@Composable
fun ActionsSheet(
    msg: Msg, mine: Boolean, starred: Boolean, quick: List<String>, developer: Boolean, onDismiss: () -> Unit, onReact: (String) -> Unit, onMore: () -> Unit,
    onReply: () -> Unit, onForward: () -> Unit, onCopy: () -> Unit, onStar: () -> Unit, onEdit: (() -> Unit)?, onDelete: (() -> Unit)?, onInfo: () -> Unit, onSaveSticker: (() -> Unit)? = null,
    onSave: (() -> Unit)? = null, onOpen: (() -> Unit)? = null, onShare: (() -> Unit)? = null, onSelectText: (() -> Unit)? = null,
) {
    Sheet(onDismiss) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            quick.forEach { e -> Box(Modifier.size(46.dp).clip(CircleShape).clickable { onReact(e) }, contentAlignment = Alignment.Center) { Text(e, fontSize = 26.sp) } }
            Box(Modifier.size(42.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant).clickable(onClick = onMore), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.Add, "More reactions", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        SheetItem(Icons.AutoMirrored.Rounded.Reply, "Reply", onReply)
        SheetItem(Icons.AutoMirrored.Rounded.Forward, "Forward", onForward)
        if (msg.type == "m.image" && msg.mxc != null) onSaveSticker?.let { SheetItem(Icons.Rounded.EmojiEmotions, "Save as sticker", it) }
        val isText = msg.type == "m.text" || msg.type == "m.notice" || msg.type == "m.emote"
        if (isText) SheetItem(Icons.Rounded.ContentCopy, "Copy text", onCopy)
        if (isText) onSelectText?.let { SheetItem(Icons.Rounded.TextFields, "Select text", it) }
        if (msg.mxc != null && !isText) {
            onSave?.let { SheetItem(Icons.Rounded.Download, if (msg.type == "m.image") "Save to gallery" else "Save to Downloads", it) }
            onOpen?.let { SheetItem(Icons.Rounded.OpenInNew, "Open", it) }
        }
        onShare?.let { SheetItem(Icons.Rounded.Share, if (isText) "Share text" else "Share", it) }
        SheetItem(if (starred) Icons.Rounded.Star else Icons.Rounded.StarBorder, if (starred) "Remove star" else "Star", onStar)
        onEdit?.let { SheetItem(Icons.Rounded.Edit, "Edit", it) }
        SheetItem(Icons.Rounded.Info, "Details", onInfo)
        onDelete?.let { SheetItem(Icons.Rounded.Delete, "Delete", it, danger = true) }
        if (developer) SheetItem(Icons.Rounded.Code, "Copy event ID", onInfo, hint = msg.id)
    }
}

@Composable
fun DetailsSheet(msg: Msg, chat: ChatState?, onDismiss: () -> Unit) {
    val fmt = remember { java.text.DateFormat.getDateTimeInstance(java.text.DateFormat.LONG, java.text.DateFormat.MEDIUM) }
    val me = LocalStore.current.me
    val mine = msg.sender == me && msg.status == STATUS_SENT
    val readers = if (mine && chat != null) chat.readersOf(msg.id, me) else emptyList()
    Sheet(onDismiss) {
        SheetTitle("Message details")
        listOf(
            "From" to (chat?.nameOf(msg.sender) ?: msg.sender),
            "Sent" to fmt.format(java.util.Date(msg.ts)),
            "Type" to msg.type,
            "Status" to when (msg.status) { STATUS_SENT -> "Sent"; STATUS_SENDING -> "Sending"; else -> "Failed" },
            "Size" to (msg.size?.takeIf { it > 0 }?.let { humanSize(it) } ?: "—"),
        ).plus(
            if (!mine) emptyList()
            else listOf("Read" to if (readers.isEmpty()) "Not yet" else readers.joinToString("\n") { (u, ts) -> (chat?.nameOf(u) ?: u) + (ts?.let { " · " + fmt.format(java.util.Date(it)) } ?: "") }),
        ).forEach { (k, v) ->
            Row(Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp)) { Text(k, Modifier.width(90.dp), color = MaterialTheme.colorScheme.onSurfaceVariant); Text(v) }
        }
        if (mine && chat != null && chat.network != "matrix") Text(
            "${networkMeta(chat.network).label} doesn't report delivery through the bridge. Pager shows when someone has read it.",
            Modifier.padding(horizontal = 24.dp, vertical = 8.dp), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (LocalSettings.current.developerMode) Row(Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp)) { Text("Event ID", Modifier.width(90.dp), color = MaterialTheme.colorScheme.onSurfaceVariant); Text(msg.id, style = MaterialTheme.typography.labelMedium) }
    }
}
