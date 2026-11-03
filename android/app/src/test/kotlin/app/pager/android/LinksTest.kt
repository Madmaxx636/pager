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

    @Test fun theMergedRowSitsWherethePinnedChatIsPinned() {
        // "b" spoke last but is not pinned; "a" is pinned at place 3. The row must sit at place 3, or moving pins would seem to do nothing.
        val a = sum("a", "signal", 100, pinned = true).copy(pinOrder = 3.0)
        val b = sum("b", "gmessages", 200).copy(pinOrder = Double.MAX_VALUE)
        val rows = Links.merge(listOf(a, b), listOf(listOf("a", "b")))
        assertEquals(1, rows.size); assertEquals("b", rows[0].id); assertEquals(3.0, rows[0].pinOrder, 0.0)
        // both pinned: the earlier place
        val both = Links.merge(listOf(a.copy(pinOrder = 5.0), b.copy(pinned = true, pinOrder = 2.0)), listOf(listOf("a", "b")))
        assertEquals(2.0, both[0].pinOrder, 0.0)
    }

    @Test fun aContactsOtherChatsShareTheirSettings() {
        fun c(id: String, name: String, net: String = "whatsapp", group: Boolean = false) = Links.Candidate(id, name, net, group)
        val idx = Links.contactIndex(listOf(c("a", "Sam Lee"), c("b", "sam lee", "signal"), c("c", "Sam Lee (WA)"), c("d", "Pat")), emptyList())
        assertEquals(listOf("b", "c"), idx["a"]!!.sorted()); assertNull(idx["d"])
        // merged chats always belong together, whatever their names; and a merged chat also brings the same-name chats of its partner
        val merged = Links.contactIndex(listOf(c("a", "Sam"), c("b", "Samantha", "signal"), c("x", "Samantha")), listOf(listOf("a", "b")))
        assertEquals(listOf("b", "x"), merged["a"]!!.sorted())
        // groups, Matrix chats and different people are never joined
        assertEquals(0, Links.contactIndex(listOf(c("g1", "Family", group = true), c("g2", "Family", "signal", true), c("m1", "Sam", "matrix"), c("m2", "Sam", "matrix"), c("a", "Sam"), c("b", "Pat", "signal")), emptyList()).size)
    }

    @Test fun showsOneRowTheNewestChatWithUnreadAddedUp() {
        val rows = Links.merge(listOf(sum("a", "signal", 100, 2), sum("x", "whatsapp", 90), sum("b", "gmessages", 200, 3, pinned = true)), listOf(listOf("a", "b")))
        assertEquals(listOf("b", "x"), rows.map { it.id })
        assertEquals(5, rows[0].unread); assertEquals(true, rows[0].pinned)
        assertEquals(setOf("gmessages", "signal"), rows[0].linked.map { it.second }.toSet())
        assertNull(Links.merge(listOf(sum("a", "signal", 1)), listOf(listOf("a", "b")))[0].linked.firstOrNull())
    }

    @Test fun mergesChatsInTimeOrderRemembersWhereEachBelongsAndAddsUpUnread() {
        fun msg(id: String, ts: Long) = Msg(id, "@a:x", ts, "m.text", id)
        val chats = mapOf("s" to ChatState("s", network = "signal", unread = 1, messages = listOf(msg("1", 10), msg("3", 30))), "g" to ChatState("g", network = "gmessages", unread = 2, messages = listOf(msg("2", 20), msg("3", 30))))
        val m = Links.buildMerged(chats, listOf(listOf("s", "g")), "s")!!
        assertEquals(listOf("1", "2", "3"), m.messages.map { it.id })
        assertEquals(listOf("s", "g", "s"), m.messages.map { it.room })
        assertEquals(3, m.unread); assertEquals("s", m.id)
        assertNull(Links.buildMerged(chats, emptyList(), "s"))
    }
}
