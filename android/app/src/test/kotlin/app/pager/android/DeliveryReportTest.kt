package app.pager.android

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DeliveryReportTest {
    private fun status(vararg delivered: String) = JsonObject(mapOf(
        "type" to JsonPrimitive("com.beeper.message_send_status"), "event_id" to JsonPrimitive("\$s"), "sender" to JsonPrimitive("@gmessagesbot:s"), "origin_server_ts" to JsonPrimitive(1),
        "content" to JsonObject(mapOf(
            "m.relates_to" to JsonObject(mapOf("rel_type" to JsonPrimitive("m.reference"), "event_id" to JsonPrimitive("\$m"))),
            "status" to JsonPrimitive("SUCCESS"), "delivered_to_users" to JsonArray(delivered.map { JsonPrimitive(it) }),
        )),
    ))
    private fun run(vararg ev: JsonObject) = SyncReducer.process(ChatState("!r"), ev.toList(), applyStates = false, onNew = null)

    @Test fun remembersWhoAMessageWasDeliveredTo() {
        val c = run(status("@them:s"))
        assertTrue(c.statusSeen); assertEquals(mapOf("\$m" to listOf("@them:s")), c.deliveredTo)
    }
    @Test fun aSuccessWithoutRecipientsStillMarksTheChatAsReporting() {
        val c = run(status())
        assertTrue(c.statusSeen); assertTrue(c.deliveredTo.isEmpty())
    }

    private fun text(id: String, ts: Long) = JsonObject(mapOf("type" to JsonPrimitive("m.room.message"), "event_id" to JsonPrimitive(id), "sender" to JsonPrimitive("@me:s"), "origin_server_ts" to JsonPrimitive(ts),
        "content" to JsonObject(mapOf("msgtype" to JsonPrimitive("m.text"), "body" to JsonPrimitive(id)))))
    private fun reaction(id: String, ts: Long) = JsonObject(mapOf("type" to JsonPrimitive("m.reaction"), "event_id" to JsonPrimitive(id), "sender" to JsonPrimitive("@them:s"), "origin_server_ts" to JsonPrimitive(ts),
        "content" to JsonObject(mapOf("m.relates_to" to JsonObject(mapOf("rel_type" to JsonPrimitive("m.annotation"), "event_id" to JsonPrimitive("\$1"), "key" to JsonPrimitive("x")))))))

    @Test fun aReceiptThatPointsAtAReactionCountsForTheMessageBefore() {
        val c = run(text("\$1", 1000), text("\$2", 2000), reaction("\$r", 3000), text("\$4", 4000))
        assertEquals(1, c.receiptIndex("\$r")); assertEquals(0, c.receiptIndex("\$1")); assertEquals(-1, c.receiptIndex("\$unknown"))
    }
}
