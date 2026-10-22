package app.pager.android

import android.content.Intent

/** Debug builds only: made-up chats, so every screen can be previewed on an emulator without a server or any real messages. */
object DemoData {
    private const val ME = "@me:demo.test"
    @JvmStatic fun load(store: Store, intent: Intent) {
        val now = System.currentTimeMillis()
        fun t(minAgo: Long) = now - minAgo * 60_000
        fun m(id: String, who: String, body: String, minAgo: Long, reply: String? = null, status: Int = STATUS_SENT) = Msg(id, who, t(minAgo), "m.text", body, replyTo = reply, status = status)
        val maya = "@maya:demo.test"; val dad = "@dad:demo.test"; val priya = "@priya:demo.test"; val sam = "@sam:demo.test"; val leo = "@leo:demo.test"
        val mayaMsgs = listOf(
            m("a1", maya, "Are we still on for dinner tonight?", 62), m("a2", maya, "I can book somewhere around 7", 61),
            m("a3", ME, "Yes! Booking sounds great", 55), m("a4", ME, "Can we do Italian?", 54),
            m("a5", maya, "Perfect, I know a place 🍝", 12), m("a6", maya, "Sending the address now", 11),
            m("a7", ME, "See you there", 9),
            m("a8", maya, "Running 5 min late, sorry!", 2),
        )
        val chats = mapOf(
            "!maya" to ChatState("!maya", "Maya", "whatsapp", unread = 2, messages = mayaMsgs, members = mapOf(ME to "Me", maya to "Maya"), memberCount = 4, roomType = "dm", tags = setOf("m.favourite"), pinOrder = 0.1,
                reactions = mapOf("a3" to mapOf("❤️" to listOf(maya)), "a5" to mapOf("👍" to listOf(ME), "🔥" to listOf(ME, maya)), "a7" to mapOf("😂" to listOf(maya))),
                receipts = mapOf("@whatsappbot:demo.test" to "a7", maya to "a4")),
            "!dad" to ChatState("!dad", "Dad", "gmessages", messages = listOf(m("d1", dad, "Call me when you land", 190), m("d2", ME, "Will do", 185)), members = mapOf(ME to "Me", dad to "Dad"), memberCount = 3, roomType = "dm", tags = setOf("m.favourite"), pinOrder = 0.2),
            "!work" to ChatState("!work", "Work chat", "slack", unread = 5, messages = listOf(m("w1", priya, "Shipping the release now", 300), m("w2", leo, "Nice, I'll watch the dashboards", 295), m("w3", priya, "All green so far", 290)), members = mapOf(ME to "Me", priya to "Priya", leo to "Leo"), memberCount = 5, roomType = "group"),
            "!sam" to ChatState("!sam", "Sam", "signal", messages = listOf(m("s1", sam, "lol that's great", 1500), m("s2", ME, "I know right", 1490)), members = mapOf(ME to "Me", sam to "Sam"), memberCount = 3, roomType = "dm"),
            "!mom" to ChatState("!mom", "Mom", "whatsapp", messages = listOf(m("o1", "@mom:demo.test", "Don't forget Sunday lunch", 4000)), members = mapOf(ME to "Me", "@mom:demo.test" to "Mom"), memberCount = 3, roomType = "dm"),
        )
        store.loadDemo(Session("https://demo.test", "demo", ME), chats)
        val dark = intent.getIntExtra("eink_dark", 4)
        store.settings.update { copy(eink = intent.getBooleanExtra("eink", true), einkDark = dark) }
    }
}
