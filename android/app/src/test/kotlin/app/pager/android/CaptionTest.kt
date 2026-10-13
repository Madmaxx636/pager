package app.pager.android

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class CaptionTest {
    private fun event(vararg c: Pair<String, String>) = JsonObject(mapOf(
        "type" to JsonPrimitive("m.room.message"), "event_id" to JsonPrimitive("\$a"), "sender" to JsonPrimitive("@x:s"), "origin_server_ts" to JsonPrimitive(1),
        "content" to JsonObject(c.associate { it.first to JsonPrimitive(it.second) }),
    ))

    @Test fun showsTheWordsSentWithAPicture() {
        val m = SyncReducer.toMsg(event("msgtype" to "m.image", "body" to "Look at this!", "filename" to "IMG_1.jpg", "url" to "mxc://s/a"))!!
        assertEquals("Look at this!", m.caption)
        assertEquals("IMG_1.jpg", m.body)
        assertEquals("Photo: Look at this!", previewOf(m))
    }

    @Test fun noCaptionWhenTheBodyIsJustTheFileName() {
        val m = SyncReducer.toMsg(event("msgtype" to "m.image", "body" to "IMG_1.jpg", "filename" to "IMG_1.jpg", "url" to "mxc://s/a"))!!
        assertNull(m.caption)
        assertEquals("Photo", previewOf(m))
        assertNull(SyncReducer.toMsg(event("msgtype" to "m.image", "body" to "IMG_1.jpg", "url" to "mxc://s/a"))!!.caption)
    }

    @Test fun worksForVideosAndFilesButNotText() {
        assertEquals("v.mp4", SyncReducer.captionOf("m.video", "Fun", "v.mp4", JsonObject(emptyMap()))?.name)
        assertNotNull(SyncReducer.captionOf("m.file", "The contract", "c.pdf", JsonObject(emptyMap())))
        assertNull(SyncReducer.captionOf("m.text", "hi", "x", JsonObject(emptyMap())))
    }
}
