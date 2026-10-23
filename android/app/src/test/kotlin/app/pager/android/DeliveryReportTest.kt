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
            "status" to JsonPrimitive("SUCCESS"), "delivered_to" to JsonArray(delivered.map { JsonPrimitive(it) }),
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
}
