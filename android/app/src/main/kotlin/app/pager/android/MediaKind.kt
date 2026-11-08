package app.pager.android

/**
 * Which kind of message a file may be sent as. A bridge accepts only some types for pictures, videos and audio (Signal: no .m4a labelled audio/x-m4a, no
 * HEIC, no QuickTime video) and refuses the rest with "unsupported media type", which left the message on "Sent" for ever. Any file can go as a plain
 * file, so a type the bridges do not take is sent that way, and the usual alternative spellings are put right first. Same rules as the web app (mediatype.ts).
 */
object MediaKind {
    private val alias = mapOf(
        "audio/x-m4a" to "audio/mp4", "audio/m4a" to "audio/mp4", "audio/x-mp4" to "audio/mp4", "audio/x-wav" to "audio/wav", "audio/wave" to "audio/wav", "audio/vnd.wave" to "audio/wav",
        "audio/x-aac" to "audio/aac", "audio/x-flac" to "audio/flac", "audio/x-mp3" to "audio/mpeg", "audio/mpeg3" to "audio/mpeg", "audio/x-mpeg" to "audio/mpeg",
        "image/jpg" to "image/jpeg", "image/pjpeg" to "image/jpeg", "video/x-m4v" to "video/mp4",
    )
    /** What the bridges take for each kind (the part they all agree on). */
    private val ok = mapOf(
        "m.image" to setOf("image/jpeg", "image/png", "image/gif", "image/webp"),
        "m.video" to setOf("video/mp4", "video/webm"),
        "m.audio" to setOf("audio/aac", "audio/mpeg", "audio/mp3", "audio/flac", "audio/mp4", "audio/wav"),
    )

    /** The message kind and file type to send [mime] as. [bridged]: the page is on another network; a Pager-only page takes everything as it is. */
    fun of(mime: String, bridged: Boolean): Pair<String, String> {
        val plain = mime.lowercase().substringBefore(';').trim()
        val m = (alias[plain] ?: plain).ifEmpty { "application/octet-stream" }
        val type = when { m.startsWith("image/") -> "m.image"; m.startsWith("video/") -> "m.video"; m.startsWith("audio/") -> "m.audio"; else -> "m.file" }
        if (type == "m.file" || !bridged) return type to (if (alias.containsKey(plain)) m else mime.ifEmpty { m })
        return if (ok.getValue(type).contains(m)) type to m else "m.file" to m
    }

    /** The bridge's reason for refusing a message, in words for the person. */
    fun niceReason(reason: String): String = when {
        Regex("unsupported media type", RegexOption.IGNORE_CASE).containsMatchIn(reason) -> "it doesn't accept that kind of file"
        Regex("too large|too big|file size|MaxSize", RegexOption.IGNORE_CASE).containsMatchIn(reason) -> "the file is too big for it"
        else -> reason.replaceFirstChar { if (it.isUpperCase()) it.lowercaseChar() else it }.take(140)
    }
}
