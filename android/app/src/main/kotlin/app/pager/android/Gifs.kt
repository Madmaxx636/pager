package app.pager.android

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.URLEncoder

data class Gif(val id: String, val title: String, val previewUrl: String, val url: String, val w: Int, val h: Int)

private fun JsonElement?.obj() = (this as? JsonObject) ?: JsonObject(emptyMap())
private fun JsonElement?.arr() = (this as? JsonArray) ?: JsonArray(emptyList())
private fun JsonElement?.str() = (this as? JsonPrimitive)?.contentOrNull
private fun JsonElement?.int() = str()?.toIntOrNull() ?: 0

/** GIF search through Giphy or Tenor using the user's own API key (Pager doesn't ship a shared key). */
class GifClient(private val client: OkHttpClient) {
    suspend fun search(provider: String, key: String, query: String): List<Gif> = withContext(Dispatchers.IO) {
        val q = URLEncoder.encode(query, "UTF-8")
        val url = when (provider) {
            "tenor" -> "https://tenor.googleapis.com/v2/${if (query.isBlank()) "featured" else "search"}?key=$key&client_key=pager&limit=30&media_filter=gif,tinygif&q=$q"
            else -> "https://api.giphy.com/v1/gifs/${if (query.isBlank()) "trending" else "search"}?api_key=$key&limit=30&rating=pg-13&q=$q"
        }
        val body = client.newCall(Request.Builder().url(url).build()).execute().use { r ->
            if (!r.isSuccessful) throw ApiException(r.code, if (r.code == 401 || r.code == 403) "That GIF API key was rejected." else "GIF search failed (${r.code})")
            r.body?.string().orEmpty()
        }
        parse(provider, json.parseToJsonElement(body).jsonObject)
    }

    fun parse(provider: String, o: JsonObject): List<Gif> =
        if (provider == "tenor") o["results"].arr().mapNotNull {
            val r = it.obj(); val gif = r["media_formats"].obj()["gif"].obj(); val tiny = r["media_formats"].obj()["tinygif"].obj()
            val u = gif["url"].str() ?: return@mapNotNull null
            Gif(r["id"].str().orEmpty(), r["content_description"].str().orEmpty(), tiny["url"].str() ?: u, u, gif["dims"].arr().getOrNull(0).int(), gif["dims"].arr().getOrNull(1).int())
        } else o["data"].arr().mapNotNull {
            val r = it.obj(); val img = r["images"].obj(); val orig = img["original"].obj(); val small = img["fixed_height_small"].obj().takeIf { s -> s["url"] != null } ?: img["fixed_height"].obj()
            val u = orig["url"].str() ?: return@mapNotNull null
            Gif(r["id"].str().orEmpty(), r["title"].str().orEmpty(), small["url"].str() ?: u, u, orig["width"].int(), orig["height"].int())
        }

    suspend fun download(url: String): ByteArray = withContext(Dispatchers.IO) {
        client.newCall(Request.Builder().url(url).build()).execute().use { r -> if (!r.isSuccessful) throw ApiException(r.code, "Couldn't download that GIF"); r.body!!.bytes() }
    }
}
