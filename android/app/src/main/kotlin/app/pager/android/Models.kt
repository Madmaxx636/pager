package app.pager.android

import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

const val STATUS_SENT = 0
const val STATUS_SENDING = 1
const val STATUS_FAILED = 2

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
    val tags: Set<String> = emptySet(),
    val markedUnread: Boolean = false,
    val memberCount: Int = 0,
    @Transient val typing: Set<String> = emptySet(),
) {
    val lastTs get() = messages.lastOrNull()?.ts ?: 0L
    val isGroup get() = memberCount > 2
    val pinned get() = "m.favourite" in tags
    val archived get() = "u.archived" in tags

    val preview: String
        get() = messages.lastOrNull()?.let { previewOf(it) } ?: ""

    fun nameOf(userId: String) = members[userId] ?: userId.removePrefix("@").substringBefore(':')

    /** Bridge bots keep a management DM for login commands; users never need to see it. */
    fun isBotRoom(me: String): Boolean {
        val others = joined.filter { it != me }
        return others.size == 1 && BOT.containsMatchIn(others[0])
    }

    companion object { private val BOT = Regex("^@[a-z]*bot:") }
}

fun previewOf(m: Msg) = when (m.type) {
    "m.image" -> if (m.sticker) "Sticker" else "📷 Photo"
    "m.location" -> "📍 Location"
    "m.emote" -> "* ${m.body}"
    "m.video" -> "🎬 Video"
    "m.audio" -> if (m.voice) "🎤 Voice message" else "🎵 ${m.body}"
    "m.file" -> "📎 ${m.body}"
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
)
