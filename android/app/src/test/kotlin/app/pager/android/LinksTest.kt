package app.pager.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LinksTest {
    private fun sum(id: String, network: String, ts: Long, unread: Int = 0, pinned: Boolean = false) = ChatSummary(id, "Sam", network, null, "hi", ts, unread, false, pinned, false, false, false, null)

    @Test fun knowsTheSamePersonByNumberOrName() {
        assertEquals(Links.key("+1 (555) 010-2030"), Links.key("5550102030"))
        assertEquals(Links.key("Sam  Lee (WA)"), Links.key("sam lee"))
        assertEquals("", Links.key(""))
    }

    @Test fun joinsAndSplits() {
        var l = Links.add(emptyList(), "a", "b"); l = Links.add(l, "b", "c")
        assertEquals(listOf("a", "b", "c"), Links.groupOf(l, "a")!!.sorted()); assertEquals(1, l.size)
        assertEquals(listOf("a", "b"), Links.groupOf(Links.unlink(l, "c"), "a")!!.sorted())
        assertEquals(emptyList<List<String>>(), Links.unlink(Links.add(emptyList(), "a", "b"), "a"))
    }

    @Test fun suggestsOnlyOneToOneChatsOnDifferentNetworks() {
        val chats = listOf(Links.Candidate("s", "Sam", "signal", false), Links.Candidate("g", "sam", "gmessages", false), Links.Candidate("s2", "Sam", "signal", false), Links.Candidate("grp", "Sam", "gmessages", true))
        assertEquals(2, Links.suggest(chats, emptyList()).size)
        assertEquals(1, Links.suggest(chats, listOf(listOf("s", "g"))).size)
    }

    @Test fun showsOneRowTheNewestChatWithUnreadAddedUp() {
        val rows = Links.merge(listOf(sum("a", "signal", 100, 2), sum("x", "whatsapp", 90), sum("b", "gmessages", 200, 3, pinned = true)), listOf(listOf("a", "b")))
        assertEquals(listOf("b", "x"), rows.map { it.id })
        assertEquals(5, rows[0].unread); assertEquals(true, rows[0].pinned)
        assertEquals(setOf("gmessages", "signal"), rows[0].linked.map { it.second }.toSet())
        assertNull(Links.merge(listOf(sum("a", "signal", 1)), listOf(listOf("a", "b")))[0].linked.firstOrNull())
    }
}
