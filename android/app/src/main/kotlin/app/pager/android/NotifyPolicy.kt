package app.pager.android

/** What to do with one incoming message, from every notification setting. Pure, so it is easy to test (and matches the web app). */
object NotifyPolicy {
    data class Decision(val show: Boolean, val silent: Boolean, val preview: String, val direct: Boolean)

    fun keywordHit(text: String, keywords: List<String>): Boolean = keywords.any { k ->
        val w = k.trim()
        w.isNotEmpty() && Regex("(^|[^\\p{L}\\p{N}])" + Regex.escape(w) + "($|[^\\p{L}\\p{N}])", RegexOption.IGNORE_CASE).containsMatchIn(text)
    }

    /** [quiet]: the chat is muted or in Low priority. [day]: 0 = Sunday. */
    fun decide(m: Incoming, quiet: Boolean, pinned: Boolean, nowMin: Int, day: Int, s: AppSettings): Decision {
        val direct = m.mentioned || m.replyToMe || keywordHit(m.text, s.notifKeywords)
        val chat = s.notifChat[m.roomId] ?: ChatNotifPrefs()
        val chatMode = chat.mode.takeIf { it != "default" }
        val netMode = s.notifNetworkMode[m.network] ?: if (m.network in s.notifMutedNetworks) "none" else "all"
        val preview = when (chat.preview) { "show" -> "full"; "hide" -> "hidden"; else -> s.notifPreview }
        val no = Decision(false, true, preview, direct)

        if (!s.notifEnabled || chatMode == "none") return no

        var allowed = when {
            chatMode == "mentions" -> direct
            chatMode == "all" -> true
            netMode == "none" -> false
            netMode == "mentions" -> direct
            (if (m.isGroup) s.notifGroupMode else s.notifDirectMode) == "none" -> false
            (if (m.isGroup) s.notifGroupMode else s.notifDirectMode) == "mentions" -> direct
            else -> {
                val base = when (s.notifScope) { "dm_mentions" -> !m.isGroup || direct; "favorites" -> pinned || direct; else -> true }
                if (m.isGroup && s.notifGroupMentionsOnly && !direct) false else base
            }
        }
        // Priority chats always get through, like Android's priority conversations.
        val priority = chat.level == "priority"
        // Muted and Low priority chats stay quiet except for things about you.
        if (quiet && !direct && !priority) allowed = false
        if (priority) allowed = true
        if (!allowed) return no

        val inQuiet = day in s.notifQuietDays && inQuietHours(s, nowMin)
        val breaks = inQuiet && (priority || ((pinned || direct) && s.notifQuietBreakThrough))
        val silent = (inQuiet && !breaks) || !s.notifSound || chat.sound == "off" || chat.level == "silent"
        return Decision(true, silent, preview, direct)
    }
}
