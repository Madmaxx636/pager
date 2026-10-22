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

@kotlinx.serialization.Serializable
data class Gif(val id: String, val title: String, val previewUrl: String, val url: String, val w: Int, val h: Int, val source: String = "")

/** One search tab. [keyOf] is whose key it needs (giphy or klipy); the stickers use the same key as the GIFs. */
data class GifSource(val id: String, val name: String, val keyOf: String, val stickers: Boolean)

val GIF_SOURCES = listOf(
    GifSource("giphy", "GIPHY", "giphy", false), GifSource("giphy-stickers", "GIPHY Stickers", "giphy", true),
    GifSource("klipy", "KLIPY", "klipy", false), GifSource("klipy-stickers", "KLIPY Stickers", "klipy", true),
)
/** The providers you can enter a key for: id, name, where to get it. */
val GIF_KEY_PROVIDERS = listOf(Triple("giphy", "GIPHY", "developers.giphy.com"), Triple("klipy", "KLIPY", "partner.klipy.com"))

/** The sources you can search right now: those whose key you have entered. */
fun sourcesWithKeys(keys: Map<String, String>): List<GifSource> = GIF_SOURCES.filter { !keys[it.keyOf].isNullOrBlank() }

private fun JsonElement?.obj() = (this as? JsonObject) ?: JsonObject(emptyMap())
private fun JsonElement?.arr() = (this as? JsonArray) ?: JsonArray(emptyList())
private fun JsonElement?.str() = (this as? JsonPrimitive)?.contentOrNull
private fun JsonElement?.int() = str()?.toIntOrNull() ?: 0

object GifApi {
    fun requestFor(source: GifSource, key: String, query: String): String {
        val q = URLEncoder.encode(query, "UTF-8"); val k = URLEncoder.encode(key.trim(), "UTF-8")
        val what = if (source.stickers) "stickers" else "gifs"; val how = if (query.isBlank()) "trending" else "search"
        return if (source.keyOf == "klipy") "https://api.klipy.com/api/v1/$k/$what/$how?per_page=30&customer_id=pager&content_filter=medium" + if (query.isBlank()) "" else "&q=$q"
        else "https://api.giphy.com/v1/$what/$how?api_key=$k&limit=30&rating=pg-13" + if (query.isBlank()) "" else "&q=$q"
    }

    /** Why a search failed, in words: the status alone ("403") does not help anyone fix it. */
    fun explain(source: GifSource, status: Int): String {
        val who = if (source.keyOf == "klipy") "KLIPY" else "GIPHY"
        return when (status) {
            401, 403 -> "$who rejected the key. Check that it is the $who key (not another service's), that it is still active, and that it is not restricted to another device or address."
            429 -> "$who says too many searches were made. A new key is limited to about 100 an hour. Wait a bit and try again."
            else -> "$who search failed ($status)."
        }
    }

    /** What the service itself said when it refused (it tells apart a wrong key from a limit or a blocked address). */
    fun providerSays(code: Int, body: String): String {
        val m = runCatching {
            val j = json.parseToJsonElement(body).jsonObject
            (j["meta"].obj()["msg"].str() ?: j["message"].str() ?: j["error"].obj()["message"].str() ?: j["error"].str()).orEmpty()
        }.getOrElse { body }.replace(Regex("<[^>]*>"), " ").replace(Regex("\\s+"), " ").trim().take(140)
        return if (m.isNotEmpty()) " It said: \u201c$m\u201d (code $code)." else " (code $code)"
    }
    /** Lets you compare a key across devices without showing it: its length and last four characters. */
    fun fingerprint(key: String): String { val k = key.trim(); return if (k.isEmpty()) "empty" else "${k.length} characters, ends \u2026${k.takeLast(4)}" }

    fun parseGiphy(o: JsonObject, source: String = "giphy"): List<Gif> = o["data"].arr().mapNotNull {
        val r = it.obj(); val img = r["images"].obj(); val orig = img["original"].obj(); val small = img["fixed_height_small"].obj().takeIf { s -> s["url"] != null } ?: img["fixed_height"].obj()
        val u = orig["url"].str() ?: return@mapNotNull null
        Gif(r["id"].str().orEmpty(), r["title"].str().orEmpty(), small["url"].str() ?: u, u, orig["width"].int(), orig["height"].int(), source)
    }

    /** KLIPY: each result has several sizes (hd, md, sm, xs), each in several formats. A small one previews; a medium one is sent. */
    fun parseKlipy(o: JsonObject, source: String = "klipy"): List<Gif> {
        val list = o["data"].obj()["data"].arr().ifEmpty { o["data"].arr() }
        fun pick(file: JsonObject, sizes: List<String>, kinds: List<String>): JsonObject? { for (sz in sizes) for (k in kinds) file[sz].obj()[k].obj().takeIf { x -> x["url"] != null }?.let { x -> return x }; return null }
        return list.mapNotNull {
            val r = it.obj(); val file = r["file"].obj()
            val send = pick(file, listOf("md", "hd", "sm"), listOf("gif", "webp", "png")) ?: return@mapNotNull null
            val small = pick(file, listOf("sm", "xs", "md"), listOf("gif", "webp", "jpg", "png")) ?: send
            Gif((r["id"].str() ?: r["slug"].str()).orEmpty(), r["title"].str().orEmpty(), small["url"].str()!!, send["url"].str()!!, send["width"].int(), send["height"].int(), source)
        }
    }
}

/** GIF and sticker search through GIPHY and KLIPY using your own API keys (Pager doesn't ship a shared key). Tenor shut down on 30 June 2026. */
class GifClient(private val client: OkHttpClient) {
    suspend fun search(source: GifSource, key: String, query: String): List<Gif> = withContext(Dispatchers.IO) {
        val body = try {
            client.newCall(Request.Builder().url(GifApi.requestFor(source, key, query)).build()).execute().use { r ->
                if (!r.isSuccessful) throw ApiException(r.code, GifApi.explain(source, r.code) + GifApi.providerSays(r.code, r.body?.string().orEmpty()))
                r.body?.string().orEmpty()
            }
        } catch (e: java.io.IOException) { throw ApiException(0, "Couldn't reach ${if (source.keyOf == "klipy") "KLIPY" else "GIPHY"}. Check your connection.") }
        val o = json.parseToJsonElement(body).jsonObject
        if (source.keyOf == "klipy") GifApi.parseKlipy(o, source.id) else GifApi.parseGiphy(o, source.id)
    }

    suspend fun download(url: String): ByteArray = withContext(Dispatchers.IO) {
        client.newCall(Request.Builder().url(url).build()).execute().use { r -> if (!r.isSuccessful) throw ApiException(r.code, "Couldn't download that GIF"); r.body!!.bytes() }
    }
}
