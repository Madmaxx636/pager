package app.pager.android

/** One run of text with its formatting, produced from Matrix formatted_body HTML or from the markdown you type. */
data class Span(
    val text: String,
    val bold: Boolean = false,
    val italic: Boolean = false,
    val strike: Boolean = false,
    val underline: Boolean = false,
    val code: Boolean = false,
    val link: String? = null,
    val quote: Boolean = false,
)

object Format {
    private val ENTITY = mapOf("&amp;" to "&", "&lt;" to "<", "&gt;" to ">", "&quot;" to "\"", "&#39;" to "'", "&apos;" to "'", "&nbsp;" to " ")
    private fun unescape(s: String) = Regex("&(?:amp|lt|gt|quot|apos|nbsp|#39);").replace(s) { ENTITY[it.value] ?: it.value }
        .let { t -> Regex("&#(\\d+);").replace(t) { m -> m.groupValues[1].toIntOrNull()?.let { String(Character.toChars(it)) } ?: m.value } }

    /** Parses the small HTML subset Matrix clients and bridges use. Unknown tags are dropped, their text kept. */
    fun parseHtml(html: String): List<Span> {
        val out = mutableListOf<Span>()
        var bold = 0; var italic = 0; var strike = 0; var under = 0; var code = 0; var quote = 0
        val links = ArrayDeque<String?>()
        val tag = Regex("<(/?)([a-zA-Z0-9]+)([^>]*)>")
        var pos = 0
        fun emit(raw: String) {
            if (raw.isEmpty()) return
            out.add(Span(unescape(raw), bold > 0, italic > 0, strike > 0, under > 0, code > 0, links.lastOrNull(), quote > 0))
        }
        for (m in tag.findAll(html)) {
            emit(html.substring(pos, m.range.first))
            pos = m.range.last + 1
            val closing = m.groupValues[1] == "/"
            val name = m.groupValues[2].lowercase()
            val delta = if (closing) -1 else 1
            when (name) {
                "b", "strong" -> bold += delta
                "i", "em" -> italic += delta
                "s", "del", "strike" -> strike += delta
                "u", "ins" -> under += delta
                "code", "pre" -> code += delta
                "blockquote" -> quote += delta
                "br" -> emit("\n")
                "p", "div", "li" -> if (closing && out.isNotEmpty() && !out.last().text.endsWith("\n")) emit("\n") else if (!closing && name == "li") emit("• ")
                "a" -> if (closing) { if (links.isNotEmpty()) links.removeLast() } else links.addLast(Regex("href=\"([^\"]*)\"").find(m.groupValues[3])?.groupValues?.get(1)?.let { unescape(it) })
            }
            if (bold < 0) bold = 0; if (italic < 0) italic = 0; if (strike < 0) strike = 0; if (under < 0) under = 0; if (code < 0) code = 0; if (quote < 0) quote = 0
        }
        emit(html.substring(pos))
        // Trim a trailing newline left by the last block element.
        if (out.isNotEmpty() && out.last().text.endsWith("\n")) out[out.lastIndex] = out.last().copy(text = out.last().text.trimEnd('\n'))
        return out.filter { it.text.isNotEmpty() }
    }

    private val MD = listOf(
        Regex("```([\\s\\S]+?)```") to "pre",
        Regex("`([^`\\n]+)`") to "code",
        Regex("\\*\\*([^*\\n]+)\\*\\*") to "b",
        Regex("(?<![\\w*])\\*([^*\\n]+)\\*(?![\\w*])") to "i",
        Regex("(?<![\\w_])_([^_\\n]+)_(?![\\w_])") to "i",
        Regex("~~([^~\\n]+)~~") to "s",
    )

    private fun esc(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    /** Turns *, **, _, ~~, ` and ``` markdown into Matrix HTML. Returns null when nothing is formatted. */
    fun markdownToHtml(text: String): String? {
        var html = esc(text)
        var changed = false
        // Code spans first, protected from further formatting.
        val stash = mutableListOf<String>()
        for ((re, tag) in MD.take(2)) html = re.replace(html) { m -> changed = true; stash.add(if (tag == "pre") "<pre><code>${m.groupValues[1]}</code></pre>" else "<code>${m.groupValues[1]}</code>"); "\u0000${stash.lastIndex}\u0000" }
        for ((re, tag) in MD.drop(2)) html = re.replace(html) { m -> changed = true; "<$tag>${m.groupValues[1]}</$tag>" }
        if (!changed) return null
        html = Regex("\u0000(\\d+)\u0000").replace(html) { stash[it.groupValues[1].toInt()] }
        return html.replace("\n", "<br>")
    }

    /** Plain text with the markdown markers kept (the fallback body bridges and old clients see). */
    fun isEmojiOnly(text: String, max: Int = 3): Boolean {
        val t = text.trim()
        if (t.isEmpty() || t.length > 40) return false
        var count = 0
        var i = 0
        while (i < t.length) {
            val cp = t.codePointAt(i)
            i += Character.charCount(cp)
            when {
                cp == 0x200D || cp == 0xFE0F || cp in 0x1F3FB..0x1F3FF || cp == 0x20E3 || Character.isWhitespace(cp) -> continue
                cp in 0x1F300..0x1FAFF || cp in 0x2600..0x27BF || cp in 0x2300..0x23FF || cp in 0x1F1E6..0x1F1FF || cp in 0x2190..0x21FF || cp == 0x00A9 || cp == 0x00AE || cp in 0x2B00..0x2BFF || cp == 0x203C || cp == 0x2049 -> {
                    // A ZWJ sequence or flag pair counts once.
                    val prev = if (i - Character.charCount(cp) > 0) t.codePointBefore(i - Character.charCount(cp)) else 0
                    if (!(prev == 0x200D || (cp in 0x1F1E6..0x1F1FF && prev in 0x1F1E6..0x1F1FF && count > 0 && flagOpen))) count++
                    flagOpen = cp in 0x1F1E6..0x1F1FF && !flagOpen
                }
                else -> return false
            }
        }
        return count in 1..max
    }
    private var flagOpen = false
}
