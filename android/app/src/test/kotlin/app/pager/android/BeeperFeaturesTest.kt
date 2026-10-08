package app.pager.android

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BeeperFeaturesTest {
    private val me = "@me:x"
    private val alex = "@alex:x"
    private fun parse(s: String): JsonObject = json.parseToJsonElement(s).jsonObject
    private fun room(events: String, extra: String = "") = parse(
        """{"rooms":{"join":{"!r:x":{"state":{"events":[
            {"type":"m.room.member","state_key":"$me","content":{"membership":"join","displayname":"Me"}},
            {"type":"m.room.member","state_key":"$alex","content":{"membership":"join","displayname":"Alex"}}]},
            "summary":{"m.joined_member_count":4},"timeline":{"events":[$events]}$extra}}}}""",
    )
    private val pollStart = """{"type":"org.matrix.msc3381.poll.start","event_id":"${'$'}p","sender":"$alex","origin_server_ts":10,"content":{
        "org.matrix.msc3381.poll.start":{"kind":"org.matrix.msc3381.poll.disclosed","max_selections":1,
        "question":{"org.matrix.msc1767.text":"Pizza or sushi?"},
        "answers":[{"id":"a1","org.matrix.msc1767.text":"Pizza"},{"id":"a2","org.matrix.msc1767.text":"Sushi"}]}}}"""
    private fun vote(id: String, who: String, ts: Int, vararg answers: String) =
        """{"type":"org.matrix.msc3381.poll.response","event_id":"$id","sender":"$who","origin_server_ts":$ts,"content":{"m.relates_to":{"rel_type":"m.reference","event_id":"${'$'}p"},"org.matrix.msc3381.poll.response":{"answers":[${answers.joinToString(",") { "\"$it\"" }}]}}}"""

    @Test fun pollsAreParsedAndVotesAggregateWithLatestResponseWinning() {
        val chat = SyncReducer.apply(emptyMap(), room("$pollStart,${vote("${'$'}v1", alex, 11, "a1")},${vote("${'$'}v2", me, 12, "a2")},${vote("${'$'}v3", alex, 13, "a2")}"), me, true).chats.getValue("!r:x")
        val poll = chat.messages.single()
        assertEquals("m.poll", poll.type); assertEquals("Pizza or sushi?", poll.poll!!.question)
        assertEquals(listOf("Pizza", "Sushi"), poll.poll!!.answers.map { it.text })
        assertEquals(mapOf(alex to listOf("a2"), me to listOf("a2")), chat.pollVotes["\$p"])
        assertEquals("Poll: Pizza or sushi?", previewOf(poll))
    }

    @Test fun onlyTheCreatorCanEndAPollAndEndedPollsIgnoreLaterVotes() {
        val ended = SyncReducer.apply(emptyMap(), room("$pollStart,{\"type\":\"org.matrix.msc3381.poll.end\",\"event_id\":\"\$e\",\"sender\":\"$me\",\"content\":{\"m.relates_to\":{\"rel_type\":\"m.reference\",\"event_id\":\"\$p\"}}}"), me, true).chats.getValue("!r:x")
        assertTrue("\$p" !in ended.pollEnded) // me is not the creator
        val ok = SyncReducer.apply(emptyMap(), room("$pollStart,{\"type\":\"org.matrix.msc3381.poll.end\",\"event_id\":\"\$e\",\"sender\":\"$alex\",\"content\":{\"m.relates_to\":{\"rel_type\":\"m.reference\",\"event_id\":\"\$p\"}}},${vote("${'$'}late", me, 99, "a1")}"), me, true).chats.getValue("!r:x")
        assertTrue("\$p" in ok.pollEnded); assertNull(ok.pollVotes["\$p"]?.get(me))
    }

    @Test fun pinOrderTagsAndLabelsComeFromRoomTags() {
        val chat = SyncReducer.apply(emptyMap(), room("", ""","account_data":{"events":[{"type":"m.tag","content":{"tags":{"m.favourite":{"order":2.5},"m.lowpriority":{},"u.label.Work":{},"u.label.Family":{}}}}]}"""), me, true).chats.getValue("!r:x")
        assertEquals(2.5, chat.pinOrder!!, 0.0); assertTrue(chat.pinned && chat.lowPriority)
        assertEquals(listOf("Family", "Work"), chat.labels)
    }

    @Test fun repliesToMyMessagesAreFlagged() {
        val base = SyncReducer.apply(emptyMap(), room("""{"type":"m.room.message","event_id":"${'$'}mine","sender":"$me","origin_server_ts":1,"content":{"msgtype":"m.text","body":"hi"}}"""), me, true).chats
        val r = SyncReducer.apply(base, room(
            """{"type":"m.room.message","event_id":"${'$'}r1","sender":"$alex","origin_server_ts":2,"content":{"msgtype":"m.text","body":"yes","m.relates_to":{"m.in_reply_to":{"event_id":"${'$'}mine"}}}},
               {"type":"m.room.message","event_id":"${'$'}r2","sender":"$alex","origin_server_ts":3,"content":{"msgtype":"m.text","body":"other"}}"""), me, false)
        assertEquals(listOf(true, false), r.incoming.map { it.replyToMe })
    }

    @Test fun stickerPacksAreReadFromRoomStateAndAccountData() {
        val sync = parse(
            """{"rooms":{"join":{"!r:x":{"state":{"events":[{"type":"im.ponies.room_emotes","state_key":"fun","content":{"pack":{"display_name":"Fun"},
              "images":{"wave":{"url":"mxc://x/w","body":"wave","info":{"w":128,"h":128,"mimetype":"image/webp"}},"smile":{"url":"mxc://x/s","usage":["emoticon"]}}}}]}}}},
              "account_data":{"events":[{"type":"im.ponies.user_emotes","content":{"images":{"mine":{"url":"mxc://x/m","usage":["sticker"]}}}}]}}""",
        )
        val r = SyncReducer.apply(emptyMap(), sync, me, true)
        val pack = r.chats.getValue("!r:x").stickerPacks.single()
        assertEquals("Fun", pack.name); assertEquals(listOf("wave"), pack.stickers.map { it.shortcode }) // emoticon-only image excluded
        assertEquals(listOf("mine"), r.userStickers!!.stickers.map { it.shortcode })
    }

    @Test fun formattedBodyIsCapturedAndHtmlParsesToSpans() {
        val m = SyncReducer.apply(emptyMap(), room("""{"type":"m.room.message","event_id":"${'$'}f","sender":"$alex","origin_server_ts":1,"content":{"msgtype":"m.text","body":"bold link","format":"org.matrix.html","formatted_body":"<b>bold</b> <a href=\"https://x.org\">link</a>"}}"""), me, true).chats.getValue("!r:x").messages.single()
        assertNotNull(m.html)
        val spans = Format.parseHtml(m.html!!)
        assertEquals(listOf("bold", " ", "link"), spans.map { it.text })
        assertTrue(spans[0].bold); assertEquals("https://x.org", spans[2].link)
    }

    @Test fun htmlParserHandlesNestingEntitiesLineBreaksAndLists() {
        val s = Format.parseHtml("<i>a <b>b</b></i>&amp;<br><code>x &lt; y</code><ul><li>one</li><li>two</li></ul>")
        assertEquals("a b&\nx < y• one\n• two", s.joinToString("") { it.text })
        assertTrue(s.first { it.text == "b" }.let { it.bold && it.italic })
        assertTrue(s.first { it.text == "x < y" }.code)
    }

    @Test fun markdownBecomesHtmlOnlyWhenFormatted() {
        assertNull(Format.markdownToHtml("just text, 2 * 3 = 6"))
        assertEquals("<b>hi</b> and <i>there</i>", Format.markdownToHtml("**hi** and _there_"))
        assertEquals("<s>no</s> <code>a*b*c</code>", Format.markdownToHtml("~~no~~ `a*b*c`"))
        assertEquals("1 &lt; 2 <b>ok</b>", Format.markdownToHtml("1 < 2 **ok**"))
        assertEquals("<b>a</b><br>b", Format.markdownToHtml("**a**\nb"))
    }

    @Test fun emojiOnlyMessagesAreDetected() {
        assertTrue(Format.isEmojiOnly("😀")); assertTrue(Format.isEmojiOnly("😀 🎉 ❤️")); assertTrue(Format.isEmojiOnly("👍🏽"))
        assertFalse(Format.isEmojiOnly("hi 😀")); assertFalse(Format.isEmojiOnly("😀😀😀😀")); assertFalse(Format.isEmojiOnly("")); assertFalse(Format.isEmojiOnly("hello"))
    }

    @Test fun gifResultsParseForBothProviders() {
        val c = GifClient(okhttp3.OkHttpClient())
        val giphy = c.parse("giphy", parse("""{"data":[{"id":"1","title":"cat","images":{"original":{"url":"https://g/o.gif","width":"480","height":"270"},"fixed_height_small":{"url":"https://g/s.gif"}}}]}"""))
        assertEquals(Gif("1", "cat", "https://g/s.gif", "https://g/o.gif", 480, 270), giphy.single())
        val tenor = c.parse("tenor", parse("""{"results":[{"id":"2","content_description":"dog","media_formats":{"gif":{"url":"https://t/g.gif","dims":[320,240]},"tinygif":{"url":"https://t/tiny.gif"}}}]}"""))
        assertEquals(Gif("2", "dog", "https://t/tiny.gif", "https://t/g.gif", 320, 240), tenor.single())
    }
}
