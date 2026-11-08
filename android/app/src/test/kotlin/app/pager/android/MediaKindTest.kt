package app.pager.android

import org.junit.Assert.assertEquals
import org.junit.Test

class MediaKindTest {
    @Test fun putsTheUsualAlternativeSpellingsRight() {
        assertEquals("m.audio" to "audio/mp4", MediaKind.of("audio/x-m4a", true))
        assertEquals("m.audio" to "audio/wav", MediaKind.of("audio/x-wav", true))
        assertEquals("m.image" to "image/jpeg", MediaKind.of("image/jpg", true))
    }

    @Test fun keepsWhatTheBridgesTake() {
        for (m in listOf("audio/mpeg", "audio/aac", "audio/mp4", "audio/flac")) assertEquals("m.audio", MediaKind.of(m, true).first)
        assertEquals("m.image", MediaKind.of("image/png", true).first)
        assertEquals("m.video", MediaKind.of("video/mp4", true).first)
    }

    @Test fun sendsWhatABridgeRefusesAsAPlainFile() {
        assertEquals("m.file" to "audio/ogg", MediaKind.of("audio/ogg", true))
        for (m in listOf("audio/amr", "video/quicktime", "image/heic", "image/svg+xml", "application/pdf", "")) assertEquals("m.file", MediaKind.of(m, true).first)
    }

    @Test fun leavesAPageThatIsOnlyOnPagerAsItWas() {
        assertEquals("m.audio" to "audio/ogg", MediaKind.of("audio/ogg", false))
        assertEquals("m.video", MediaKind.of("video/quicktime", false).first)
    }

    @Test fun putsTheBridgesReasonInPlainWords() {
        assertEquals("it doesn't accept that kind of file", MediaKind.niceReason("unsupported media type (audio/x-m4a in m.audio)"))
        assertEquals("the file is too big for it", MediaKind.niceReason("file is too large"))
        assertEquals("rate limited", MediaKind.niceReason("Rate limited"))
    }
}
