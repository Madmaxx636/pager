package app.pager.android

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.longOrNull

private fun JsonElement?.obj(): JsonObject = (this as? JsonObject) ?: JsonObject(emptyMap())
private fun JsonElement?.arr(): JsonArray = (this as? JsonArray) ?: JsonArray(emptyList())
private fun JsonElement?.str(): String? = (this as? JsonPrimitive)?.contentOrNull

data class SyncResult(
    val chats: Map<String, ChatState>,
    val incoming: List<Incoming>,
    val invites: List<String>,
)

object SyncReducer {
    /** Folds one /sync response into the chat map. Pure, so it can be unit-tested. */
    fun apply(old: Map<String, ChatState>, sync: JsonObject, me: String, initial: Boolean): SyncResult {
        val chats = old.toMutableMap()
        val incoming = mutableListOf<Incoming>()
        val rooms = sync["rooms"].obj()

        val invites = rooms["invite"].obj().keys.toList()

        for ((roomId, roomEl) in rooms["join"].obj()) {
            val room = roomEl.obj()
            var chat = chats[roomId] ?: ChatState(roomId)
            val stateEvents = room["state"].obj()["events"].arr()
            val timeline = room["timeline"].obj()["events"].arr()

            // State can arrive in the state block and inline in the timeline.
            for (e in stateEvents) chat = applyState(chat, e.obj())
            val msgs = chat.messages.toMutableList()
            val seen = msgs.mapTo(HashSet()) { it.id }

            for (el in timeline) {
                val e = el.obj()
                if (e["state_key"] != null) {
                    chat = applyState(chat, e)
                    continue
                }
                val msg = toMsg(chat, e) ?: continue
                if (!seen.add(msg.id)) continue
                msgs.add(msg)
                if (!initial && msg.sender != me) {
                    incoming.add(Incoming(roomId, chat.name.ifEmpty { "New message" }, msg.senderName, previewOf(msg)))
                }
            }
            msgs.sortBy { it.ts }

            val count = room["unread_notifications"].obj()["notification_count"].let { (it as? JsonPrimitive)?.intOrNull }
            chat = chat.copy(messages = msgs, unread = count ?: chat.unread)
            chats[roomId] = chat
        }

        for (roomId in rooms["leave"].obj().keys) chats.remove(roomId)
        return SyncResult(chats, incoming, invites)
    }

    private fun applyState(chat: ChatState, e: JsonObject): ChatState {
        val content = e["content"].obj()
        val key = e["state_key"].str() ?: ""
        return when (e["type"].str()) {
            "m.room.name" -> chat.copy(name = content["name"].str() ?: "")
            "m.room.avatar" -> chat.copy(avatarMxc = content["url"].str())
            "m.bridge", "uk.half-shot.bridge" -> {
                val id = content["protocol"].obj()["id"].str()
                if (id != null) chat.copy(network = if (id == "facebook") "messenger" else id) else chat
            }
            "m.room.member" -> {
                val membership = content["membership"].str()
                val name = content["displayname"].str() ?: key
                chat.copy(
                    members = if (membership == "join") chat.members + (key to name) else chat.members - key,
                    joined = if (membership == "join") chat.joined + key else chat.joined - key,
                    // DMs from bridges often have no room name; fall back to the other person.
                    name = chat.name,
                )
            }
            else -> chat
        }
    }

    private fun toMsg(chat: ChatState, e: JsonObject): Msg? {
        if (e["type"].str() != "m.room.message") return null
        val content = e["content"].obj()
        if (content["m.relates_to"].obj()["rel_type"].str() == "m.replace") return null // edits
        val sender = e["sender"].str() ?: return null
        return Msg(
            id = e["event_id"].str() ?: return null,
            sender = sender,
            senderName = chat.members[sender] ?: sender,
            ts = (e["origin_server_ts"] as? JsonPrimitive)?.longOrNull ?: 0L,
            type = content["msgtype"].str() ?: "m.text",
            body = content["body"].str() ?: "",
            mxc = content["url"].str(),
        )
    }

    fun previewOf(m: Msg) = when (m.type) {
        "m.image" -> "📷 Photo"
        "m.video" -> "🎬 Video"
        "m.audio" -> "🎤 Voice message"
        "m.file" -> "📎 ${m.body}"
        else -> m.body
    }

    /** Display name for a chat, falling back to the other participant for unnamed DMs. */
    fun displayName(chat: ChatState, me: String): String {
        if (chat.name.isNotBlank()) return chat.name
        val other = chat.joined.firstOrNull { it != me }
        return other?.let { chat.members[it] } ?: "Unnamed chat"
    }
}
