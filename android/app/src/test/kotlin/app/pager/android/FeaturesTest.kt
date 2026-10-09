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

class EffectsTest {
    @Test fun picksEffectsFromContent() {
        assertEquals(Effect.Confetti, Effects.effectFor("congrats!! 🎉"))
        assertEquals(Effect.Balloons, Effects.effectFor("Happy Birthday"))
        assertEquals(Effect.Snow, Effects.effectFor("it's snowing ❄️"))
        assertEquals(Effect.Sparkles, Effects.effectFor("✨"))
        assertEquals(Effect.Hearts, Effects.effectFor("❤️❤️"))
        assertEquals(Effect.Hearts, Effects.effectFor("love you"))
    }
    @Test fun ignoresOrdinaryText() {
        assertEquals(null, Effects.effectFor("see you at 5"))
        assertEquals(null, Effects.effectFor("I ❤️ this really long sentence about pizza"))
    }
    @Test fun animationFinishes() {
        val ps = Effects.spawn(Effect.Confetti, 400f, 300f)
        var alive = true; var n = 0
        while (alive && n++ < 2000) alive = Effects.step(ps, Effect.Confetti, 300f)
        assertFalse(alive)
    }
}

class OwnGhostTest {
    private val me = "@me:pager.test"
    private val ghost = "@whatsapp_lid-111:pager.test"
    private val other = "@whatsapp_222:pager.test"
    private fun parse(s: String) = json.parseToJsonElement(s).jsonObject
    private fun member(id: String, name: String) = """{"type":"m.room.member","state_key":"$id","sender":"$id","content":{"membership":"join","displayname":"$name"}}"""
    private fun text(id: String, sender: String, body: String, ts: Long) = """{"type":"m.room.message","event_id":"$id","sender":"$sender","origin_server_ts":$ts,"content":{"msgtype":"m.text","body":"$body"}}"""

    @org.junit.After fun reset() = SyncReducer.setOwnIdentity(emptyList(), emptyList())

    @Test fun ownGhostMessagesShowAsSent() {
        SyncReducer.setOwnIdentity(listOf("Lane McDonald"), emptyList())
        val sync = parse("""{"rooms":{"join":{"!r:x":{"state":{"events":[${member(ghost, "Lane McDonald (WA)")},${member(other, "Amy")}]},"timeline":{"events":[${text("\$1", ghost, "hi", 1)},${text("\$2", other, "hello", 2)}]}}}}}""")
        val msgs = SyncReducer.apply(emptyMap(), sync, me, true).chats["!r:x"]!!.messages
        assertEquals(listOf(me, other), msgs.map { it.sender })
    }

    @Test fun historyPagesToo() {
        SyncReducer.setOwnIdentity(listOf("Lane McDonald"), emptyList())
        val chat = SyncReducer.apply(emptyMap(), parse("""{"rooms":{"join":{"!r:x":{"state":{"events":[]},"timeline":{"events":[],"prev_batch":"p"}}}}}"""), me, true).chats["!r:x"]!!
        val next = SyncReducer.applyHistory(chat, listOf(parse(text("\$2", other, "hello", 2)), parse(text("\$1", ghost, "hi", 1))), null, listOf(parse(member(ghost, "lane mcdonald"))), me)
        assertEquals(listOf(me, other), next.messages.map { it.sender })
    }

    @Test fun noAccountsMeansNoChange() {
        val sync = parse("""{"rooms":{"join":{"!r:x":{"state":{"events":[${member(ghost, "Lane McDonald")}]},"timeline":{"events":[${text("\$1", ghost, "hi", 1)}]}}}}}""")
        assertEquals(ghost, SyncReducer.apply(emptyMap(), sync, me, true).chats["!r:x"]!!.messages[0].sender)
    }
}

class ReceiptTimesTest {
    private val me = "@me:x"
    private val amy = "@amy:x"
    private fun parse(s: String) = json.parseToJsonElement(s).jsonObject
    private fun text(id: String, sender: String, ts: Long) = """{"type":"m.room.message","event_id":"$id","sender":"$sender","origin_server_ts":$ts,"content":{"msgtype":"m.text","body":"$id"}}"""

    @Test fun readersAndTimes() {
        val sync = parse("""{"rooms":{"join":{"!r:x":{"timeline":{"events":[${text("\$1", me, 1000)},${text("\$2", me, 2000)},${text("\$3", amy, 3000)}]},"ephemeral":{"events":[{"type":"m.receipt","content":{"${'$'}2":{"m.read":{"$amy":{"ts":5000}}}}}]}}}}}""")
        val chat = SyncReducer.apply(emptyMap(), sync, me, true).chats["!r:x"]!!
        assertEquals(listOf<Pair<String, Long?>>(amy to 5000L), chat.readersOf("\$1", me))
        assertEquals(listOf<Pair<String, Long?>>(amy to 5000L), chat.readersOf("\$2", me))
        assertTrue(chat.readersOf("\$3", amy).isEmpty())
        assertTrue(chat.readersOf("\$3", me).isEmpty())
    }
}

class SettingsPayloadTest {
    @Test fun syncResultCarriesPagerSettingsAccountData() {
        val sync = json.parseToJsonElement("""{"account_data":{"events":[{"type":"app.pager.settings.android","content":{"v":1,"updatedAt":5,"settings":{"eink":true}}},{"type":"m.push_rules","content":{}}]}}""").jsonObject
        val r = SyncReducer.apply(emptyMap(), sync, "@me:x", true)
        assertEquals(setOf("app.pager.settings.android"), r.accountData.keys)
    }
}

class NotifyPolicyTest {
    private fun msg(text: String = "hi", network: String = "signal", group: Boolean = false, mentioned: Boolean = false, reply: Boolean = false) =
        Incoming("!a", "Amy", "Amy", text, network, group, mentioned, 0L, reply)
    private fun decide(m: Incoming, s: AppSettings = AppSettings(), quiet: Boolean = false, pinned: Boolean = false, nowMin: Int = 12 * 60, day: Int = 2) =
        NotifyPolicy.decide(m, quiet, pinned, nowMin, day, s)

    @Test fun showsByDefault() { val d = decide(msg()); assertTrue(d.show); assertFalse(d.silent) }
    @Test fun masterSwitchHidesEverything() = assertFalse(decide(msg(mentioned = true), AppSettings(notifEnabled = false)).show)
    @Test fun mutedChatsOnlyBreakThroughForYou() {
        assertFalse(decide(msg(), quiet = true).show)
        assertTrue(decide(msg(mentioned = true), quiet = true).show)
        assertTrue(decide(msg(reply = true), quiet = true).show)
    }
    @Test fun keywordsCountWholeWordsOnly() {
        assertTrue(NotifyPolicy.keywordHit("hey Lane!", listOf("lane")))
        assertFalse(NotifyPolicy.keywordHit("plane crash", listOf("lane")))
        assertTrue(decide(msg("lane, dinner?"), AppSettings(notifKeywords = listOf("Lane")), quiet = true).show)
    }
    @Test fun networkModes() {
        val s = AppSettings(notifNetworkMode = mapOf("signal" to "mentions", "whatsapp" to "none"))
        assertFalse(decide(msg(), s).show)
        assertTrue(decide(msg(mentioned = true), s).show)
        assertFalse(decide(msg(network = "whatsapp", mentioned = true), s).show)
    }
    @Test fun chatOverridesWin() {
        assertTrue(decide(msg(), AppSettings(notifNetworkMode = mapOf("signal" to "none"), notifChat = mapOf("!a" to ChatNotifPrefs(mode = "all")))).show)
        assertFalse(decide(msg(mentioned = true), AppSettings(notifChat = mapOf("!a" to ChatNotifPrefs(mode = "none")))).show)
        assertFalse(decide(msg(), AppSettings(notifChat = mapOf("!a" to ChatNotifPrefs(mode = "mentions")))).show)
    }
    @Test fun quietHoursSilenceWithDaysAndBreakThrough() {
        val q = AppSettings(quietHoursEnabled = true, quietStartMin = 22 * 60, quietEndMin = 7 * 60)
        assertTrue(decide(msg(), q, nowMin = 23 * 60).silent)
        assertFalse(decide(msg(), q, nowMin = 12 * 60).silent)
        assertFalse(decide(msg(), q.copy(notifQuietDays = setOf(5, 6)), nowMin = 23 * 60, day = 2).silent)
        assertFalse(decide(msg(), q.copy(notifQuietBreakThrough = true), pinned = true, nowMin = 23 * 60).silent)
    }
    @Test fun chatSoundAndPreviewOverrides() {
        val d = decide(msg(), AppSettings(notifChat = mapOf("!a" to ChatNotifPrefs(sound = "off", preview = "hide"))))
        assertTrue(d.show); assertTrue(d.silent); assertEquals("hidden", d.preview)
    }
}

class NotifyPriorityTest {
    private fun msg(group: Boolean = false, mentioned: Boolean = false) = Incoming("!a", "Amy", "Amy", "hi", "signal", group, mentioned, 0L, false)
    private fun decide(m: Incoming, s: AppSettings = AppSettings(), quiet: Boolean = false, nowMin: Int = 12 * 60) = NotifyPolicy.decide(m, quiet, false, nowMin, 2, s)

    @Test fun priorityGetsThroughMuteAndQuietHours() {
        val s = AppSettings(quietHoursEnabled = true, notifChat = mapOf("!a" to ChatNotifPrefs(level = "priority")))
        val d = decide(msg(), s, quiet = true, nowMin = 23 * 60)
        assertTrue(d.show); assertFalse(d.silent)
        assertFalse(decide(msg(), AppSettings(notifChat = mapOf("!a" to ChatNotifPrefs(level = "priority", mode = "none")))).show)
    }
    @Test fun silentShowsQuietly() {
        val d = decide(msg(), AppSettings(notifChat = mapOf("!a" to ChatNotifPrefs(level = "silent"))))
        assertTrue(d.show); assertTrue(d.silent)
    }
    @Test fun directAndGroupModes() {
        assertFalse(decide(msg(group = true), AppSettings(notifGroupMode = "mentions")).show)
        assertTrue(decide(msg(group = true, mentioned = true), AppSettings(notifGroupMode = "mentions")).show)
        assertFalse(decide(msg(), AppSettings(notifDirectMode = "none")).show)
        assertTrue(decide(msg(), AppSettings(notifGroupMode = "none")).show)
    }
}
