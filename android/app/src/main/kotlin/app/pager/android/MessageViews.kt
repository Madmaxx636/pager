@file:OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package app.pager.android

import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.foundation.border
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.runtime.LaunchedEffect
import android.graphics.ImageDecoder
import android.graphics.drawable.AnimatedImageDrawable
import android.os.Build
import android.widget.ImageView
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Reply
import androidx.compose.material.icons.rounded.AccessTime
import androidx.compose.material.icons.rounded.CheckBox
import androidx.compose.material.icons.rounded.CheckBoxOutlineBlank
import androidx.compose.material.icons.rounded.Contacts
import androidx.compose.material.icons.rounded.Done
import androidx.compose.material.icons.rounded.DoneAll
import androidx.compose.material.icons.rounded.Error
import androidx.compose.material.icons.rounded.Gif
import androidx.compose.material.icons.rounded.InsertDriveFile
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.RadioButtonChecked
import androidx.compose.material.icons.rounded.RadioButtonUnchecked
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.Videocam
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.composed
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.launch
import java.io.File
import java.text.DateFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt

// ---- Small helpers -----------------------------------------------------------------------

private val timeSystem = ThreadLocal.withInitial { DateFormat.getTimeInstance(DateFormat.SHORT) }
private val time12 = ThreadLocal.withInitial { SimpleDateFormat("h:mm a", Locale.getDefault()) }
private val time24 = ThreadLocal.withInitial { SimpleDateFormat("HH:mm", Locale.getDefault()) }
fun formatClock(ts: Long, mode: String): String = when (mode) {
    "12" -> time12.get()!!.format(Date(ts))
    "24" -> time24.get()!!.format(Date(ts))
    else -> timeSystem.get()!!.format(Date(ts))
}

fun humanSize(b: Long) = when {
    b >= 1 shl 20 -> "%.1f MB".format(b / 1048576.0)
    b >= 1 shl 10 -> "%d KB".format(b shr 10)
    else -> "$b B"
}

private val URL_REGEX = android.util.Patterns.WEB_URL.toRegex()
fun firstUrl(text: String): String? = URL_REGEX.find(text)?.value?.let { if (it.startsWith("http")) it else "https://$it" }

fun senderColor(name: String, dark: Boolean) =
    Color.hsv(hueOf(name), if (dark) 0.45f else 0.7f, if (dark) 0.95f else 0.6f)

/** Renders a message body: formatted HTML from bridges, or plain text with tappable links. */
@Composable
fun rememberRich(msg: Msg, linkColor: Color, codeBg: Color): AnnotatedString = remember(msg.id, msg.body, msg.html, linkColor, codeBg) {
    buildAnnotatedString {
        fun link(url: String, text: String, style: SpanStyle?) {
            withLink(LinkAnnotation.Url(url, TextLinkStyles(SpanStyle(color = linkColor, textDecoration = TextDecoration.Underline)))) { if (style != null) withStyle(style) { append(text) } else append(text) }
        }
        val html = msg.html
        if (html != null) {
            for (sp in Format.parseHtml(html)) {
                val style = SpanStyle(
                    fontWeight = if (sp.bold) FontWeight.Bold else null, fontStyle = if (sp.italic || sp.quote) FontStyle.Italic else null,
                    textDecoration = when { sp.strike && sp.underline -> TextDecoration.combine(listOf(TextDecoration.LineThrough, TextDecoration.Underline)); sp.strike -> TextDecoration.LineThrough; sp.underline -> TextDecoration.Underline; else -> null },
                    fontFamily = if (sp.code) FontFamily.Monospace else null, background = if (sp.code) codeBg else Color.Unspecified,
                )
                if (sp.link != null) link(sp.link, sp.text, style)
                else withStyle(style) { linkifyInto(this, sp.text) { u, t, st -> link(u, t, st) } }
            }
        } else linkifyInto(this, msg.body) { u, t, st -> link(u, t, st) }
    }
}

private fun linkifyInto(b: AnnotatedString.Builder, text: String, link: (String, String, SpanStyle?) -> Unit) {
    var last = 0
    for (m in URL_REGEX.findAll(text)) {
        if (m.range.first < last) continue
        b.append(text.substring(last, m.range.first))
        link(if (m.value.startsWith("http")) m.value else "https://${m.value}", m.value, null)
        last = m.range.last + 1
    }
    b.append(text.substring(last))
}

// ---- Swipe to reply -----------------------------------------------------------------------

/** Drag a message to the right to reply, then it springs back. */
fun Modifier.swipeToReply(enabled: Boolean, onReply: () -> Unit, onThreshold: () -> Unit = {}): Modifier = if (!enabled) this else composed {
    val offset = remember { Animatable(0f) }
    val scope = rememberCoroutineScope()
    val limit = with(LocalDensity.current) { 72.dp.toPx() }
    var fired by remember { mutableStateOf(false) }
    this.offset { androidx.compose.ui.unit.IntOffset(offset.value.roundToInt(), 0) }.pointerInput(Unit) {
        detectHorizontalDragGestures(
            onDragStart = { fired = false },
            onDragEnd = { if (fired) onReply(); scope.launch { offset.animateTo(0f, spring()) } },
            onDragCancel = { scope.launch { offset.animateTo(0f, spring()) } },
        ) { change, delta ->
            change.consume()
            scope.launch { offset.snapTo((offset.value + delta * 0.6f).coerceIn(0f, limit)) }
            if (offset.value >= limit * 0.9f && !fired) { fired = true; onThreshold() }
        }
    }
}

// ---- The message row ----------------------------------------------------------------------

@Composable
fun MessageRow(
    chat: ChatState?, msg: Msg, me: String, group: Boolean, first: Boolean, last: Boolean, dark: Boolean, reply: Msg?, read: Boolean, starred: Boolean,
    onLong: () -> Unit, onReact: (String) -> Unit, onWho: (String) -> Unit, onDouble: () -> Unit, onOpen: (Msg) -> Unit, onReply: () -> Unit, onVote: (List<String>) -> Unit, onEndPoll: () -> Unit,
) {
    val store = LocalStore.current
    val s = LocalSettings.current
    val context = LocalContext.current
    val mine = msg.sender == me
    val scheme = MaterialTheme.colorScheme
    val bigEmoji = s.largeEmoji && msg.type == "m.text" && msg.html == null && Format.isEmojiOnly(msg.body)
    val bare = msg.sticker || bigEmoji
    val style = s.bubbleStyle
    val outlined = style == "outline"
    val plain = style == "plain"
    val gradient = mine && s.bubbleFill == "gradient" && !outlined && !plain
    val tinted = mine && s.bubbleFill == "tinted" && !outlined && !plain
    val fg = when {
        outlined || plain || tinted -> scheme.onSurface
        gradient -> scheme.onPrimary
        mine -> scheme.onPrimaryContainer
        else -> scheme.onSurface
    }
    val fill: Color = when {
        bare || outlined || plain -> Color.Transparent
        tinted -> scheme.primary.copy(alpha = 0.24f).compositeOver(scheme.surface)
        gradient -> scheme.primary
        mine -> scheme.primaryContainer
        else -> scheme.surface
    }
    val fillBrush = if (gradient && !bare) Brush.linearGradient(listOf(scheme.primary, lerp(scheme.primary, Color(0xFF7C3AED), 0.45f))) else null
    val r = when (style) { "square" -> 6.dp; "soft" -> 26.dp; else -> 18.dp }
    val tight = when (style) { "square" -> 3.dp; "tail" -> 18.dp; else -> 5.dp }
    val tailed = style == "tail" && last && !bare && msg.type != "m.image"
    val tailR = 4.dp
    val shape = if (mine) RoundedCornerShape(r, if (first) r else tight, if (last) (if (tailed) tailR else r) else tight, r)
        else RoundedCornerShape(if (first) r else tight, r, r, if (last) (if (tailed) tailR else r) else tight)
    val elevation = if (bare || outlined || plain || msg.type == "m.image") 0.dp else when (s.bubbleDepth) { "raised" -> 4.dp; "soft" -> 1.dp; else -> 0.dp }
    val tailColor = if (gradient) lerp(scheme.primary, Color(0xFF7C3AED), 0.45f) else fill

    // Entrance animation, only for messages that just arrived.
    val fresh = remember(msg.id) { System.currentTimeMillis() - msg.ts < 4000 && s.messageAnimation != "none" && !s.reduceMotion }
    val enter = remember(msg.id) { androidx.compose.animation.core.Animatable(if (fresh) 0f else 1f) }
    LaunchedEffect(msg.id) { if (fresh) enter.animateTo(1f, androidx.compose.animation.core.tween(if (s.messageAnimation == "pop") 280 else 260, easing = androidx.compose.animation.core.FastOutSlowInEasing)) }
    val vGap = if (first) 8.dp else if (s.density == "compact") 1.dp else 2.dp
    val haptic = androidx.compose.ui.platform.LocalHapticFeedback.current

    Column(Modifier.fillMaxWidth().padding(top = vGap), horizontalAlignment = if (mine) Alignment.End else Alignment.Start) {
        if (group && !mine && first) {
            val n = chat?.nameOf(msg.sender) ?: msg.sender
            Text(n, style = MaterialTheme.typography.labelMedium, color = if (s.colorSenderNames) senderColor(n, dark) else scheme.onSurfaceVariant, modifier = Modifier.padding(start = 14.dp, bottom = 2.dp))
        }
        Box(Modifier.swipeToReply(s.swipeToReply && msg.status == STATUS_SENT, onReply) { if (s.haptics) haptic.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.LongPress) }) {
            Box(
                Modifier.widthIn(max = 300.dp)
                    .graphicsLayer {
                        val t = enter.value
                        alpha = if (s.messageAnimation == "slide" || s.messageAnimation == "fade" || s.messageAnimation == "pop") t.coerceIn(0f, 1f) else 1f
                        when (s.messageAnimation) {
                            "pop" -> { val sc = 0.82f + 0.18f * t; scaleX = sc; scaleY = sc; transformOrigin = androidx.compose.ui.graphics.TransformOrigin(if (mine) 1f else 0f, 1f) }
                            "slide" -> translationY = (1f - t) * 14.dp.toPx()
                        }
                    }
                    .drawBehind {
                        if (tailed) {
                            val d = density; val w = size.width; val h = size.height
                            val path = androidx.compose.ui.graphics.Path().apply {
                                if (mine) { moveTo(w - 6 * d, h - 16 * d); lineTo(w + 7 * d, h); lineTo(w - 10 * d, h); close() }
                                else { moveTo(6 * d, h - 16 * d); lineTo(-7 * d, h); lineTo(10 * d, h); close() }
                            }
                            drawPath(path, tailColor)
                        }
                    }
                    .let { if (elevation > 0.dp) it.shadow(elevation, shape, clip = false) else it }
                    .clip(shape)
                    .let { if (fillBrush != null) it.background(fillBrush) else it.background(fill) }
                    .let {
                        when {
                            outlined -> it.border(if (s.eink) (if (mine) 3.dp else 2.dp) else 1.5.dp, if (mine) scheme.primary else scheme.outlineVariant, shape)
                            plain -> it.drawBehind { drawRect(if (mine) scheme.primary else scheme.outlineVariant, Offset.Zero, Size(3.dp.toPx(), size.height)) }
                            else -> it
                        }
                    }
                    .combinedClickable(
                        onClick = { if (msg.status == STATUS_FAILED) chat?.id?.let { store.retry(it, msg) } else onOpen(msg) },
                        onLongClick = onLong, onDoubleClick = onDouble,
                    ),
            ) {
                Column(Modifier.padding(horizontal = if (bare || msg.type == "m.image") (if (bare) 0.dp else 4.dp) else 12.dp, vertical = if (bare) 0.dp else if (msg.type == "m.image") 4.dp else 8.dp)) {
                    if (msg.replyTo != null) {
                        Row(Modifier.padding(bottom = 6.dp, start = if (msg.type == "m.image") 8.dp else 0.dp, top = if (msg.type == "m.image") 4.dp else 0.dp).height(IntrinsicSize.Min)) {
                            Box(Modifier.width(3.dp).fillMaxHeight().clip(CircleShape).background(fg.copy(alpha = 0.45f)))
                            Column(Modifier.padding(start = 8.dp)) {
                                Text(reply?.let { chat?.nameOf(it.sender) } ?: "Earlier message", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = fg.copy(alpha = 0.85f))
                                Text(reply?.let { previewOf(it) } ?: "…", style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis, color = fg.copy(alpha = 0.7f))
                            }
                        }
                    }
                    when {
                        msg.type == "m.poll" -> PollCard(msg, chat, me, fg, onVote, onEndPoll)
                        msg.type == "m.image" -> ImageContent(msg, allowAuto = mediaAllowed(context, s.autoDownload), autoPlay = s.autoPlayGifs)
                        msg.type == "m.video" -> FileChip(Icons.Rounded.Videocam, msg.body.ifEmpty { "Video" }, msg.size, fg)
                        msg.type == "m.audio" -> AudioContent(msg, fg)
                        msg.type == "m.file" && (msg.mime?.contains("vcard") == true || msg.body.endsWith(".vcf")) -> ContactCard(msg, fg)
                        msg.type == "m.file" -> FileChip(Icons.Rounded.InsertDriveFile, msg.body.ifEmpty { "File" }, msg.size, fg)
                        msg.type == "m.location" -> LocationCard(msg, fg)
                        msg.type == "m.emote" -> Text("* ${chat?.nameOf(msg.sender) ?: ""} ${msg.body}", color = fg, fontStyle = FontStyle.Italic)
                        bigEmoji -> Text(msg.body.trim(), fontSize = 44.sp, lineHeight = 52.sp)
                        msg.type == "m.notice" -> Text(rememberRich(msg, scheme.primary, fg.copy(alpha = 0.12f)), color = fg.copy(alpha = 0.75f), style = MaterialTheme.typography.bodyMedium)
                        else -> {
                            Text(rememberRich(msg, if (mine) fg else scheme.primary, fg.copy(alpha = 0.12f)), color = fg, style = MaterialTheme.typography.bodyLarge)
                            if (s.linkPreviews) firstUrl(msg.body)?.let { LinkPreviewCard(it, fg) }
                        }
                    }
                    if (last && !bare && (s.showMessageTimes || (mine && s.showReadTicks) || msg.edited)) {
                        Row(Modifier.align(Alignment.End).padding(top = 2.dp, end = if (msg.type == "m.image") 6.dp else 0.dp), verticalAlignment = Alignment.CenterVertically) {
                            if (starred) Icon(Icons.Rounded.Star, "Starred", tint = fg.copy(alpha = 0.6f), modifier = Modifier.size(11.dp).padding(end = 2.dp))
                            if (msg.edited) Text("edited  ", fontSize = 10.sp, fontStyle = FontStyle.Italic, color = fg.copy(alpha = 0.6f))
                            if (s.showMessageTimes) Text(remember(msg.ts, s.timeFormat) { formatClock(msg.ts, s.timeFormat) }, fontSize = 10.sp, color = fg.copy(alpha = 0.6f))
                            if (mine && s.showReadTicks) {
                                Spacer(Modifier.width(3.dp))
                                val (icon, tint) = when {
                                    msg.status == STATUS_SENDING -> Icons.Rounded.AccessTime to fg.copy(alpha = 0.6f)
                                    msg.status == STATUS_FAILED -> Icons.Rounded.Error to scheme.error
                                    read -> Icons.Rounded.DoneAll to fg
                                    else -> Icons.Rounded.Done to fg.copy(alpha = 0.6f)
                                }
                                Icon(icon, null, tint = tint, modifier = Modifier.size(14.dp))
                            }
                        }
                    }
                }
            }
        }
        if (msg.status == STATUS_FAILED) Text("Not sent · tap to retry", style = MaterialTheme.typography.labelMedium, color = scheme.error, modifier = Modifier.padding(horizontal = 8.dp))
        val reactions = chat?.reactions?.get(msg.id).orEmpty()
        if (reactions.isNotEmpty()) {
            FlowRow(Modifier.padding(top = 3.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                reactions.forEach { (key, who) ->
                    val minePicked = me in who
                    Row(
                        Modifier.clip(CircleShape).background(if (minePicked) scheme.primary.copy(alpha = 0.22f) else scheme.surface)
                            .combinedClickable(onClick = { onReact(key) }, onLongClick = { onWho(key) }).padding(horizontal = 9.dp, vertical = 3.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) { Text(key, fontSize = 14.sp); if (who.size > 1) Text(" ${who.size}", style = MaterialTheme.typography.labelMedium, color = scheme.onSurfaceVariant) }
                }
            }
        }
    }
}

// ---- Content types ------------------------------------------------------------------------

@Composable
private fun ImageContent(msg: Msg, allowAuto: Boolean, autoPlay: Boolean) {
    val store = LocalStore.current
    var tapped by remember(msg.id) { mutableStateOf(false) }
    val enabled = allowAuto || tapped || msg.status != STATUS_SENT
    val isGif = msg.mime == "image/gif" || msg.mime == "image/webp" || msg.body.endsWith(".gif", true)
    val ratio = if (msg.w != null && msg.h != null && msg.h > 0) (msg.w.toFloat() / msg.h).coerceIn(0.5f, 2f) else 4f / 3f
    val width = if (msg.sticker) 150.dp else 272.dp
    val shape = RoundedCornerShape(if (msg.sticker) 8.dp else 14.dp)
    Box(
        Modifier.widthIn(max = width).fillMaxWidth().aspectRatio(ratio).clip(shape)
            .background(if (msg.sticker) Color.Transparent else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))
            .let { if (!enabled) it.clickable { tapped = true } else it },
        contentAlignment = Alignment.Center,
    ) {
        val animated by produceState<File?>(null, msg.mxc, enabled, isGif && autoPlay && Build.VERSION.SDK_INT >= 28) {
            value = if (enabled && isGif && autoPlay && Build.VERSION.SDK_INT >= 28 && msg.mxc != null) store.media.fetch(msg.mxc) else null
        }
        val still = rememberMxcImage(msg.mxc, if (msg.sticker) 320 else 640, enabled = enabled && animated == null)
        when {
            animated != null -> AnimatedImage(animated!!, msg.sticker)
            still != null -> {
                Image(still, msg.body, Modifier.fillMaxSize(), contentScale = if (msg.sticker) ContentScale.Fit else ContentScale.Crop)
                if (isGif && !autoPlay) Box(Modifier.align(Alignment.BottomStart).padding(8.dp).clip(RoundedCornerShape(6.dp)).background(Color(0x99000000)).padding(horizontal = 6.dp, vertical = 2.dp)) { Text("GIF", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
            }
            else -> Text(
                if (msg.status == STATUS_SENDING) "Sending…" else if (!enabled) "Tap to load${msg.size?.let { " · ${humanSize(it)}" } ?: ""}" else "",
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** Plays animated GIF / WebP files with the platform decoder. */
@Composable
fun AnimatedImage(file: File, fit: Boolean) {
    AndroidView(
        factory = { ctx -> ImageView(ctx).apply { scaleType = if (fit) ImageView.ScaleType.FIT_CENTER else ImageView.ScaleType.CENTER_CROP } },
        update = { v ->
            if (Build.VERSION.SDK_INT >= 28) runCatching {
                val d = ImageDecoder.decodeDrawable(ImageDecoder.createSource(file))
                v.setImageDrawable(d)
                (d as? AnimatedImageDrawable)?.let { it.repeatCount = AnimatedImageDrawable.REPEAT_INFINITE; it.start() }
            }
        },
        modifier = Modifier.fillMaxSize(),
    )
}

@Composable
private fun FileChip(icon: androidx.compose.ui.graphics.vector.ImageVector, name: String, size: Long?, fg: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(fg.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) { Icon(icon, null, tint = fg, modifier = Modifier.size(22.dp)) }
        Column(Modifier.padding(start = 12.dp)) {
            Text(name, color = fg, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            size?.takeIf { it > 0 }?.let { Text(humanSize(it), style = MaterialTheme.typography.labelMedium, color = fg.copy(alpha = 0.6f)) }
        }
    }
}

@Composable
private fun AudioContent(msg: Msg, fg: Color) {
    val store = LocalStore.current
    val playing by store.audio.playing.collectAsState()
    val on = playing == msg.id
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(38.dp).clip(CircleShape).background(fg.copy(alpha = 0.15f)), contentAlignment = Alignment.Center) { Icon(if (on) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, if (on) "Stop" else "Play", tint = fg) }
        Column(Modifier.padding(start = 12.dp)) {
            Text(if (msg.voice) "Voice message" else msg.body, color = fg, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            msg.durationMs?.let { Text("%d:%02d".format(it / 60000, (it / 1000) % 60), style = MaterialTheme.typography.labelMedium, color = fg.copy(alpha = 0.6f)) }
        }
    }
}

@Composable
private fun LocationCard(msg: Msg, fg: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).background(Color(0xFFEF4444)), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.LocationOn, null, tint = Color.White) }
        Column(Modifier.padding(start = 12.dp)) {
            Text("Shared location", color = fg, fontWeight = FontWeight.SemiBold)
            Text(msg.geo?.removePrefix("geo:")?.substringBefore(';') ?: "", style = MaterialTheme.typography.labelMedium, color = fg.copy(alpha = 0.7f))
            Text("Tap to open map", style = MaterialTheme.typography.labelMedium, color = fg.copy(alpha = 0.55f))
        }
    }
}

/** A shared contact (vCard). Name and number are read from the file when it arrives. */
@Composable
private fun ContactCard(msg: Msg, fg: Color) {
    val store = LocalStore.current
    val scope = rememberCoroutineScope()
    val card by produceState<Pair<String, String>?>(null, msg.mxc) {
        value = msg.mxc?.let { m -> store.media.fetch(m)?.let { f -> parseVcard(f.readText()) } }
    }
    val name = card?.first?.ifBlank { null } ?: msg.body.removeSuffix(".vcf")
    Row(verticalAlignment = Alignment.CenterVertically) {
        Avatar(name, null, 44.dp)
        Column(Modifier.padding(start = 12.dp)) {
            Text(name, color = fg, fontWeight = FontWeight.SemiBold)
            card?.second?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = fg.copy(alpha = 0.75f)) }
            Text("Tap to save contact", style = MaterialTheme.typography.labelMedium, color = fg.copy(alpha = 0.55f))
        }
    }
}

fun parseVcard(text: String): Pair<String, String> {
    val name = Regex("(?m)^FN[^:]*:(.*)$").find(text)?.groupValues?.get(1)?.trim() ?: ""
    val tel = Regex("(?m)^TEL[^:]*:(.*)$").find(text)?.groupValues?.get(1)?.trim() ?: ""
    return name to tel
}

@Composable
private fun LinkPreviewCard(url: String, fg: Color) {
    val store = LocalStore.current
    val uri = LocalUriHandler.current
    val p by produceState<LinkPreview?>(null, url) { value = store.preview(url) }
    val card = p ?: return
    Column(Modifier.padding(top = 6.dp).clip(RoundedCornerShape(12.dp)).background(fg.copy(alpha = 0.08f)).clickable { runCatching { uri.openUri(url) } }.padding(10.dp)) {
        card.site?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = fg.copy(alpha = 0.6f)) }
        card.title?.let { Text(it, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis, color = fg) }
        card.description?.let { Text(it, style = MaterialTheme.typography.labelMedium, maxLines = 3, overflow = TextOverflow.Ellipsis, color = fg.copy(alpha = 0.75f)) }
        val img = rememberMxcImage(card.imageMxc, 480)
        if (img != null) Image(img, null, Modifier.padding(top = 6.dp).fillMaxWidth().height(130.dp).clip(RoundedCornerShape(8.dp)), contentScale = ContentScale.Crop)
    }
}

/** A poll: tap an option to vote, see live results, creators can end it. */
@Composable
private fun PollCard(msg: Msg, chat: ChatState?, me: String, fg: Color, onVote: (List<String>) -> Unit, onEnd: () -> Unit) {
    val poll = msg.poll ?: return
    val votes = chat?.pollVotes?.get(msg.id).orEmpty()
    val ended = msg.id in (chat?.pollEnded ?: emptySet())
    val mine = votes[me].orEmpty()
    val total = votes.values.sumOf { it.size }.coerceAtLeast(0)
    val showCounts = poll.disclosed || ended
    Column(Modifier.widthIn(min = 220.dp)) {
        Text(poll.question, color = fg, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyLarge)
        Text(if (ended) "Poll ended" else if (poll.maxSelections > 1) "Select up to ${poll.maxSelections}" else "Select one", style = MaterialTheme.typography.labelMedium, color = fg.copy(alpha = 0.65f), modifier = Modifier.padding(bottom = 8.dp))
        poll.answers.forEach { a ->
            val count = votes.values.count { a.id in it }
            val selected = a.id in mine
            val frac = if (total > 0 && showCounts) count.toFloat() / total else 0f
            Box(
                Modifier.fillMaxWidth().padding(vertical = 3.dp).clip(RoundedCornerShape(10.dp)).background(fg.copy(alpha = 0.08f))
                    .clickable(enabled = !ended && msg.status == STATUS_SENT) {
                        onVote(when {
                            poll.maxSelections == 1 -> if (selected) emptyList() else listOf(a.id)
                            selected -> mine - a.id
                            mine.size < poll.maxSelections -> mine + a.id
                            else -> mine
                        })
                    },
            ) {
                Row(Modifier.matchParentSize()) {
                    if (frac > 0f) Box(Modifier.weight(frac).fillMaxHeight().background(fg.copy(alpha = 0.13f)))
                    if (frac < 1f) Spacer(Modifier.weight(1f - frac))
                }
                Row(Modifier.padding(horizontal = 10.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        if (poll.maxSelections > 1) (if (selected) Icons.Rounded.CheckBox else Icons.Rounded.CheckBoxOutlineBlank) else (if (selected) Icons.Rounded.RadioButtonChecked else Icons.Rounded.RadioButtonUnchecked),
                        null, tint = if (selected) MaterialTheme.colorScheme.primary else fg.copy(alpha = 0.6f), modifier = Modifier.size(20.dp),
                    )
                    Text(a.text, color = fg, modifier = Modifier.weight(1f).padding(horizontal = 10.dp), style = MaterialTheme.typography.bodyMedium)
                    if (showCounts) Text("$count", color = fg.copy(alpha = 0.75f), style = MaterialTheme.typography.labelLarge)
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
            Text(if (showCounts) "$total vote${if (total == 1) "" else "s"}" else "Results hidden until the poll ends", style = MaterialTheme.typography.labelMedium, color = fg.copy(alpha = 0.6f), modifier = Modifier.weight(1f))
            if (!ended && msg.sender == me && msg.status == STATUS_SENT) TextButton(onClick = onEnd) { Text("End poll") }
        }
    }
}
