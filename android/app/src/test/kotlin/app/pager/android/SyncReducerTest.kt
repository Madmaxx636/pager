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
        assertEquals("Mom", chat.messages[0].senderName)
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
}
