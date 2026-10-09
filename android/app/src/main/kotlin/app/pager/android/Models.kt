package app.pager.android

import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

const val STATUS_SENT = 0
const val STATUS_SENDING = 1
const val STATUS_FAILED = 2

@Serializable
data class Sticker(val shortcode: String, val url: String, val body: String, val w: Int? = null, val h: Int? = null, val mime: String? = null)

@Serializable
data class StickerPack(val key: String, val name: String, val stickers: List<Sticker>)

@Serializable
data class PollAnswer(val id: String, val text: String)

@Serializable
data class PollInfo(val question: String, val answers: List<PollAnswer>, val maxSelections: Int = 1, val disclosed: Boolean = true)

@Serializable
data class Msg(
    val id: String,
    val sender: String,
    val ts: Long,
    val type: String,
    val body: String,
    val mxc: String? = null,
    val mime: String? = null,
    val size: Long? = null,
    val w: Int? = null,
    val h: Int? = null,
    val durationMs: Long? = null,
    val replyTo: String? = null,
    val edited: Boolean = false,
    val txn: String? = null,
    val status: Int = STATUS_SENT,
    /** geo: URI for location messages. */
    val geo: String? = null,
    val sticker: Boolean = false,
    val voice: Boolean = false,
    /** User ids explicitly mentioned (m.mentions). */
    val mentions: List<String> = emptyList(),
    /** Sanitized-later HTML from formatted_body (bridges send bold/italic/links this way). */
    val html: String? = null,
    val poll: PollInfo? = null,
    /** Set when the attachment is end-to-end encrypted: how to unscramble it. */
    val enc: EncFile? = null,
)

@Serializable
data class ReactionRef(val target: String, val key: String, val sender: String)

@Serializable
data class ChatState(
    val id: String,
    val name: String = "",
    val network: String = "matrix",
    val avatarMxc: String? = null,
    val unread: Int = 0,
    val messages: List<Msg> = emptyList(),
    val members: Map<String, String> = emptyMap(),
    val joined: Set<String> = emptySet(),
    val heroes: List<String> = emptyList(),
    /** Pagination token for loading older history; null once the start of the room is reached. */
    val prevBatch: String? = null,
    /** True once pagination has reached the first message of the room. */
    val reachedStart: Boolean = false,
    /** target event id -> reaction key -> senders */
    val reactions: Map<String, Map<String, List<String>>> = emptyMap(),
    val reactionRefs: Map<String, ReactionRef> = emptyMap(),
    /** user id -> latest event they have read */
    val receipts: Map<String, String> = emptyMap(),
    /** When each user's read receipt was sent (ms). */
    val receiptTs: Map<String, Long> = emptyMap(),
    val tags: Set<String> = emptySet(),
    val markedUnread: Boolean = false,
    val memberCount: Int = 0,
    /** The room uses end-to-end encryption (m.room.encryption). */
    val encrypted: Boolean = false,
    /** Bridge-reported room type ("dm", "group"...), when the room is bridged. */
    val roomType: String? = null,
    /** Order of this chat among pinned chats (m.favourite tag order). */
    val pinOrder: Double? = null,
    /** poll event id -> user id -> chosen answer ids */
    val pollVotes: Map<String, Map<String, List<String>>> = emptyMap(),
    val pollEnded: Set<String> = emptySet(),
    val stickerPacks: List<StickerPack> = emptyList(),
    @Transient val typing: Set<String> = emptySet(),
) {
    val lastTs get() = messages.lastOrNull()?.ts ?: 0L
    /** Bridged rooms always hold the bridge bot and your own puppet, so raw member counts overstate. */
    /** Who has read a message, and when: anyone whose read receipt is at or after it. The time is when they read up to that point. */
    fun readersOf(msgId: String, sender: String): List<Pair<String, Long?>> {
        // (bridge bots only mean "delivered")
        val idx = messages.indexOfFirst { it.id == msgId }
        if (idx < 0) return emptyList()
        return receipts.filter { (user, ev) -> user != sender && !isBridgeBot(user) && messages.indexOfFirst { it.id == ev } >= idx }.map { (user, _) -> user to receiptTs[user] }
    }
    val isGroup get() = roomType?.takeIf { it.isNotEmpty() }?.let { it != "dm" } ?: (memberCount > 2)
    val peopleCount get() = if (!roomType.isNullOrEmpty()) (memberCount - 2).coerceAtLeast(2) else memberCount
    val pinned get() = "m.favourite" in tags
    val archived get() = "u.archived" in tags
    val lowPriority get() = "m.lowpriority" in tags
    val labels get() = tags.filter { it.startsWith(LABEL_PREFIX) }.map { it.removePrefix(LABEL_PREFIX) }.sorted()

    val preview: String
        get() = messages.lastOrNull()?.let { previewOf(it) } ?: ""

    fun nameOf(userId: String) = Names.pretty(members[userId] ?: userId.removePrefix("@").substringBefore(':'))

    /** The WhatsApp stories room: the bridge puts every status update in one room. */
    val isStories get() = Regex("status.?broadcast", RegexOption.IGNORE_CASE).containsMatchIn(name) && network == "whatsapp"

    /** Bridge bots keep a management DM for login commands; users never need to see it. */
    fun isBotRoom(me: String): Boolean {
        val others = joined.filter { it != me }
        // Only some members are loaded at a time: a room with more people than that (like Signal's Note to Self: you, the bot and your own account) is not a bot room.
        return others.size == 1 && BOT.containsMatchIn(others[0]) && (memberCount <= 0 || memberCount <= 2)
    }

    companion object { const val LABEL_PREFIX = "u.label."; private val BOT = Regex("^@[a-z]*bot:") }
}

fun previewOf(m: Msg) = when (m.type) {
    "m.image" -> if (m.sticker) "Sticker" else if (m.mime == "image/gif") "GIF" else "Photo"
    "m.location" -> "Location"
    "m.poll" -> "Poll: ${m.poll?.question ?: m.body}"
    "m.emote" -> "* ${m.body}"
    "m.video" -> "Video"
    "m.audio" -> if (m.voice) "Voice message" else m.body
    "m.file" -> if (m.mime?.contains("vcard") == true || m.body.endsWith(".vcf")) "Contact: ${m.body.removeSuffix(".vcf")}" else m.body
    else -> m.body
}

/** Everything the inbox needs about a chat, computed off the main thread. */
data class ChatSummary(
    val id: String,
    val name: String,
    val network: String,
    val avatarMxc: String?,
    val preview: String,
    val ts: Long,
    val unread: Int,
    val markedUnread: Boolean,
    val pinned: Boolean,
    val archived: Boolean,
    val muted: Boolean,
    val isGroup: Boolean,
    val draft: String?,
    val lowPriority: Boolean = false,
    val labels: List<String> = emptyList(),
    val pinOrder: Double = 0.0,
    /** The last message is from someone else and hasn't been answered. */
    val unanswered: Boolean = false,
    val lastFromMe: Boolean = false,
    val typing: Boolean = false,
    val stories: Boolean = false,
)

/** A message that just arrived from someone else, for notifications. */
data class Incoming(
    val roomId: String,
    val chat: String,
    val sender: String,
    val text: String,
    val network: String = "matrix",
    val isGroup: Boolean = false,
    val mentioned: Boolean = false,
    val ts: Long = 0L,
    /** The message is a reply to something you wrote. */
    val replyToMe: Boolean = false,
    /** Set by the notification policy: show it without sound or vibration. */
    val silent: Boolean = false,
    /** Set by the notification policy: full | sender | hidden. */
    val preview: String = "full",
)

/** The bridge's own bot account (e.g. @signalbot:server). It sends a receipt when a message reaches the other network: that means "delivered", not "read". */
fun isBridgeBot(userId: String) = Regex("^@(whatsapp|signal|gmessages|messenger|instagram|slack|twitter|bluesky|linkedin|telegram|discord|googlechat|imessage)bot:").containsMatchIn(userId)
