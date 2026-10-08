package app.pager.android

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncReducerTest {
    private val me = "@me:pager.test"
    private fun parse(s: String): JsonObject = json.parseToJsonElement(s).jsonObject

    private val firstSync = parse(
        """
        {"rooms":{"join":{"!a:x":{
          "state":{"events":[
            {"type":"m.room.name","state_key":"","sender":"@wa_mom:pager.test","content":{"name":"Mom"}},
            {"type":"m.bridge","state_key":"bridge-whatsapp","sender":"@wa_mom:pager.test","content":{"protocol":{"id":"whatsapp"}}},
            {"type":"m.room.member","state_key":"@me:pager.test","sender":"@me:pager.test","content":{"membership":"join","displayname":"Me"}},
            {"type":"m.room.member","state_key":"@wa_mom:pager.test","sender":"@wa_mom:pager.test","content":{"membership":"join","displayname":"Mom"}}
          ]},
          "timeline":{"events":[
            {"type":"m.room.message","event_id":"${'$'}1","sender":"@wa_mom:pager.test","origin_server_ts":1000,"content":{"msgtype":"m.text","body":"Coming Sunday?"}},
            {"type":"m.room.message","event_id":"${'$'}2","sender":"@me:pager.test","origin_server_ts":2000,"content":{"msgtype":"m.text","body":"Yes!"}}
          ]},
          "unread_notifications":{"notification_count":1}
        },
        "!bot:x":{"state":{"events":[
            {"type":"m.room.member","state_key":"@me:pager.test","sender":"@me:pager.test","content":{"membership":"join"}},
            {"type":"m.room.member","state_key":"@whatsappbot:pager.test","sender":"@whatsappbot:pager.test","content":{"membership":"join"}}
        ]},"timeline":{"events":[]}}
        },"invite":{"!inv:x":{}}}}
        """,
    )

    @Test fun parsesRoomsNamesNetworksAndMessages() {
        val r = SyncReducer.apply(emptyMap(), firstSync, me, initial = true)
        val chat = r.chats.getValue("!a:x")
        assertEquals("Mom", chat.name)
        assertEquals("whatsapp", chat.network)
        assertEquals(listOf("Coming Sunday?", "Yes!"), chat.messages.map { it.body })
        assertEquals("Mom", chat.nameOf("@wa_mom:pager.test"))
        assertEquals(1, chat.unread)
        assertEquals("Yes!", chat.preview)
        assertEquals(listOf("!inv:x"), r.invites)
    }

    @Test fun initialSyncDoesNotNotify() {
        assertTrue(SyncReducer.apply(emptyMap(), firstSync, me, initial = true).incoming.isEmpty())
    }

    @Test fun hidesBridgeBotRooms() {
        val chats = SyncReducer.apply(emptyMap(), firstSync, me, initial = true).chats
        assertTrue(chats.getValue("!bot:x").isBotRoom(me))
        assertFalse(chats.getValue("!a:x").isBotRoom(me))
    }

    @Test fun laterSyncNotifiesOnlyForOthersAndDedupes() {
        val base = SyncReducer.apply(emptyMap(), firstSync, me, initial = true).chats
        val next = parse(
            """{"rooms":{"join":{"!a:x":{"timeline":{"events":[
              {"type":"m.room.message","event_id":"${'$'}2","sender":"@me:pager.test","origin_server_ts":2000,"content":{"msgtype":"m.text","body":"Yes!"}},
              {"type":"m.room.message","event_id":"${'$'}3","sender":"@wa_mom:pager.test","origin_server_ts":3000,"content":{"msgtype":"m.text","body":"Great"}}
            ]},"unread_notifications":{"notification_count":2}}}}}""",
        )
        val r = SyncReducer.apply(base, next, me, initial = false)
        assertEquals(3, r.chats.getValue("!a:x").messages.size)
        assertEquals(1, r.incoming.size)
        assertEquals("Great", r.incoming[0].text)
        assertEquals("Mom", r.incoming[0].chat)
    }

    @Test fun ignoresEditsAndLeavingRemovesRoom() {
        val base = SyncReducer.apply(emptyMap(), firstSync, me, initial = true).chats
        val next = parse(
            """{"rooms":{"join":{"!a:x":{"timeline":{"events":[
              {"type":"m.room.message","event_id":"${'$'}4","sender":"@wa_mom:pager.test","origin_server_ts":4000,
               "content":{"msgtype":"m.text","body":"* edited","m.relates_to":{"rel_type":"m.replace","event_id":"${'$'}1"}}}
            ]}}},"leave":{"!bot:x":{}}}}""",
        )
        val r = SyncReducer.apply(base, next, me, initial = false)
        assertEquals(2, r.chats.getValue("!a:x").messages.size)
        assertFalse(r.chats.containsKey("!bot:x"))
    }

    @Test fun unnamedDmFallsBackToOtherPerson() {
        val chat = SyncReducer.apply(emptyMap(), parse(
            """{"rooms":{"join":{"!d:x":{"state":{"events":[
              {"type":"m.room.member","state_key":"@me:pager.test","content":{"membership":"join"}},
              {"type":"m.room.member","state_key":"@sg_alex:pager.test","content":{"membership":"join","displayname":"Alex Rivera"}}
            ]}}}}}"""), me, true).chats.getValue("!d:x")
        assertEquals("Alex Rivera", SyncReducer.displayName(chat, me))
    }

    private fun joinWith(events: String, extra: String = "") = parse(
        """{"rooms":{"join":{"!a:x":{"timeline":{"events":[$events]$extra}}}}}""",
    )
    private fun msg(id: String, who: String, ts: Long, body: String) =
        """{"type":"m.room.message","event_id":"$id","sender":"$who","origin_server_ts":$ts,"content":{"msgtype":"m.text","body":"$body"}}"""
    private val base get() = SyncReducer.apply(emptyMap(), firstSync, me, initial = true).chats
    private val mom = "@wa_mom:pager.test"

    @Test fun reactionsAggregateAndRedactionsRemoveThem() {
        val withReaction = SyncReducer.apply(base, joinWith(
            """{"type":"m.reaction","event_id":"${'$'}r1","sender":"$mom","content":{"m.relates_to":{"rel_type":"m.annotation","event_id":"${'$'}1","key":"👍"}}},
               {"type":"m.reaction","event_id":"${'$'}r2","sender":"$me","content":{"m.relates_to":{"rel_type":"m.annotation","event_id":"${'$'}1","key":"👍"}}}"""),
            me, false).chats
        assertEquals(listOf(mom, me), withReaction.getValue("!a:x").reactions["${'$'}1"]!!["👍"])
        val removed = SyncReducer.apply(withReaction, joinWith("""{"type":"m.room.redaction","event_id":"${'$'}x","sender":"$me","redacts":"${'$'}r2","content":{}}"""), me, false).chats
        assertEquals(listOf(mom), removed.getValue("!a:x").reactions["${'$'}1"]!!["👍"])
    }

    @Test fun editsReplaceBodyOnlyForTheOriginalSender() {
        val edited = SyncReducer.apply(base, joinWith(
            """{"type":"m.room.message","event_id":"${'$'}e1","sender":"$mom","origin_server_ts":5000,"content":{"msgtype":"m.text","body":"* Coming Saturday?",
                "m.new_content":{"msgtype":"m.text","body":"Coming Saturday?"},"m.relates_to":{"rel_type":"m.replace","event_id":"${'$'}1"}}},
               {"type":"m.room.message","event_id":"${'$'}e2","sender":"$me","origin_server_ts":6000,"content":{"msgtype":"m.text","body":"* hacked",
                "m.new_content":{"msgtype":"m.text","body":"hacked"},"m.relates_to":{"rel_type":"m.replace","event_id":"${'$'}1"}}}"""),
            me, false).chats.getValue("!a:x").messages
        assertEquals("Coming Saturday?", edited.first { it.id == "${'$'}1" }.body)
        assertTrue(edited.first { it.id == "${'$'}1" }.edited)
    }

    @Test fun redactedMessagesDisappearAndEmptyContentIsSkipped() {
        val r = SyncReducer.apply(base, joinWith(
            """{"type":"m.room.redaction","event_id":"${'$'}x","sender":"$mom","redacts":"${'$'}1","content":{}},
               {"type":"m.room.message","event_id":"${'$'}gone","sender":"$mom","origin_server_ts":9,"content":{}}"""), me, false).chats.getValue("!a:x")
        assertEquals(listOf("${'$'}2"), r.messages.map { it.id })
    }

    @Test fun repliesAreLinkedAndFallbackQuotesStripped() {
        val r = SyncReducer.apply(base, joinWith(
            """{"type":"m.room.message","event_id":"${'$'}re","sender":"$mom","origin_server_ts":7000,"content":{"msgtype":"m.text",
                "body":"> <$me> Yes!\n\nGreat, see you","m.relates_to":{"m.in_reply_to":{"event_id":"${'$'}2"}}}}"""), me, false).chats.getValue("!a:x")
        val reply = r.messages.last()
        assertEquals("${'$'}2", reply.replyTo)
        assertEquals("Great, see you", reply.body)
    }

    @Test fun localEchoIsReplacedByTheServerEvent() {
        val withLocal = base.getValue("!a:x").let { c ->
            mapOf("!a:x" to c.copy(messages = c.messages + Msg("local-t1", me, 3000, "m.text", "hi", txn = "t1", status = STATUS_SENDING)))
        }
        val r = SyncReducer.apply(withLocal, joinWith(
            """{"type":"m.room.message","event_id":"${'$'}real","sender":"$me","origin_server_ts":3001,"unsigned":{"transaction_id":"t1"},"content":{"msgtype":"m.text","body":"hi"}}"""),
            me, false).chats.getValue("!a:x").messages
        assertEquals(listOf("${'$'}1", "${'$'}2", "${'$'}real"), r.map { it.id })
    }

    @Test fun historyPrependsOlderMessagesAndTracksTheStartOfTheRoom() {
        val chunk = listOf(parse(msg("${'$'}0b", mom, 400, "second oldest")), parse(msg("${'$'}0a", mom, 300, "oldest")))
        val more = SyncReducer.applyHistory(base.getValue("!a:x"), chunk, "tok2")
        assertEquals(listOf("oldest", "second oldest", "Coming Sunday?", "Yes!"), more.messages.map { it.body })
        assertEquals("tok2", more.prevBatch); assertFalse(more.reachedStart)
        assertTrue(SyncReducer.applyHistory(more, emptyList(), null).reachedStart)
    }

    @Test fun limitedSyncStartsTheTimelineOver() {
        val r = SyncReducer.apply(base, joinWith(msg("${'$'}9", mom, 9000, "after gap"), ""","limited":true,"prev_batch":"gap1""""), me, false).chats.getValue("!a:x")
        assertEquals(listOf("after gap"), r.messages.map { it.body })
        assertEquals("gap1", r.prevBatch)
    }

    @Test fun tagsMarkedUnreadReceiptsTypingAndMuting() {
        val sync = parse(
            """{"rooms":{"join":{"!a:x":{
               "ephemeral":{"events":[
                 {"type":"m.typing","content":{"user_ids":["$mom","$me"]}},
                 {"type":"m.receipt","content":{"${'$'}2":{"m.read":{"$mom":{"ts":1}}}}}]},
               "account_data":{"events":[
                 {"type":"m.tag","content":{"tags":{"m.favourite":{"order":0.5},"u.archived":{}}}},
                 {"type":"m.marked_unread","content":{"unread":true}}]}}}},
               "account_data":{"events":[{"type":"m.push_rules","content":{"global":{"override":[
                 {"rule_id":"!a:x","enabled":true,"actions":[],"conditions":[{"kind":"event_match","key":"room_id","pattern":"!a:x"}]},
                 {"rule_id":".m.rule.master","enabled":false,"actions":[],"conditions":[]}]}}}]}}""",
        )
        val r = SyncReducer.apply(base, sync, me, false)
        val c = r.chats.getValue("!a:x")
        assertEquals(setOf(mom), c.typing)
        assertEquals("${'$'}2", c.receipts[mom])
        assertTrue(c.pinned && c.archived && c.markedUnread)
        assertEquals(setOf("!a:x"), r.muted)
    }

    @Test fun mediaMessagesCarryUrlAndInfo() {
        val r = SyncReducer.apply(base, joinWith(
            """{"type":"m.room.message","event_id":"${'$'}img","sender":"$mom","origin_server_ts":8000,"content":{"msgtype":"m.image","body":"p.jpg","url":"mxc://pager.test/abc","info":{"mimetype":"image/jpeg","size":1234,"w":800,"h":600}}}"""),
            me, false).chats.getValue("!a:x").messages.last()
        assertEquals("mxc://pager.test/abc", r.mxc); assertEquals(800, r.w); assertEquals(600, r.h); assertEquals("📷 Photo", previewOf(r))
    }
}
