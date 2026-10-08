package app.pager.android

import com.sun.net.httpserver.HttpServer
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.net.InetSocketAddress

class HttpTest {
    private lateinit var server: HttpServer
    private val seen = mutableListOf<Triple<String, String, String>>()
    private lateinit var api: MatrixApi

    @Before fun start() {
        server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/") { ex ->
            seen.add(Triple(ex.requestMethod, ex.requestURI.rawPath, ex.requestBody.readBytes().decodeToString()))
            val out = """{"event_id":"${'$'}ok"}""".toByteArray()
            ex.sendResponseHeaders(200, out.size.toLong()); ex.responseBody.use { it.write(out) }
        }
        server.start()
        api = MatrixApi(Http("http://127.0.0.1:${server.address.port}", "tok"))
    }
    @After fun stop() = server.stop(0)

    @Test fun sendUsesPutWithEncodedRoomAndJsonBody() = runBlocking {
        val id = api.send("!a:pager.test", "m.room.message", "txn-1", buildJsonObject { put("msgtype", "m.text"); put("body", "hi") })
        assertEquals("\$ok", id)
        val (method, path, body) = seen.single()
        assertEquals("PUT", method)
        assertEquals("/_matrix/client/v3/rooms/%21a%3Apager.test/send/m.room.message/txn-1", path)
        assertTrue(body.contains("\"body\":\"hi\""))
    }

    @Test fun reactionsRedactionsAndTagsGoOut() = runBlocking {
        api.redact("!a:x", "\$e1", "t2")
        api.setTag("@me:x", "!a:x", "m.favourite", true)
        api.setTag("@me:x", "!a:x", "m.favourite", false)
        api.setMuted("!a:x", true)
        api.setMuted("!a:x", false)
        assertEquals(listOf("PUT", "PUT", "DELETE", "PUT", "DELETE"), seen.map { it.first })
        assertTrue(seen[3].third.contains("event_match"))
    }
}
