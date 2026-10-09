package app.pager.android

import kotlinx.serialization.json.longOrNull
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
data class Login(val id: String, val name: String, val state: String = "", val profileName: String = "")
data class Network(val id: String, val name: String, val logins: List<Login>, val unavailable: Boolean)
data class SearchHit(val roomId: String, val eventId: String, val sender: String, val text: String, val ts: Long)
data class LinkPreview(val url: String, val title: String?, val description: String?, val imageMxc: String?, val site: String?)
data class Contact(val id: String, val name: String, val detail: String?)
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
data class AdminUser(val id: String, val admin: Boolean, val deactivated: Boolean, val created: Long, val you: Boolean)
data class AdminPerson(val user: AdminUser, val displayname: String, val networks: List<Network>)
data class AdminInfo(val displayname: String, val locked: Boolean, val created: Long, val devices: List<Triple<String, String, Long>>)
data class AdminBridge(val id: String, val name: String, val up: Boolean, val state: String?, val status: String?)
data class ServerSettings(val domain: String, val signup: String, val inviteCode: String)

class PagerApi(private val http: Http) {
    // ---- Admin (Synapse checks the caller really is an admin) ----
    suspend fun isAdmin(): Boolean = http.request("GET", "/api/me")["admin"].let { (it as? kotlinx.serialization.json.JsonPrimitive)?.booleanOrNull == true }
    suspend fun adminUsers(): List<AdminUser> = http.request("GET", "/api/admin/users")["users"].arr().map {
        val o = it.obj()
        AdminUser(o["id"].str().orEmpty(), (o["admin"] as? kotlinx.serialization.json.JsonPrimitive)?.booleanOrNull == true, (o["deactivated"] as? kotlinx.serialization.json.JsonPrimitive)?.booleanOrNull == true,
            (o["created"] as? kotlinx.serialization.json.JsonPrimitive)?.longOrNull ?: 0L, (o["you"] as? kotlinx.serialization.json.JsonPrimitive)?.booleanOrNull == true)
    }
    /** Everyone, with what each person has connected, in one call. */
    suspend fun adminOverview(): List<AdminPerson> = http.request("GET", "/api/admin/overview")["users"].arr().map {
        val o = it.obj()
        AdminPerson(
            AdminUser(o["id"].str().orEmpty(), (o["admin"] as? kotlinx.serialization.json.JsonPrimitive)?.booleanOrNull == true, (o["deactivated"] as? kotlinx.serialization.json.JsonPrimitive)?.booleanOrNull == true,
                (o["created"] as? kotlinx.serialization.json.JsonPrimitive)?.longOrNull ?: 0L, (o["you"] as? kotlinx.serialization.json.JsonPrimitive)?.booleanOrNull == true),
            o["displayname"].str().orEmpty(),
            o["networks"].arr().map { n ->
                val no = n.obj()
                Network(no["id"].str().orEmpty(), no["name"].str().orEmpty(), no["logins"].arr().map { l -> l.obj().let { lo -> Login(lo["id"].str().orEmpty(), lo["name"].str() ?: lo["profile"].obj()["name"].str() ?: lo["id"].str().orEmpty(), lo["state_event"].str() ?: "") } }, no["error"] != null)
            },
        )
    }
    suspend fun adminInfo(id: String): AdminInfo {
        val o = http.request("GET", "/api/admin/users/${enc(id)}/info")
        return AdminInfo(o["displayname"].str().orEmpty(), (o["locked"] as? kotlinx.serialization.json.JsonPrimitive)?.booleanOrNull == true, (o["created"] as? kotlinx.serialization.json.JsonPrimitive)?.longOrNull ?: 0L,
            o["devices"].arr().map { d -> d.obj().let { Triple(it["id"].str().orEmpty(), it["name"].str().orEmpty(), (it["lastSeen"] as? kotlinx.serialization.json.JsonPrimitive)?.longOrNull ?: 0L) } })
    }
    suspend fun adminRename(id: String, name: String) { http.request("POST", "/api/admin/users/${enc(id)}/rename", buildJsonObject { put("displayname", name) }) }
    suspend fun adminLock(id: String, locked: Boolean) { http.request("POST", "/api/admin/users/${enc(id)}/lock", buildJsonObject { put("locked", locked) }) }
    suspend fun adminLogoutAll(id: String) { http.request("POST", "/api/admin/users/${enc(id)}/logout-all", JsonObject(emptyMap())) }
    suspend fun adminControl(): Boolean = (http.request("GET", "/api/admin/control")["docker"] as? kotlinx.serialization.json.JsonPrimitive)?.booleanOrNull == true
    suspend fun adminBridgeList(): List<AdminBridge> = http.request("GET", "/api/admin/bridges")["bridges"].arr().map {
        val o = it.obj(); val c = o["container"].obj()
        AdminBridge(o["id"].str().orEmpty(), o["name"].str().orEmpty(), (o["up"] as? kotlinx.serialization.json.JsonPrimitive)?.booleanOrNull == true, c["state"].str(), c["status"].str())
    }
    suspend fun adminBridgeAction(id: String, action: String) { http.request("POST", "/api/admin/bridges/${enc(id)}/$action", JsonObject(emptyMap())) }
    suspend fun adminBridgeLog(id: String): String = http.request("GET", "/api/admin/bridges/${enc(id)}/logs?tail=200")["log"].str().orEmpty()
    suspend fun adminLogins(id: String): List<Network> = http.request("GET", "/api/admin/users/${enc(id)}/logins")["networks"].arr().map { n ->
        val o = n.obj()
        Network(o["id"].str().orEmpty(), o["name"].str().orEmpty(), o["logins"].arr().map { l -> l.obj().let { Login(it["id"].str().orEmpty(), it["name"].str() ?: it["profile"].obj()["name"].str() ?: it["id"].str().orEmpty(), it["state_event"].str() ?: "") } }, o["error"] != null)
    }
    suspend fun adminLogout(id: String, net: String, login: String) { http.request("POST", "/api/admin/users/${enc(id)}/logout/${enc(net)}/${enc(login)}", JsonObject(emptyMap())) }
    suspend fun adminSetAdmin(id: String, admin: Boolean) { http.request("POST", "/api/admin/users/${enc(id)}/admin", buildJsonObject { put("admin", admin) }) }
    /** Recover an account: needs the admin's own password. Without a new password, a temporary one comes back (otherwise null). */
    suspend fun adminRecover(id: String, adminPassword: String, newPassword: String?): Pair<Boolean, String?> {
        val r = http.request("POST", "/api/admin/users/${enc(id)}/recover", buildJsonObject { put("adminPassword", adminPassword); if (!newPassword.isNullOrEmpty()) put("newPassword", newPassword) })
        return ((r["backupRemoved"] as? JsonPrimitive)?.booleanOrNull == true) to r["temporaryPassword"].str()
    }
    suspend fun adminResetPassword(id: String, password: String) { http.request("POST", "/api/admin/users/${enc(id)}/password", buildJsonObject { put("password", password) }) }
    suspend fun adminRemove(id: String) { http.request("POST", "/api/admin/users/${enc(id)}/delete", JsonObject(emptyMap())) }
    private fun serverFrom(o: JsonObject) = ServerSettings(o["domain"].str().orEmpty(), o["signup"].str().orEmpty(), o["inviteCode"].str().orEmpty())
    suspend fun adminServer(): ServerSettings = serverFrom(http.request("GET", "/api/admin/server"))
    suspend fun adminSetServer(signup: String? = null, regenerateInvite: Boolean = false): ServerSettings = serverFrom(http.request("POST", "/api/admin/server", buildJsonObject {
        if (signup != null) put("signup", signup)
        if (regenerateInvite) put("regenerateInvite", true)
    }))
    suspend fun adminBridges(): List<Triple<String, String, Boolean>> = http.request("GET", "/api/admin/bridges")["bridges"].arr().map { b ->
        val o = b.obj(); Triple(o["id"].str().orEmpty(), o["name"].str().orEmpty(), (o["up"] as? kotlinx.serialization.json.JsonPrimitive)?.booleanOrNull == true)
    }

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
            o["logins"].arr().map { l ->
                l.obj().let {
                    val st = it["state_event"].str() ?: it["state"].obj()["state_event"].str() ?: ""
                    Login(it["id"].str().orEmpty(), it["name"].str() ?: it["profile"].obj()["name"].str() ?: it["id"].str().orEmpty(), st, it["profile"].obj()["name"].str().orEmpty())
                }
            },
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

    suspend fun contacts(net: String, loginId: String?): List<Contact> =
        parseContacts(http.request("GET", "/api/bridges/$net/contacts" + loginQuery(loginId)))

    suspend fun searchUsers(net: String, loginId: String?, query: String): List<Contact> =
        parseContacts(http.request("POST", "/api/bridges/$net/search_users" + loginQuery(loginId), buildJsonObject { put("query", query) }))

    /** Opens (or creates) a DM with someone on a network. Returns the Matrix room id. */
    suspend fun createDm(net: String, loginId: String?, identifier: String): String? =
        http.request("POST", "/api/bridges/$net/create_dm/${enc(identifier)}" + loginQuery(loginId), JsonObject(emptyMap()))["dm_room_mxid"].str()

    /** Creates a chat for every contact the bridge knows (networks like Signal never send old chats to a new device). */
    suspend fun syncChats(net: String, loginId: String?, onProgress: (Int, Int) -> Unit = { _, _ -> }): Int {
        val list = contacts(net, loginId)
        var made = 0
        list.forEachIndexed { i, c ->
            if (runCatching { createDm(net, loginId, c.id) }.getOrNull() != null) made++
            onProgress(i + 1, list.size)
        }
        return made
    }

    private fun loginQuery(loginId: String?) = if (loginId == null) "" else "?login_id=${enc(loginId)}"

    private fun parseContacts(o: JsonObject): List<Contact> {
        val list = (o["contacts"] ?: o["results"]).arr()
        return list.map {
            val c = it.obj()
            Contact(
                id = c["id"].str().orEmpty(),
                name = c["name"].str() ?: c["identifiers"].arr().firstOrNull().str() ?: c["id"].str().orEmpty(),
                detail = c["identifiers"].arr().firstOrNull().str()?.removePrefix("tel:"),
            )
        }.filter { it.id.isNotEmpty() }
    }

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
        // No presence, lazy-loaded members, and only the ephemeral/account data we use: keeps syncs small and fast.
        val filter = enc(
            """{"presence":{"types":[]},"room":{"timeline":{"limit":20},"state":{"lazy_load_members":true},""" +
                """"ephemeral":{"types":["m.receipt","m.typing"]}}}""",
        )
        val q = buildString {
            append("/_matrix/client/v3/sync?set_presence=offline&filter=$filter")
            if (since != null) append("&since=${enc(since)}&timeout=30000") else append("&timeout=0")
        }
        return http.request("GET", q)
    }

    /** One page of older events. Returns (events newest-first, next token or null at the start of the room). */
    suspend fun messages(roomId: String, from: String): Triple<List<JsonObject>, String?, List<JsonObject>> {
        val filter = enc("""{"lazy_load_members":true}""")
        val r = http.request("GET", "/_matrix/client/v3/rooms/${enc(roomId)}/messages?dir=b&limit=40&from=${enc(from)}&filter=$filter")
        return Triple(r["chunk"].arr().map { it.obj() }, r["end"].str(), r["state"].arr().map { it.obj() })
    }

    /** Lets the encryption layer change an event just before it is sent (it becomes m.room.encrypted in encrypted rooms). */
    var sendHook: (suspend (roomId: String, type: String, content: JsonObject) -> Pair<String, JsonObject>)? = null

    suspend fun send(roomId: String, type: String, txnId: String, content: JsonObject): String {
        val (t, c) = sendHook?.invoke(roomId, type, content) ?: (type to content)
        return http.request("PUT", "/_matrix/client/v3/rooms/${enc(roomId)}/send/$t/${enc(txnId)}", c)["event_id"].str().orEmpty()
    }

    suspend fun redact(roomId: String, eventId: String, txnId: String) {
        http.request("PUT", "/_matrix/client/v3/rooms/${enc(roomId)}/redact/${enc(eventId)}/${enc(txnId)}", JsonObject(emptyMap()))
    }

    suspend fun setTag(me: String, roomId: String, tag: String, on: Boolean, order: Double? = null) {
        val path = "/_matrix/client/v3/user/${enc(me)}/rooms/${enc(roomId)}/tags/${enc(tag)}"
        if (on) http.request("PUT", path, if (order != null) buildJsonObject { put("order", order) } else JsonObject(emptyMap())) else http.request("DELETE", path)
    }

    suspend fun putAccountData(me: String, type: String, content: JsonObject) {
        http.request("PUT", "/_matrix/client/v3/user/${enc(me)}/account_data/${enc(type)}", content)
    }

    suspend fun setMarkedUnread(me: String, roomId: String, unread: Boolean) {
        http.request("PUT", "/_matrix/client/v3/user/${enc(me)}/rooms/${enc(roomId)}/account_data/m.marked_unread", buildJsonObject { put("unread", unread) })
    }

    suspend fun setMuted(roomId: String, muted: Boolean) {
        val path = "/_matrix/client/v3/pushrules/global/override/${enc(roomId)}"
        if (muted) http.request("PUT", path, buildJsonObject {
            put("actions", JsonArray(emptyList()))
            put("conditions", JsonArray(listOf(buildJsonObject { put("kind", "event_match"); put("key", "room_id"); put("pattern", roomId) })))
        }) else http.request("DELETE", path)
    }

    suspend fun joinedMembers(roomId: String): Map<String, String> {
        val joined = http.request("GET", "/_matrix/client/v3/rooms/${enc(roomId)}/joined_members")["joined"].obj()
        return joined.mapValues { it.value.obj()["display_name"].str() ?: it.key.removePrefix("@").substringBefore(':') }
    }

    suspend fun leave(roomId: String) {
        http.request("POST", "/_matrix/client/v3/rooms/${enc(roomId)}/leave", JsonObject(emptyMap()))
        runCatching { http.request("POST", "/_matrix/client/v3/rooms/${enc(roomId)}/forget", JsonObject(emptyMap())) } // drop its history from your account
    }

    suspend fun join(roomId: String) { http.request("POST", "/_matrix/client/v3/join/${enc(roomId)}", JsonObject(emptyMap())) }

    suspend fun markRead(roomId: String, eventId: String, private: Boolean = false) {
        val kind = if (private) "m.read.private" else "m.read"
        http.request("POST", "/_matrix/client/v3/rooms/${enc(roomId)}/receipt/$kind/${enc(eventId)}", JsonObject(emptyMap()))
    }

    suspend fun typing(me: String, roomId: String, typing: Boolean) {
        http.request("PUT", "/_matrix/client/v3/rooms/${enc(roomId)}/typing/${enc(me)}", buildJsonObject {
            put("typing", typing); if (typing) put("timeout", 6000)
        })
    }

    /** Asks the server to turn on encryption for a page from a connected app (you are not allowed to change those yourself). */
    suspend fun encryptRoom(roomId: String) {
        http.request("POST", "/api/rooms/${enc(roomId)}/encrypt", JsonObject(emptyMap()))
    }

    suspend fun setState(roomId: String, type: String, content: JsonObject) {
        http.request("PUT", "/_matrix/client/v3/rooms/${enc(roomId)}/state/${enc(type)}/", content)
    }

    suspend fun rename(roomId: String, name: String) {
        http.request("PUT", "/_matrix/client/v3/rooms/${enc(roomId)}/state/m.room.name", buildJsonObject { put("name", name) })
    }

    /** Full-text search over every chat (or one). Newest first. */
    suspend fun search(term: String, roomId: String? = null): List<SearchHit> {
        val r = http.request("POST", "/_matrix/client/v3/search", buildJsonObject {
            putJsonObject("search_categories") {
                putJsonObject("room_events") {
                    put("search_term", term)
                    put("keys", JsonArray(listOf(JsonPrimitive("content.body"))))
                    put("order_by", "recent")
                    if (roomId != null) putJsonObject("filter") { put("rooms", JsonArray(listOf(JsonPrimitive(roomId)))) }
                }
            }
        })
        return r["search_categories"].obj()["room_events"].obj()["results"].arr().mapNotNull {
            val e = it.obj()["result"].obj()
            val body = e["content"].obj()["body"].str() ?: return@mapNotNull null
            SearchHit(e["room_id"].str() ?: return@mapNotNull null, e["event_id"].str().orEmpty(), e["sender"].str().orEmpty(), body, (e["origin_server_ts"] as? JsonPrimitive)?.contentOrNull?.toLongOrNull() ?: 0L)
        }
    }

    suspend fun previewUrl(url: String): LinkPreview? {
        val r = http.request("GET", "/_matrix/client/v1/media/preview_url?url=${enc(url)}")
        val title = r["og:title"].str(); val desc = r["og:description"].str(); val img = r["og:image"].str()
        if (title == null && desc == null && img == null) return null
        return LinkPreview(url, title, desc, img, r["og:site_name"].str())
    }

    /** Scheduled send via delayed events (MSC4140). Returns the delay id, which can cancel it. */
    suspend fun sendDelayed(roomId: String, type: String, txnId: String, content: JsonObject, delayMs: Long): String =
        http.request("PUT", "/_matrix/client/v3/rooms/${enc(roomId)}/send/$type/${enc(txnId)}?org.matrix.msc4140.delay=$delayMs", content)["delay_id"].str().orEmpty()

    suspend fun cancelDelayed(delayId: String) {
        http.request("POST", "/_matrix/client/unstable/org.matrix.msc4140/delayed_events/${enc(delayId)}", buildJsonObject { put("action", "cancel") })
    }

    /** Deletes your account for good (Synapse asks for your password again). */
    suspend fun deactivate(userId: String, password: String) {
        http.request("POST", "/_matrix/client/v3/account/deactivate", buildJsonObject {
            put("auth", buildJsonObject { put("type", "m.login.password"); put("identifier", buildJsonObject { put("type", "m.id.user"); put("user", userId) }); put("password", password) })
            put("erase", true)
        })
    }

    suspend fun logout() { http.request("POST", "/_matrix/client/v3/logout", JsonObject(emptyMap())) }
}
