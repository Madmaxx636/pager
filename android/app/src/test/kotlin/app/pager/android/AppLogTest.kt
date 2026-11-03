package app.pager.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppLogTest {
    @Test fun tokensAndSecretsAreRemoved() {
        assertFalse(AppLog.scrub("access_token=syt_abcdefghij1234 failed").contains("syt_abc"))
        assertEquals("Authorization: Bearer [removed]", AppLog.scrub("Authorization: Bearer abc.def-ghi"))
        assertTrue(AppLog.scrub("key EsTc 1234 5678 9abc defg hijk lmno pqrs tuvw xyz1 2345 6789").contains("[recovery key removed]"))
        assertEquals("mail me at [address removed]", AppLog.scrub("mail me at someone@example.com"))
    }

    @Test fun matrixIdsAndPlainWordsStay() {
        assertEquals("room !abc:server for @lane:server", AppLog.scrub("room !abc:server for @lane:server"))
    }
}
