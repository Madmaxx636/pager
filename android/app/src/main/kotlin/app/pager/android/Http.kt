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
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class ApiException(val status: Int, message: String) : Exception(message)

val json = Json { ignoreUnknownKeys = true }

/** Shared HTTP plumbing. Long timeouts because /sync and bridge logins block server-side. */
class Http(var baseUrl: String, var token: String? = null) {
    val client: OkHttpClient = OkHttpClient.Builder()
        .readTimeout(90, TimeUnit.SECONDS)
        .callTimeout(0, TimeUnit.SECONDS)
        .build()

    private suspend fun Call.await(): Response = suspendCancellableCoroutine { cont ->
        cont.invokeOnCancellation { cancel() }
        enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) = cont.resumeWithException(e)
            override fun onResponse(call: Call, response: Response) = cont.resume(response)
        })
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
