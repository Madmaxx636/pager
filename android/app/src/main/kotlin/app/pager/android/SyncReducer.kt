package app.pager.android

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.longOrNull

private fun JsonElement?.obj(): JsonObject = (this as? JsonObject) ?: JsonObject(emptyMap())
private fun JsonElement?.arr(): JsonArray = (this as? JsonArray) ?: JsonArray(emptyList())
private fun JsonElement?.str(): String? = (this as? JsonPrimitive)?.contentOrNull
private fun JsonElement?.int(): Int? = (this as? JsonPrimitive)?.intOrNull
private fun JsonElement?.long(): Long? = (this as? JsonPrimitive)?.longOrNull

data class SyncResult(
    val chats: Map<String, ChatState>,
    val incoming: List<Incoming>,
    val invites: List<String>,
    /** Rooms with notifications switched off; null when this sync carried no push-rule change. */
    val muted: Set<String>?,
    /** The user's own sticker pack when this sync carried it. */
    val userStickers: StickerPack? = null,
    /** Pager's own account data (settings saved per kind of device) carried by this sync. */
    val accountData: Map<String, JsonObject> = emptyMap(),
)

object SyncReducer {
    // ---- Your own accounts on other networks ----------------------------------------------------
    // A bridge without double puppeting sends the messages you wrote on your phone (and your history) as your own "ghost"
    // user on that network, not as you. Treat those ghosts as you, so they show as sent instead of received.
    @Volatile private var ownNames: Set<String> = emptySet()
    @Volatile private var ownIds: Set<String> = emptySet()
    fun setOwnIdentity(names: Collection<String>, ids: Collection<String>) {
        ownNames = names.map { it.trim().lowercase() }.filter { it.length >= 2 }.toSet()
        ownIds = ids.toSet()
    }
    /** Bridges decorate ghost names, e.g. "Lane McDonald (WA)": compare without that suffix. */
    private val nameSuffix = Regex("\\s*\\([^)]{1,12}\\)$")
    private fun baseName(n: String) = n.trim().lowercase().replace(nameSuffix, "")
    private fun ownGhosts(chat: ChatState, me: String): Set<String> {
        val out = HashSet<String>()
        for ((id, name) in chat.members) if (id != me && (id in ownIds || baseName(name) in ownNames)) out.add(id)
        for (id in ownIds) if (id != me) out.add(id)
        return out
    }
    private fun claimOwn(events: List<JsonObject>, ghosts: Set<String>, me: String): List<JsonObject> {
        if (ghosts.isEmpty()) return events
        return events.map { e -> if (e["state_key"] == null && e["sender"].str() in ghosts) JsonObject(e + ("sender" to JsonPrimitive(me))) else e }
    }

    /** Folds one /sync response into the chat map. Pure, so it can be unit-tested. */
    fun apply(old: Map<String, ChatState>, sync: JsonObject, me: String, initial: Boolean): SyncResult {
        val chats = old.toMutableMap()
        val incoming = mutableListOf<Incoming>()
        val rooms = sync["rooms"].obj()
        val invites = rooms["invite"].obj().keys.toList()

        for ((roomId, roomEl) in rooms["join"].obj()) {
            val room = roomEl.obj()
            var chat = chats[roomId] ?: ChatState(roomId)
            for (e in room["state"].obj()["events"].arr()) chat = applyState(chat, e.obj())

            val tl = room["timeline"].obj()
            val limited = (tl["limited"] as? JsonPrimitive)?.booleanOrNull == true
            val prev = tl["prev_batch"].str()
            // A gap means older loaded messages are no longer contiguous with the new ones; start over from here.
            if (limited && chat.messages.isNotEmpty() && !initial) chat = chat.copy(messages = emptyList(), prevBatch = prev, reachedStart = false)
            else if (chat.prevBatch == null && chat.messages.isEmpty() && prev != null) chat = chat.copy(prevBatch = prev)

            val pre = chat
            chat = process(chat, claimOwn(tl["events"].arr().map { it.obj() }, ownGhosts(chat, me), me), applyStates = true) { m, parentSender ->
                if (!initial && m.sender != me) {
                    val mine = pre.members[me] ?: me.removePrefix("@").substringBefore(':')
                    val mentioned = me in m.mentions || m.body.contains("@$mine", ignoreCase = true)
                    incoming.add(Incoming(roomId, displayName(pre, me), pre.nameOf(m.sender), previewOf(m), pre.network, pre.isGroup, mentioned, m.ts, replyToMe = parentSender == me))
                }
            }

            for (e in room["ephemeral"].obj()["events"].arr()) chat = applyEphemeral(chat, e.obj(), me)
            for (e in room["account_data"].obj()["events"].arr()) chat = applyRoomAccountData(chat, e.obj())

            room["summary"].obj()["m.heroes"].arr().mapNotNull { it.str() }.takeIf { it.isNotEmpty() }?.let { chat = chat.copy(heroes = it) }
            room["summary"].obj()["m.joined_member_count"].int()?.let { chat = chat.copy(memberCount = it) }
            val count = room["unread_notifications"].obj()["notification_count"].int()
            chats[roomId] = chat.copy(unread = count ?: chat.unread)
        }

        for (roomId in rooms["leave"].obj().keys) chats.remove(roomId)

        var muted: Set<String>? = null
        var userStickers: StickerPack? = null
        val accountData = HashMap<String, JsonObject>()
        for (e in sync["account_data"].obj()["events"].arr()) {
            e.obj()["type"].str()?.takeIf { it.startsWith("app.pager.settings.") || it == "app.pager.favorite_gifs" }?.let { accountData[it] = e.obj()["content"].obj() }
            when (e.obj()["type"].str()) {
                "m.push_rules" -> muted = parseMuted(e.obj())
                "im.ponies.user_emotes" -> userStickers = parseStickerPack("user", "My stickers", e.obj()["content"].obj())
            }
        }
        return SyncResult(chats, incoming, invites, muted, userStickers, accountData)
    }

    /** Merges a page of older events (as returned by /messages, newest first) into a chat. */
    fun applyHistory(chat: ChatState, chunk: List<JsonObject>, end: String?, state: List<JsonObject> = emptyList(), me: String = ""): ChatState {
        var base = chat
        for (s in state) if (s["type"].str() == "m.room.member") base = applyState(base, s)
        val chronological = claimOwn(chunk.asReversed(), if (me.isEmpty()) emptySet() else ownGhosts(base, me), me)
        return process(base, chronological, applyStates = false, onNew = null).copy(prevBatch = end, reachedStart = end == null)
    }

    /** The core event loop shared by sync and history. */
    private fun process(start: ChatState, events: List<JsonObject>, applyStates: Boolean, onNew: ((Msg, String?) -> Unit)?): ChatState {
        if (events.isEmpty()) return start
        var chat = start
        val msgs = start.messages.toMutableList()
        val ids = msgs.mapTo(HashSet()) { it.id }
        val reactions = start.reactions.mapValuesTo(HashMap()) { (_, v) -> v.mapValuesTo(HashMap()) { it.value.toMutableList() } }
        val refs = start.reactionRefs.toMutableMap()
        val votes = start.pollVotes.mapValues { (_, v) -> v.toMutableMap() }.toMutableMap()
        val ended = start.pollEnded.toMutableSet()

        for (e in events) {
            if (e["state_key"] != null) {
                if (applyStates) chat = applyState(chat, e)
                continue
            }
            val content = e["content"].obj()
            when (e["type"].str()) {
                "m.room.message" -> {
                    if (content["m.relates_to"].obj()["rel_type"].str() == "m.replace") {
                        applyEdit(msgs, e)
                        continue
                    }
                    val msg = toMsg(e) ?: continue
                    msg.txn?.let { txn -> msgs.removeAll { it.id == "local-$txn" } }
                    if (!ids.add(msg.id)) continue
                    msgs.add(msg)
                    onNew?.invoke(msg, msg.replyTo?.let { p -> msgs.firstOrNull { it.id == p }?.sender })
                }
                "m.sticker" -> {
                    val sticker = toMsg(e)?.copy(type = "m.image", sticker = true) ?: stickerMsg(e) ?: continue
                    if (ids.add(sticker.id)) { msgs.add(sticker); onNew?.invoke(sticker, null) }
                }
                "org.matrix.msc3381.poll.start", "m.poll.start" -> {
                    val poll = toPollMsg(e) ?: continue
                    if (ids.add(poll.id)) { msgs.add(poll); onNew?.invoke(poll, null) }
                }
                "org.matrix.msc3381.poll.response", "m.poll.response" -> {
                    val target = content["m.relates_to"].obj()["event_id"].str() ?: continue
                    val sender = e["sender"].str() ?: continue
                    val answers = (content["org.matrix.msc3381.poll.response"].obj()["answers"] ?: content["m.selections"]).arr().mapNotNull { it.str() }
                    if (target !in ended) votes.getOrPut(target) { mutableMapOf() }[sender] = answers
                }
                "org.matrix.msc3381.poll.end", "m.poll.end" -> {
                    val target = content["m.relates_to"].obj()["event_id"].str() ?: continue
                    val owner = msgs.firstOrNull { it.id == target }?.sender
                    if (owner == null || owner == e["sender"].str()) ended.add(target)
                }
                "m.reaction" -> {
                    val rel = content["m.relates_to"].obj()
                    val id = e["event_id"].str()
                    val target = rel["event_id"].str()
                    val key = rel["key"].str()
                    val sender = e["sender"].str()
                    if (rel["rel_type"].str() == "m.annotation" && id != null && target != null && key != null && sender != null && id !in refs) {
                        refs[id] = ReactionRef(target, key, sender)
                        val list = reactions.getOrPut(target) { HashMap() }.getOrPut(key) { mutableListOf() }
                        if (sender !in list) list.add(sender)
                    }
                }
                "m.room.redaction" -> {
                    val target = e["redacts"].str() ?: content["redacts"].str() ?: continue
                    if (msgs.removeAll { it.id == target }) ids.remove(target)
                    refs.remove(target)?.let { ref ->
                        reactions[ref.target]?.get(ref.key)?.remove(ref.sender)
                        if (reactions[ref.target]?.get(ref.key)?.isEmpty() == true) reactions[ref.target]?.remove(ref.key)
                    }
                }
            }
        }
        msgs.sortBy { it.ts }
        return chat.copy(
            messages = msgs,
            reactions = reactions.mapValues { (_, v) -> v.mapValues { it.value.toList() } }.filterValues { it.isNotEmpty() },
            reactionRefs = refs,
            pollVotes = votes.mapValues { (_, v) -> v.toMap() },
            pollEnded = ended,
        )
    }

    private fun applyEdit(msgs: MutableList<Msg>, e: JsonObject) {
        val content = e["content"].obj()
        val target = content["m.relates_to"].obj()["event_id"].str() ?: return
        val i = msgs.indexOfFirst { it.id == target }
        if (i < 0 || msgs[i].sender != e["sender"].str()) return
        val body = content["m.new_content"].obj()["body"].str() ?: content["body"].str()?.removePrefix("* ") ?: return
        msgs[i] = msgs[i].copy(body = body, edited = true)
    }

    private fun applyState(chat: ChatState, e: JsonObject): ChatState {
        val content = e["content"].obj()
        val key = e["state_key"].str() ?: ""
        return when (e["type"].str()) {
            "m.room.name" -> chat.copy(name = content["name"].str() ?: "")
            "m.room.avatar" -> chat.copy(avatarMxc = content["url"].str())
            "im.ponies.room_emotes" -> {
                val pack = parseStickerPack(key.ifEmpty { "room" }, content["pack"].obj()["display_name"].str() ?: "Room stickers", content)
                chat.copy(stickerPacks = chat.stickerPacks.filter { it.key != pack.key } + pack)
            }
            "m.bridge", "uk.half-shot.bridge" -> {
                val id = content["protocol"].obj()["id"].str()
                val type = content["com.beeper.room_type"].str() ?: content["com.beeper.room_type.v2"].str()
                if (id != null) chat.copy(network = if (id == "facebook") "messenger" else id, roomType = type ?: chat.roomType ?: "") else chat
            }
            "m.room.member" -> {
                val joined = content["membership"].str() == "join"
                chat.copy(
                    members = if (joined) chat.members + (key to (content["displayname"].str() ?: key.removePrefix("@").substringBefore(':'))) else chat.members,
                    joined = if (joined) chat.joined + key else chat.joined - key,
                )
            }
            else -> chat
        }
    }

    private fun applyEphemeral(chat: ChatState, e: JsonObject, me: String): ChatState {
        val content = e["content"].obj()
        return when (e["type"].str()) {
            "m.typing" -> chat.copy(typing = content["user_ids"].arr().mapNotNull { it.str() }.filter { it != me }.toSet())
            "m.receipt" -> {
                val receipts = chat.receipts.toMutableMap()
                val times = chat.receiptTs.toMutableMap()
                val mineGhosts = ownGhosts(chat, me)
                for ((eventId, kinds) in content) {
                    for ((rawUser, info) in kinds.obj()["m.read"].obj()) {
                        val user = if (rawUser in mineGhosts) me else rawUser // your own account on that network reading = you reading
                        receipts[user] = eventId
                        (info.obj()["ts"] as? JsonPrimitive)?.longOrNull?.let { times[user] = it }
                    }
                }
                chat.copy(receipts = receipts, receiptTs = times)
            }
            else -> chat
        }
    }

    private fun applyRoomAccountData(chat: ChatState, e: JsonObject): ChatState {
        val content = e["content"].obj()
        return when (e["type"].str()) {
            "m.tag" -> {
                val tags = content["tags"].obj()
                chat.copy(tags = tags.keys, pinOrder = (tags["m.favourite"].obj()["order"] as? JsonPrimitive)?.contentOrNull?.toDoubleOrNull())
            }
            "m.marked_unread", "com.famedly.marked_unread" ->
                chat.copy(markedUnread = (content["unread"] as? JsonPrimitive)?.booleanOrNull == true)
            else -> chat
        }
    }

    /** Sticker packs (MSC2545): images keyed by shortcode, usable as stickers unless marked emoji-only. */
    fun parseStickerPack(key: String, fallbackName: String, content: JsonObject): StickerPack {
        val name = content["pack"].obj()["display_name"].str() ?: fallbackName
        val stickers = content["images"].obj().mapNotNull { (short, el) ->
            val o = el.obj()
            val usage = o["usage"].arr().mapNotNull { it.str() }
            if (usage.isNotEmpty() && "sticker" !in usage) return@mapNotNull null
            val info = o["info"].obj()
            Sticker(short, o["url"].str() ?: return@mapNotNull null, o["body"].str() ?: short, info["w"].int(), info["h"].int(), info["mimetype"].str())
        }
        return StickerPack(key, name, stickers)
    }

    /** Rooms that have a "don't notify" push rule. */
    fun parseMuted(ev: JsonObject): Set<String> {
        val global = ev["content"].obj()["global"].obj()
        val muted = mutableSetOf<String>()
        fun silent(rule: JsonObject) = (rule["enabled"] as? JsonPrimitive)?.booleanOrNull != false &&
            rule["actions"].arr().none { it.str() == "notify" }
        for (r in global["override"].arr()) {
            val rule = r.obj()
            if (!silent(rule)) continue
            val cond = rule["conditions"].arr().map { it.obj() }
            val room = cond.firstOrNull { it["kind"].str() == "event_match" && it["key"].str() == "room_id" }?.get("pattern").str()
            if (room != null && cond.size == 1) muted.add(room)
        }
        for (r in global["room"].arr()) {
            val rule = r.obj()
            if (silent(rule)) rule["rule_id"].str()?.let { muted.add(it) }
        }
        return muted
    }

    private fun stickerMsg(e: JsonObject): Msg? {
        val c = e["content"].obj()
        val info = c["info"].obj()
        return Msg(
            id = e["event_id"].str() ?: return null, sender = e["sender"].str() ?: return null, ts = e["origin_server_ts"].long() ?: 0L,
            type = "m.image", body = c["body"].str() ?: "Sticker", mxc = c["url"].str() ?: return null, mime = info["mimetype"].str(),
            w = info["w"].int(), h = info["h"].int(), sticker = true,
        )
    }

    private fun pollText(el: JsonElement?): String? {
        val o = el.obj()
        return o["org.matrix.msc1767.text"].str() ?: o["body"].str()
            ?: o["m.text"].arr().firstNotNullOfOrNull { it.obj()["body"].str() } ?: (el as? JsonPrimitive)?.contentOrNull
    }

    fun toPollMsg(e: JsonObject): Msg? {
        val content = e["content"].obj()
        val p = (content["org.matrix.msc3381.poll.start"] ?: content["m.poll"]).obj()
        val question = pollText(p["question"]) ?: return null
        val answers = p["answers"].arr().mapNotNull { a -> a.obj().let { o -> o["id"].str()?.let { id -> pollText(o)?.let { PollAnswer(id, it) } } } }
        if (answers.size < 2) return null
        val kind = p["kind"].str().orEmpty()
        return Msg(
            id = e["event_id"].str() ?: return null, sender = e["sender"].str() ?: return null, ts = e["origin_server_ts"].long() ?: 0L,
            type = "m.poll", body = question,
            poll = PollInfo(question, answers, p["max_selections"].int() ?: 1, disclosed = !kind.endsWith("undisclosed")),
        )
    }

    fun toMsg(e: JsonObject): Msg? {
        if (e["type"].str() != "m.room.message") return null
        val content = e["content"].obj()
        val type = content["msgtype"].str() ?: return null // redacted events have empty content
        val info = content["info"].obj()
        val reply = content["m.relates_to"].obj()["m.in_reply_to"].obj()["event_id"].str()
        var body = content["body"].str() ?: ""
        if (reply != null) body = stripReplyFallback(body)
        return Msg(
            id = e["event_id"].str() ?: return null,
            sender = e["sender"].str() ?: return null,
            ts = e["origin_server_ts"].long() ?: 0L,
            type = type,
            body = body,
            mxc = content["url"].str(),
            mime = info["mimetype"].str(),
            size = info["size"].long(),
            w = info["w"].int(),
            h = info["h"].int(),
            durationMs = info["duration"].long() ?: content["org.matrix.msc1767.audio"].obj()["duration"].long(),
            replyTo = reply,
            txn = e["unsigned"].obj()["transaction_id"].str(),
            geo = content["geo_uri"].str(),
            voice = content["org.matrix.msc3245.voice"] != null || content["org.matrix.msc1767.audio"].obj()["waveform"] != null,
            mentions = content["m.mentions"].obj()["user_ids"].arr().mapNotNull { it.str() },
            html = if (content["format"].str() == "org.matrix.html") content["formatted_body"].str() else null,
        )
    }

    /** Older clients prefix replies with a quoted copy of the parent ("> <@user> text\n\nreply"). */
    fun stripReplyFallback(body: String): String {
        if (!body.startsWith("> ")) return body
        val lines = body.lines()
        val firstReal = lines.indexOfFirst { !it.startsWith(">") }
        if (firstReal < 0) return body
        return lines.drop(firstReal).dropWhile { it.isBlank() }.joinToString("\n")
    }

    /** Display name for a chat, falling back to the other participant for unnamed DMs. */
    fun displayName(chat: ChatState, me: String): String {
        if (chat.name.isNotBlank()) return chat.name
        val other = (chat.heroes + chat.joined).firstOrNull { it != me }
        return other?.let { chat.members[it] ?: chat.nameOf(it) } ?: "Unnamed chat"
    }
}
