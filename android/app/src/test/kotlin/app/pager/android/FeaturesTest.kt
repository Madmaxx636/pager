package app.pager.android

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FeaturesTest {
    private val me = "@me:pager.test"
    private fun parse(s: String): JsonObject = json.parseToJsonElement(s).jsonObject
    private fun sync(events: String, extra: String = "") = parse(
        """{"rooms":{"join":{"!g:x":{"state":{"events":[
             {"type":"m.room.name","state_key":"","content":{"name":"Trip"}},
             {"type":"m.room.member","state_key":"$me","content":{"membership":"join","displayname":"Me"}},
             {"type":"m.room.member","state_key":"@a:x","content":{"membership":"join","displayname":"Alex"}}]},
           "summary":{"m.joined_member_count":4},
           "timeline":{"events":[$events]}$extra}}}}""",
    )
    private val base get() = SyncReducer.apply(emptyMap(), sync(""), me, true).chats

    @Test fun groupsAreDetectedFromMemberCount() {
        assertTrue(base.getValue("!g:x").isGroup)
        assertEquals(4, base.getValue("!g:x").memberCount)
    }

    @Test fun mentionsAreFlaggedForNotifications() {
        val r = SyncReducer.apply(base, sync(
            """{"type":"m.room.message","event_id":"${'$'}1","sender":"@a:x","origin_server_ts":1,"content":{"msgtype":"m.text","body":"hey @Me look","m.mentions":{"user_ids":["$me"]}}},
               {"type":"m.room.message","event_id":"${'$'}2","sender":"@a:x","origin_server_ts":2,"content":{"msgtype":"m.text","body":"unrelated"}}"""), me, false)
        assertEquals(listOf(true, false), r.incoming.map { it.mentioned })
        assertTrue(r.incoming.all { it.isGroup })
        assertEquals("Trip", r.incoming[0].chat)
    }

    @Test fun stickersLocationsAndEmotesParse() {
        val msgs = SyncReducer.apply(base, sync(
            """{"type":"m.sticker","event_id":"${'$'}s","sender":"@a:x","origin_server_ts":1,"content":{"body":"wave","url":"mxc://x/s","info":{"mimetype":"image/webp","w":128,"h":128}}},
               {"type":"m.room.message","event_id":"${'$'}l","sender":"@a:x","origin_server_ts":2,"content":{"msgtype":"m.location","body":"Here","geo_uri":"geo:51.5,-0.12"}},
               {"type":"m.room.message","event_id":"${'$'}e","sender":"@a:x","origin_server_ts":3,"content":{"msgtype":"m.emote","body":"waves"}},
               {"type":"m.room.message","event_id":"${'$'}v","sender":"@a:x","origin_server_ts":4,"content":{"msgtype":"m.audio","body":"v","url":"mxc://x/v","info":{"duration":9000},"org.matrix.msc3245.voice":{}}}"""), me, false)
            .chats.getValue("!g:x").messages
        assertTrue(msgs[0].sticker); assertEquals("m.image", msgs[0].type)
        assertEquals("geo:51.5,-0.12", msgs[1].geo); assertEquals("Location", previewOf(msgs[1]))
        assertEquals("* waves", previewOf(msgs[2]))
        assertTrue(msgs[3].voice); assertEquals(9000L, msgs[3].durationMs); assertEquals("Voice message", previewOf(msgs[3]))
    }

    @Test fun quietHoursHandleWrapAroundMidnight() {
        val s = AppSettings(quietHoursEnabled = true, quietStartMin = 22 * 60, quietEndMin = 7 * 60)
        assertTrue(inQuietHours(s, 23 * 60)); assertTrue(inQuietHours(s, 3 * 60)); assertFalse(inQuietHours(s, 12 * 60))
        assertFalse(inQuietHours(s.copy(quietHoursEnabled = false), 23 * 60))
        val day = AppSettings(quietHoursEnabled = true, quietStartMin = 9 * 60, quietEndMin = 17 * 60)
        assertTrue(inQuietHours(day, 10 * 60)); assertFalse(inQuietHours(day, 18 * 60))
    }

    @Test fun settingsAndChatsSurviveSerialization() {
        val s = AppSettings(accent = "purple", fontScale = 1.2f, hiddenNetworks = setOf("signal"), quickReactions = listOf("🔥", "🎉"), swipeLeft = "pin")
        assertEquals(s, json.decodeFromString(AppSettings.serializer(), json.encodeToString(AppSettings.serializer(), s)))
        // Old saved settings missing newer fields still load with defaults.
        assertEquals("teal", json.decodeFromString(AppSettings.serializer(), """{"themeMode":"dark"}""").accent)
        val chat = base.getValue("!g:x").copy(tags = setOf("m.favourite"), reactions = mapOf("${'$'}1" to mapOf("👍" to listOf("@a:x"))))
        assertEquals(chat, json.decodeFromString(ChatState.serializer(), json.encodeToString(ChatState.serializer(), chat)))
    }

    @Test fun defaultQuickReactionsAreSixAndEditable() {
        assertEquals(6, AppSettings().quickReactions.size)
        assertEquals("🔥", AppSettings().copy(quickReactions = AppSettings().quickReactions.toMutableList().also { it[0] = "🔥" }).quickReactions[0])
    }

    @Test fun emojiPickerCoversEveryCategoryWithoutBlanks() {
        assertTrue(EMOJI_CATEGORIES.size >= 9)
        assertTrue(EMOJI_CATEGORIES.sumOf { it.second.size } > 400)
        assertTrue(EMOJI_CATEGORIES.all { (_, l) -> l.none { it.isBlank() } })
    }

    @Test fun loginStateLabelsAndAttention() {
        assertTrue(needsAttention("BAD_CREDENTIALS")); assertFalse(needsAttention("CONNECTED"))
        assertEquals("Connected", loginStateLabel("CONNECTED").first)
        assertEquals("Reconnecting…", loginStateLabel("TRANSIENT_DISCONNECT").first)
    }
}
