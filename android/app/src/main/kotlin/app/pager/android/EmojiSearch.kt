package app.pager.android

import android.content.Context

/**
 * Names and keywords for every emoji (from the open-source Emojibase data, MIT licence), so the pickers can be searched: "fire", "thumbs",
 * "lol", "heart eyes".
 */
object EmojiSearch {
    private var table: List<Pair<String, List<String>>>? = null

    private fun load(context: Context): List<Pair<String, List<String>>> = table ?: context.applicationContext.assets.open("emoji_names.tsv").bufferedReader().useLines { lines ->
        lines.mapNotNull { l ->
            val i = l.indexOf('\t')
            if (i > 0) l.substring(0, i) to l.substring(i + 1).replace('-', ' ').replace('_', ' ').split(' ') else null
        }.toList()
    }.also { table = it }

    /** Emoji whose name or keywords match every word you typed (each word may be the start of a word). Best matches first. */
    fun search(context: Context, query: String, limit: Int = 150): List<String> = rank(load(context), query, limit)

    fun rank(entries: List<Pair<String, List<String>>>, query: String, limit: Int = 150): List<String> {
        val words = query.lowercase().trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
        if (words.isEmpty()) return emptyList()
        val scored = ArrayList<Triple<Int, Int, String>>()
        entries.forEachIndexed { order, (emoji, tokens) ->
            var score = 0
            for (w in words) {
                val exact = w in tokens
                if (!exact && tokens.none { it.startsWith(w) }) return@forEachIndexed
                score += if (tokens.first().startsWith(w)) 4 else if (exact) 3 else 1
            }
            scored += Triple(score, order, emoji)
        }
        return scored.sortedWith(compareByDescending<Triple<Int, Int, String>> { it.first }.thenBy { it.second }).take(limit).map { it.third }
    }
}
