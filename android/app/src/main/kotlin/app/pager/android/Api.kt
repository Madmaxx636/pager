package app.pager.android

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import java.net.URLEncoder

private fun JsonElement?.str() = (this as? JsonPrimitive)?.contentOrNull
private fun JsonElement?.arr() = (this as? JsonArray) ?: JsonArray(emptyList())
private fun JsonElement?.obj() = (this as? JsonObject) ?: JsonObject(emptyMap())
private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

data class ServerConfig(val domain: String, val inviteRequired: Boolean, val signupOpen: Boolean)
data class Login(val id: String, val name: String)
data class Network(val id: String, val name: String, val logins: List<Login>, val unavailable: Boolean)
data class LoginFlow(val id: String, val name: String, val description: String?)
data class LoginField(val id: String, val name: String, val secret: Boolean, val hint: String?)
data class LoginStep(
    val loginId: String,
    val stepId: String,
    val type: String,
    val instructions: String?,
    val displayType: String?,
    val displayData: String?,
    val fields: List<LoginField>,
)

/** The Pager API (signup + in-app bridge login) on the user's own server. */
class PagerApi(private val http: Http) {
    suspend fun config(): ServerConfig {
        val c = http.request("GET", "/api/config")
        return ServerConfig(c["domain"].str() ?: "", (c["inviteRequired"] as? JsonPrimitive)?.booleanOrNull ?: false, c["signup"].str() != "closed")
    }

    suspend fun signup(username: String, password: String, invite: String) {
        http.request("POST", "/api/signup", buildJsonObject {
            put("username", username); put("password", password); put("invite", invite)
        })
    }

    suspend fun networks(): List<Network> = http.request("GET", "/api/bridges")["networks"].arr().map { n ->
        val o = n.obj()
        Network(
            o["id"].str().orEmpty(), o["name"].str().orEmpty(),
            o["logins"].arr().map { l -> l.obj().let { Login(it["id"].str().orEmpty(), it["name"].str() ?: it["id"].str().orEmpty()) } },
            o["error"] != null,
        )
    }

    suspend fun flows(net: String): List<LoginFlow> = http.request("GET", "/api/bridges/$net/login/flows")["flows"].arr().map {
        val o = it.obj(); LoginFlow(o["id"].str().orEmpty(), o["name"].str().orEmpty(), o["description"].str())
    }

    suspend fun start(net: String, flow: String) = parseStep(http.request("POST", "/api/bridges/$net/login/start/$flow", JsonObject(emptyMap())))

    suspend fun step(net: String, s: LoginStep, values: Map<String, String> = emptyMap()) = parseStep(
        http.request("POST", "/api/bridges/$net/login/step/${s.loginId}/${s.stepId}/${s.type}", buildJsonObject {
            values.forEach { (k, v) -> put(k, v) }
        }),
    )

    suspend fun logout(net: String, loginId: String) {
        http.request("POST", "/api/bridges/$net/logout/${enc(loginId)}", JsonObject(emptyMap()))
    }

    private fun parseStep(o: JsonObject): LoginStep {
        val dw = o["display_and_wait"].obj()
        return LoginStep(
            loginId = o["login_id"].str().orEmpty(),
            stepId = o["step_id"].str().orEmpty(),
            type = o["type"].str().orEmpty(),
            instructions = o["instructions"].str(),
            displayType = dw["type"].str(),
            displayData = dw["data"].str(),
            fields = o["user_input"].obj()["fields"].arr().map {
                val f = it.obj()
                val t = f["type"].str()
                LoginField(f["id"].str().orEmpty(), f["name"].str().orEmpty(), t == "password" || t == "2fa_code", f["description"].str())
            },
        )
    }
}

/** The subset of the Matrix client-server API Pager needs. */
class MatrixApi(private val http: Http) {
    suspend fun login(username: String, password: String): Triple<String, String, String> {
        val r = http.request("POST", "/_matrix/client/v3/login", buildJsonObject {
            put("type", "m.login.password")
            putJsonObject("identifier") { put("type", "m.id.user"); put("user", username) }
            put("password", password)
            put("initial_device_display_name", "Pager Android")
        })
        return Triple(r["access_token"].str().orEmpty(), r["user_id"].str().orEmpty(), r["device_id"].str().orEmpty())
    }

    suspend fun sync(since: String?): JsonObject {
        val filter = enc("""{"room":{"timeline":{"limit":30}}}""")
        val q = buildString {
            append("/_matrix/client/v3/sync?filter=$filter")
            if (since != null) append("&since=${enc(since)}&timeout=30000") else append("&timeout=0")
        }
        return http.request("GET", q)
    }

    suspend fun join(roomId: String) { http.request("POST", "/_matrix/client/v3/join/${enc(roomId)}", JsonObject(emptyMap())) }

    suspend fun sendText(roomId: String, text: String, txnId: String): String =
        http.request("PUT", "/_matrix/client/v3/rooms/${enc(roomId)}/send/m.room.message/${enc(txnId)}", buildJsonObject {
            put("msgtype", "m.text"); put("body", text)
        })["event_id"].str().orEmpty()

    suspend fun markRead(roomId: String, eventId: String) {
        http.request("POST", "/_matrix/client/v3/rooms/${enc(roomId)}/receipt/m.read/${enc(eventId)}", JsonObject(emptyMap()))
    }

    suspend fun logout() { http.request("POST", "/_matrix/client/v3/logout", JsonObject(emptyMap())) }
}
