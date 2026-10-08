package app.pager.android

data class Msg(
    val id: String,
    val sender: String,
    val senderName: String,
    val ts: Long,
    val type: String,
    val body: String,
    val mxc: String? = null,
)

data class ChatState(
    val id: String,
    val name: String = "",
    val network: String = "matrix",
    val avatarMxc: String? = null,
    val unread: Int = 0,
    val messages: List<Msg> = emptyList(),
    val members: Map<String, String> = emptyMap(),
    val joined: Set<String> = emptySet(),
) {
    val lastTs get() = messages.lastOrNull()?.ts ?: 0L
    val preview: String
        get() = messages.lastOrNull()?.let {
            when (it.type) {
                "m.image" -> "📷 Photo"
                "m.video" -> "🎬 Video"
                "m.audio" -> "🎤 Voice message"
                "m.file" -> "📎 ${it.body}"
                else -> it.body
            }
        } ?: ""

    /** Bridge bots keep a management DM for login commands; users never need to see it. */
    fun isBotRoom(me: String): Boolean {
        val others = joined.filter { it != me }
        return others.size == 1 && Regex("^@[a-z]*bot:").containsMatchIn(others[0])
    }
}

/** A message that just arrived from someone else, for notifications. */
data class Incoming(val roomId: String, val chat: String, val sender: String, val text: String)
