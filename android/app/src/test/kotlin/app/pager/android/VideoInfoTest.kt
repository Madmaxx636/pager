package app.pager.android

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class VideoInfoTest {
    @Test fun readsThePreviewPictureAndGifFlag() {
        val (poster, gif) = SyncReducer.videoExtras(JsonObject(mapOf("thumbnail_url" to JsonPrimitive("mxc://a/b"), "fi.mau.gif" to JsonPrimitive(true))))
        assertEquals("mxc://a/b", poster); assertEquals(true, gif)
    }
    @Test fun plainVideosAreNotGifs() {
        val (poster, gif) = SyncReducer.videoExtras(JsonObject(emptyMap()))
        assertNull(poster); assertEquals(false, gif)
    }
}
