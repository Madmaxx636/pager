package app.pager.android

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Updates from your own server: it publishes /updates/latest.json (version, file, checksum) next to the APK. This asks it, downloads a
 * newer APK, checks the checksum and hands it to Android's installer. Android itself refuses an APK not signed by the same key as the
 * installed app, so a swapped file cannot replace Pager.
 */
object Updater {
    data class Info(val version: String, val code: Long, val url: String, val sha256: String, val notes: String)
    enum class Stage { IDLE, CHECKING, DOWNLOADING, INSTALLING }

    private val _available = MutableStateFlow<Info?>(null)
    val available: StateFlow<Info?> = _available.asStateFlow()
    private val _stage = MutableStateFlow(Stage.IDLE)
    val stage: StateFlow<Stage> = _stage.asStateFlow()
    /** What the last check or install said, in words ("You're up to date", "Couldn't reach the server"…). */
    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()
    fun clearMessage() { _message.value = null }
    fun later() { _available.value = null }

    fun currentCode(ctx: Context): Long = ctx.packageManager.getPackageInfo(ctx.packageName, 0).longVersionCode
    fun currentName(ctx: Context): String = ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName ?: ""

    /** Asks the server whether a newer version exists. Quietly does nothing when checked recently, unless [force]. */
    suspend fun check(ctx: Context, server: String, force: Boolean) {
        val prefs = ctx.getSharedPreferences("pager.updates", Context.MODE_PRIVATE)
        if (!force && System.currentTimeMillis() - prefs.getLong("checked", 0) < 6 * 3600_000L) return
        if (_stage.value != Stage.IDLE) return
        _stage.value = Stage.CHECKING
        try {
            val info = withContext(Dispatchers.IO) { fetch(server) }
            prefs.edit().putLong("checked", System.currentTimeMillis()).apply()
            if (info != null && info.code > currentCode(ctx)) _available.value = info
            else if (force) _message.value = "You're up to date (${currentName(ctx)})"
        } catch (e: Exception) { if (force) _message.value = "Couldn't check for updates: ${e.message ?: "server unreachable"}" }
        _stage.value = Stage.IDLE
    }

    internal fun parse(json: String, server: String): Info? {
        val a = (Json.parseToJsonElement(json).jsonObject["android"] as? JsonObject) ?: return null
        fun s(k: String) = (a[k] as? JsonPrimitive)?.contentOrNull
        val code = (a["code"] as? JsonPrimitive)?.longOrNull ?: return null
        val file = s("file") ?: return null
        if (file.contains('/') || file.contains("..")) return null
        return Info(s("version") ?: code.toString(), code, server.trimEnd('/') + "/updates/" + file, (s("sha256") ?: return null).lowercase(), s("notes") ?: "")
    }

    private fun fetch(server: String): Info? {
        val c = URL(server.trimEnd('/') + "/updates/latest.json").openConnection() as HttpURLConnection
        c.connectTimeout = 10_000; c.readTimeout = 15_000
        if (c.responseCode == 404) return null
        return parse(c.inputStream.bufferedReader().use { it.readText() }, server)
    }

    /** Downloads the APK, checks it matches the checksum on the server, and asks Android to install it. */
    suspend fun install(ctx: Context, info: Info) {
        if (_stage.value != Stage.IDLE) return
        _stage.value = Stage.DOWNLOADING
        try {
            val file = withContext(Dispatchers.IO) {
                val dir = File(ctx.cacheDir, "updates").apply { deleteRecursively(); mkdirs() }
                val f = File(dir, "pager.apk")
                val c = URL(info.url).openConnection() as HttpURLConnection
                c.connectTimeout = 15_000; c.readTimeout = 60_000
                val md = MessageDigest.getInstance("SHA-256")
                c.inputStream.use { i -> f.outputStream().use { o -> val buf = ByteArray(64 * 1024); while (true) { val n = i.read(buf); if (n < 0) break; md.update(buf, 0, n); o.write(buf, 0, n) } } }
                val got = md.digest().joinToString("") { "%02x".format(it) }
                if (got != info.sha256) { f.delete(); throw java.io.IOException("The download doesn't match its checksum, so it was not installed") }
                f
            }
            _stage.value = Stage.INSTALLING
            withContext(Dispatchers.IO) { commit(ctx, file) }
            _available.value = null
        } catch (e: Exception) { _message.value = "Update failed: ${e.message ?: e::class.java.simpleName}"; _stage.value = Stage.IDLE }
    }

    private fun commit(ctx: Context, apk: File) {
        val installer = ctx.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        // After the first update done this way, Android can update without asking again.
        if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        val id = installer.createSession(params)
        installer.openSession(id).use { s ->
            apk.inputStream().use { i -> s.openWrite("pager.apk", 0, apk.length()).use { o -> i.copyTo(o); s.fsync(o) } }
            val intent = Intent(ctx, UpdateReceiver::class.java).setPackage(ctx.packageName)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
            s.commit(PendingIntent.getBroadcast(ctx, id, intent, flags).intentSender)
        }
    }

    internal fun report(text: String) { _message.value = text; _stage.value = Stage.IDLE }
}

/** Android tells us here how the install went (and asks the person to confirm when it must). */
class UpdateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -1)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION") val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)?.let { context.startActivity(it) }
            }
            PackageInstaller.STATUS_SUCCESS -> Updater.report("Updated")
            else -> Updater.report("Update didn't install: ${intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "unknown reason"}")
        }
    }
}
