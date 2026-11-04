package app.pager.android

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okio.source
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class ApiException(val status: Int, message: String) : Exception(message)

/**
 * Pager talks to your server over HTTPS. Plain HTTP is accepted only for an address on your own network (a home server reached by its LAN address), never over the internet.
 * (The Android setting that allows plain HTTP is on in the builds that are signed with the development key, which is how releases are made, so the app checks for itself.)
 */
object Transport {
    /** True for localhost, a private or link-local address, and a ".local" or one-word name (a LAN machine), false for anything on the public internet. */
    fun isLocalHost(host: String): Boolean {
        val h = host.trim('[', ']').lowercase()
        if (h == "localhost" || h == "::1" || h.endsWith(".local") || h.endsWith(".localhost") || !h.contains('.') && !h.contains(':')) return true
        if (h.startsWith("fe80:") || h.startsWith("fc") && h.contains(':') || h.startsWith("fd") && h.contains(':')) return true
        val p = h.split('.').map { it.toIntOrNull() ?: return false }
        if (p.size != 4 || p.any { it !in 0..255 }) return false
        return p[0] == 10 || p[0] == 127 || (p[0] == 172 && p[1] in 16..31) || (p[0] == 192 && p[1] == 168) || (p[0] == 169 && p[1] == 254)
    }
    /** Throws when [url] would send Pager's traffic unencrypted over the internet. */
    fun check(url: String) {
        val u = url.toHttpUrlOrNull() ?: return
        if (u.scheme == "http" && !isLocalHost(u.host)) throw ApiException(0, "Pager only talks to a server over HTTPS (plain HTTP is allowed only on your own network). Use https:// in the server address.")
    }
}

val json = Json { ignoreUnknownKeys = true }

/** Shared HTTP plumbing. Long timeouts because /sync and bridge logins block server-side. */
class Http(var baseUrl: String, var token: String? = null) {
    val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .writeTimeout(180, TimeUnit.SECONDS)      // a big video over a slow uplink stalls a single write for longer than the 10 s default and the send failed
        .callTimeout(0, TimeUnit.SECONDS)
        .followSslRedirects(false)                // an HTTPS address that sends you on to plain HTTP is not followed
        // (An interceptor must fail with an IOException: anything else is an uncaught crash on OkHttp's own thread.)
        .addInterceptor { chain -> try { Transport.check(chain.request().url.toString()) } catch (e: ApiException) { throw IOException(e.message) }; chain.proceed(chain.request()) }
        .build()

    private suspend fun Call.await(): Response = suspendCancellableCoroutine { cont ->
        cont.invokeOnCancellation { cancel() }
        enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) = cont.resumeWithException(e)
            override fun onResponse(call: Call, response: Response) = cont.resume(response)
        })
    }

    /** Streams a local file/URI to the media repo. Returns the mxc:// URI. */
    suspend fun upload(filename: String, contentType: String, length: Long, open: () -> java.io.InputStream): String = withContext(Dispatchers.IO) {
        val body = object : okhttp3.RequestBody() {
            override fun contentType() = contentType.toMediaType()
            override fun contentLength() = length
            override fun writeTo(sink: okio.BufferedSink) { open().use { sink.writeAll(it.source()) } }
        }
        val req = Request.Builder()
            .url(baseUrl.trimEnd('/') + "/_matrix/media/v3/upload?filename=" + java.net.URLEncoder.encode(filename, "UTF-8"))
            .post(body)
            .apply { token?.let { header("Authorization", "Bearer $it") } }
            .build()
        client.newCall(req).await().use { res ->
            val text = res.body?.string().orEmpty()
            val parsed = runCatching { json.parseToJsonElement(text).jsonObject }.getOrDefault(JsonObject(emptyMap()))
            if (!res.isSuccessful) throw ApiException(res.code, (parsed["error"] as? JsonPrimitive)?.contentOrNull ?: "Upload failed (${res.code})")
            (parsed["content_uri"] as? JsonPrimitive)?.contentOrNull ?: throw ApiException(500, "Upload failed")
        }
    }

    /** Authenticated media GET; caller owns the response. */
    suspend fun getRaw(path: String): Response = withContext(Dispatchers.IO) {
        val req = Request.Builder().url(baseUrl.trimEnd('/') + path).apply { token?.let { header("Authorization", "Bearer $it") } }.build()
        client.newCall(req).await()
    }

    /** Sends a file as the body of a POST and reads the JSON answer. Slow jobs (speech to text) get a long wait. */
    suspend fun postFile(path: String, contentType: String, file: java.io.File): JsonObject = withContext(Dispatchers.IO) {
        val req = Request.Builder().url(baseUrl.trimEnd('/') + path).post(file.asRequestBody(contentType.toMediaType())).apply { token?.let { header("Authorization", "Bearer $it") } }.build()
        client.newBuilder().readTimeout(200, java.util.concurrent.TimeUnit.SECONDS).build().newCall(req).await().use { res ->
            val text = res.body?.string().orEmpty()
            val parsed = runCatching { json.parseToJsonElement(text).jsonObject }.getOrDefault(JsonObject(emptyMap()))
            if (!res.isSuccessful) throw ApiException(res.code, (parsed["error"] as? JsonPrimitive)?.contentOrNull ?: "Request failed (${res.code})")
            parsed
        }
    }

    suspend fun request(method: String, path: String, body: JsonElement? = null): JsonObject = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url(baseUrl.trimEnd('/') + path)
            .method(method, body?.let { json.encodeToString(JsonElement.serializer(), it).toRequestBody("application/json".toMediaType()) }
                ?: if (method == "GET") null else "{}".toRequestBody("application/json".toMediaType()))
            .apply { token?.let { header("Authorization", "Bearer $it") } }
            .build()
        client.newCall(req).await().use { res ->
            val text = res.body?.string().orEmpty()
            val parsed = runCatching { json.parseToJsonElement(text).jsonObject }.getOrDefault(JsonObject(emptyMap()))
            if (!res.isSuccessful) {
                val msg = (parsed["error"] as? JsonPrimitive)?.contentOrNull ?: "Request failed (${res.code})"
                throw ApiException(res.code, msg)
            }
            parsed
        }
    }
}
