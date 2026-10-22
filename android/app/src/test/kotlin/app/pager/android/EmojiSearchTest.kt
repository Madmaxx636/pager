package app.pager.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class EmojiSearchTest {
    private val entries = File("src/main/assets/emoji_names.tsv").readLines().mapNotNull { l ->
        val i = l.indexOf('\t'); if (i > 0) l.substring(0, i) to l.substring(i + 1).replace('-', ' ').replace('_', ' ').split(' ') else null
    }
    @Test fun findsByNameAndKeyword() {
        assertTrue("🔥" in EmojiSearch.rank(entries, "fire"))
        assertTrue("👍" in EmojiSearch.rank(entries, "thumbs up"))
        assertTrue("😍" in EmojiSearch.rank(entries, "heart eyes"))
    }
    @Test fun needsEveryWord() { assertTrue(EmojiSearch.rank(entries, "fire zzzznotaword").isEmpty()) }
    @Test fun nothingForEmptySearch() { assertTrue(EmojiSearch.rank(entries, "  ").isEmpty()) }
    @Test fun nameStartingWithTheWordComesFirst() { assertEquals("🍕", EmojiSearch.rank(entries, "pizza").first()) }
}
