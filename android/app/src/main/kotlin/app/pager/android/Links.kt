package app.pager.android

/** Chats with the same person on different networks (say Signal and Google Messages) that you chose to show as one. Saved in your account, so every device agrees. */
object Links {
    /** What identifies a person across networks: the last digits of a phone number, else the name. */
    fun key(name: String): String {
        val p = Names.phoneKey(name)
        if (p.isNotEmpty()) return "p$p"
        val n = Names.stripTag(name).trim().lowercase().replace(Regex("\\s+"), " ")
        return if (n.isEmpty()) "" else "n$n"
    }

    fun groupOf(links: List<List<String>>, id: String) = links.firstOrNull { id in it }

    /** Joins two chats (and anything either was already joined with). */
    fun add(links: List<List<String>>, a: String, b: String): List<List<String>> {
        if (a == b) return links
        val ga = groupOf(links, a) ?: listOf(a); val gb = groupOf(links, b) ?: listOf(b)
        return links.filter { it != groupOf(links, a) && it != groupOf(links, b) } + listOf((ga + gb).distinct())
    }

    /** Takes one chat out of its group; a group of one is dropped. */
    fun unlink(links: List<List<String>>, id: String) = links.map { g -> g.filter { it != id } }.filter { it.size > 1 }

    class Candidate(val id: String, val name: String, val network: String, val isGroup: Boolean)

    /** Pairs of one-to-one chats on different networks that look like the same person and are not joined yet. */
    fun suggest(chats: List<Candidate>, links: List<List<String>>): List<Pair<String, String>> {
        val byKey = chats.filter { !it.isGroup && it.network != "matrix" }.groupBy { key(it.name) }.filterKeys { it.isNotEmpty() }
        val out = mutableListOf<Pair<String, String>>()
        for (list in byKey.values) for (i in list.indices) for (j in i + 1 until list.size) {
            val a = list[i]; val b = list[j]
            if (a.network == b.network) continue
            if (groupOf(links, a.id)?.contains(b.id) == true) continue
            out.add(a.id to b.id)
        }
        return out
    }

    /** One row per group: the chat that spoke last stands for all of them, with their unread counts added up. */
    fun merge(items: List<ChatSummary>, links: List<List<String>>): List<ChatSummary> {
        if (links.isEmpty()) return items
        val byId = items.associateBy { it.id }
        val done = HashSet<String>()
        val out = mutableListOf<ChatSummary>()
        for (it in items) {
            if (it.id in done) continue
            val g = groupOf(links, it.id)
            val members = g?.mapNotNull { id -> byId[id] }.orEmpty()
            if (g == null || members.size < 2) { out.add(it); continue }
            members.forEach { m -> done.add(m.id) }
            val top = members.maxByOrNull { m -> m.ts }!!
            out.add(top.copy(
                unread = members.sumOf { m -> m.unread }, markedUnread = members.any { m -> m.markedUnread }, pinned = members.any { m -> m.pinned },
                muted = members.all { m -> m.muted }, archived = members.all { m -> m.archived }, linked = members.map { m -> m.id to m.network },
            ))
        }
        return out
    }

    /** One chat made of every chat in the person's linked group, oldest message first, for the merged view. Null when there is nothing to merge. */
    fun buildMerged(chats: Map<String, ChatState>, links: List<List<String>>, roomId: String): ChatState? {
        val ids = groupOf(links, roomId)?.filter { it in chats }.orEmpty()
        val prim = chats[roomId]
        if (ids.size < 2 || prim == null) return null
        val all = ids.mapNotNull { chats[it] }
        val seen = HashSet<String>()
        val messages = all.flatMap { c -> c.messages.map { it.copy(room = c.id) } }.filter { seen.add(it.id) }.sortedBy { it.ts }
        return prim.copy(
            messages = messages, unread = all.sumOf { it.unread }, markedUnread = all.any { it.markedUnread },
            reactions = all.fold(emptyMap()) { a, c -> a + c.reactions }, reactionRefs = all.fold(emptyMap()) { a, c -> a + c.reactionRefs },
            pollVotes = all.fold(emptyMap()) { a, c -> a + c.pollVotes }, pollEnded = all.flatMap { it.pollEnded }.toSet(),
            receipts = all.fold(emptyMap()) { a, c -> a + c.receipts }, eventTs = all.fold(emptyMap()) { a, c -> a + c.eventTs }, members = all.fold(emptyMap()) { a, c -> a + c.members },
            typing = all.flatMap { it.typing }.toSet(), encrypted = all.all { it.encrypted }, reachedStart = all.all { it.reachedStart },
        )
    }
}
