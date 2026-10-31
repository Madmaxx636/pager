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
import kotlinx.coroutines.launch
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
 * Updates from GitHub (the release tagged "updates") and from your own server: both publish latest.json (version, file, checksum) next to the APK.
 * This asks them, takes the newer answer, downloads that APK, checks the checksum and hands it to Android's installer. Android itself refuses an APK not signed by the same key as the
 * installed app, so a swapped file cannot replace Pager.
 */
object Updater {
    data class Info(val version: String, val code: Long, val url: String, val sha256: String, val notes: String, val signer: String? = null)
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

    /** Asks the server whether a newer version exists. Quietly does nothing when checked in the last 20 minutes, unless [force]. */
    suspend fun check(ctx: Context, server: String, force: Boolean) {
        val prefs = ctx.getSharedPreferences("pager.updates", Context.MODE_PRIVATE)
        if (!force && System.currentTimeMillis() - prefs.getLong("checked", 0) < 20 * 60_000L) return
        if (_stage.value != Stage.IDLE) return
        _stage.value = Stage.CHECKING
        try {
            val info = withContext(Dispatchers.IO) { fetch(server) }
            prefs.edit().putLong("checked", System.currentTimeMillis()).apply()
            // An update signed with a different key than this app can't be installed over it: don't offer it (say why only when asked).
            if (info != null && info.signer != null && !sameSigner(signers(ctx), setOf(info.signer))) { if (force && info.code > currentCode(ctx)) _message.value = wrongKey(info) else if (force) _message.value = "You're up to date (${currentName(ctx)})" }
            else if (info != null && info.code > currentCode(ctx)) _available.value = info
            else if (force) _message.value = "You're up to date (${currentName(ctx)})"
        } catch (e: Exception) { if (force) _message.value = "Couldn't check for updates: ${e.message ?: "server unreachable"}" }
        _stage.value = Stage.IDLE
    }

    /** Phones that cannot run 64-bit code (a few small and older ones) take the lighter 32-bit file when the server publishes one. */
    internal fun entryFor(all: JsonObject, abis: List<String>): String = if (abis.none { it == "arm64-v8a" || it == "x86_64" } && all["android32"] is JsonObject) "android32" else "android"

    /** Where the project publishes its releases. Works from any network, so an update does not need your server (or you at home). */
    const val GITHUB = "https://github.com/Madmaxx636/pager/releases/download/updates/"

    internal fun parse(json: String, server: String, abis: List<String> = runCatching { Build.SUPPORTED_ABIS.toList() }.getOrDefault(listOf("arm64-v8a")), base: String? = null): Info? {
        val all = Json.parseToJsonElement(json).jsonObject
        val a = (all[entryFor(all, abis)] as? JsonObject) ?: return null
        fun s(k: String) = (a[k] as? JsonPrimitive)?.contentOrNull
        val code = (a["code"] as? JsonPrimitive)?.longOrNull ?: return null
        val file = s("file") ?: return null
        if (file.contains('/') || file.contains("..")) return null
        return Info(s("version") ?: code.toString(), code, (base ?: (server.trimEnd('/') + "/updates/")) + file, (s("sha256") ?: return null).lowercase(), s("notes") ?: "", s("signer")?.lowercase()?.replace(":", ""))
    }

    /** Asks GitHub and the server, and takes whichever has the newer version. Only fails when neither could be reached. */
    private fun fetch(server: String): Info? {
        var best: Info? = null; var reached = false; var failure: Exception? = null
        for (base in listOfNotNull(GITHUB, server.takeIf { it.isNotBlank() }?.let { it.trimEnd('/') + "/updates/" })) {
            try {
                val c = URL(base + "latest.json").openConnection() as HttpURLConnection
                c.connectTimeout = 10_000; c.readTimeout = 15_000
                if (c.responseCode == 404) { reached = true; continue }
                val info = parse(c.inputStream.bufferedReader().use { it.readText() }, server, base = base)
                reached = true
                if (info != null && (best == null || info.code > best.code)) best = info
            } catch (e: Exception) { failure = e }
        }
        if (!reached && failure != null) throw failure
        return best
    }

    /** True when an update signed by [theirs] can be installed over an app signed by [mine] (Android refuses anything else). */
    internal fun sameSigner(mine: Set<String>, theirs: Set<String>) = mine.isNotEmpty() && mine.any { it in theirs }

    private fun sha256Hex(b: ByteArray) = MessageDigest.getInstance("SHA-256").digest(b).joinToString("") { "%02x".format(it) }

    /** The SHA-256 of each certificate this package (or an APK file) is signed with, lower-case hex. */
    @Suppress("DEPRECATION")
    private fun signers(ctx: Context, apkPath: String? = null): Set<String> {
        val pm = ctx.packageManager
        return try {
            if (Build.VERSION.SDK_INT >= 28) {
                val flag = android.content.pm.PackageManager.GET_SIGNING_CERTIFICATES
                val info = if (apkPath == null) pm.getPackageInfo(ctx.packageName, flag) else pm.getPackageArchiveInfo(apkPath, flag)
                val si = info?.signingInfo ?: return emptySet()
                // The history includes keys this app was signed with before a rotation, which Android still accepts.
                (if (si.hasMultipleSigners()) si.apkContentsSigners else si.signingCertificateHistory).map { sha256Hex(it.toByteArray()) }.toSet()
            } else {
                val flag = android.content.pm.PackageManager.GET_SIGNATURES
                val info = if (apkPath == null) pm.getPackageInfo(ctx.packageName, flag) else pm.getPackageArchiveInfo(apkPath, flag)
                info?.signatures?.map { sha256Hex(it.toByteArray()) }?.toSet().orEmpty()
            }
        } catch (_: Exception) { emptySet() }
    }

    private fun wrongKey(info: Info) = "This update is signed with a different key than the Pager on this phone, so Android won't install it over the top. " +
        "To switch: make sure you have your recovery key, uninstall Pager, install the new version from ${info.url}, and sign in again."

    /** Downloads the APK, checks it matches the checksum on the server, and asks Android to install it. */
    suspend fun install(ctx: Context, info: Info) {
        if (_stage.value != Stage.IDLE) return
        // If the update is signed with a different key (the move from the trial key to the release key), say so before downloading anything.
        if (info.signer != null && !sameSigner(signers(ctx), setOf(info.signer))) { _message.value = wrongKey(info); return }
        _stage.value = Stage.DOWNLOADING
        try {
            val file = withContext(Dispatchers.IO) {
                val dir = File(ctx.cacheDir, "updates").apply { deleteRecursively(); mkdirs() }
                val f = File(dir, "pager.apk")
                // A download that stalls or drops starts again (up to three tries) instead of sitting there; the percentage shows it is moving.
                var failure: Exception? = null
                var ok = false
                for (attempt in 1..3) {
                    try {
                        _progress.value = 0
                        val c = URL(info.url).openConnection() as HttpURLConnection
                        c.connectTimeout = 15_000; c.readTimeout = 30_000
                        val total = c.contentLengthLong
                        val md = MessageDigest.getInstance("SHA-256")
                        c.inputStream.use { i -> f.outputStream().use { o ->
                            val buf = ByteArray(64 * 1024); var done = 0L; var shown = -1
                            while (true) {
                                val n = i.read(buf); if (n < 0) break
                                md.update(buf, 0, n); o.write(buf, 0, n); done += n
                                val pc = if (total > 0) (done * 100 / total).toInt() else -1
                                if (pc != shown) { shown = pc; _progress.value = pc }
                            }
                        } }
                        val got = md.digest().joinToString("") { "%02x".format(it) }
                        if (got != info.sha256) { f.delete(); throw java.io.IOException("The download doesn't match its checksum, so it was not installed") }
                        ok = true; break
                    } catch (e: java.io.IOException) { failure = e; f.delete(); if (e.message?.contains("checksum") == true) throw e; kotlinx.coroutines.delay(2_000L * attempt) }
                }
                if (!ok) throw java.io.IOException("The download kept stopping (${failure?.message ?: "no connection"}). Check your connection and try again")
                f
            }
            if (!sameSigner(signers(ctx), signers(ctx, file.path))) throw java.io.IOException(wrongKey(info))
            _stage.value = Stage.INSTALLING
            withContext(Dispatchers.IO) { commit(ctx, file) }
            _available.value = null
            // Android answers through UpdateReceiver. If it never does, do not sit on "Installing…" forever.
            watch.launch { kotlinx.coroutines.delay(180_000); if (_stage.value == Stage.INSTALLING) report("Android didn't finish the install. Open the update again, or use the install notification.") }
        } catch (e: Exception) { _message.value = "Update failed: ${e.message ?: e::class.java.simpleName}"; _stage.value = Stage.IDLE; _progress.value = -1 }
    }

    private fun commit(ctx: Context, apk: File) {
        val installer = ctx.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        // After the first update done this way, Android can update without asking again.
        if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        val id = installer.createSession(params)
        installer.openSession(id).use { s ->
            apk.inputStream().use { i -> s.openWrite("pager.apk", 0, apk.length()).use { o -> i.copyTo(o); s.fsync(o) } }
            // After the update Android closes Pager and does not start it again: remember that you were in it, so PackageReplacedReceiver can open it.
            ctx.getSharedPreferences("pager.updates", Context.MODE_PRIVATE).edit().putBoolean("reopen", true).putLong("reopenAt", System.currentTimeMillis()).apply()
            val intent = Intent(ctx, UpdateReceiver::class.java).setPackage(ctx.packageName)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
            s.commit(PendingIntent.getBroadcast(ctx, id, intent, flags).intentSender)
        }
    }

    internal fun report(text: String) { _message.value = text; _stage.value = Stage.IDLE }

    /** How much of the download is done, in percent (-1 when the server did not say how big it is). */
    private val _progress = kotlinx.coroutines.flow.MutableStateFlow(-1)
    val progress: kotlinx.coroutines.flow.StateFlow<Int> = _progress
    private val watch = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.SupervisorJob() + Dispatchers.Default)
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

/**
 * Android stops an app while it is being replaced and never starts it again. This runs in the NEW version right after the update (Android sends it
 * to the updated app itself): sync starts again at once so messages keep coming, and, if you updated from inside Pager, the app opens by itself
 * (or, where Android won't let a background app open a window, a full-screen notice you tap).
 */
class PackageReplacedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        runCatching { androidx.core.content.ContextCompat.startForegroundService(context, Intent(context, SyncService::class.java)) }
        val prefs = context.getSharedPreferences("pager.updates", Context.MODE_PRIVATE)
        val wanted = prefs.getBoolean("reopen", false) && System.currentTimeMillis() - prefs.getLong("reopenAt", 0) < 15 * 60_000L
        prefs.edit().remove("reopen").apply()
        if (!wanted) return
        val open = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        if (runCatching { context.startActivity(open) }.isSuccess && Build.VERSION.SDK_INT < 29) return
        // Newer Android only lets a background app open a window through a notification.
        val nm = context.getSystemService(android.app.NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(android.app.NotificationChannel("pager-updated", "App updated", android.app.NotificationManager.IMPORTANCE_HIGH))
        val tap = PendingIntent.getActivity(context, 77, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = androidx.core.app.NotificationCompat.Builder(context, "pager-updated").setSmallIcon(R.drawable.ic_notif)
            .setContentTitle("Pager was updated").setContentText("Tap to open it").setContentIntent(tap).setFullScreenIntent(tap, true).setAutoCancel(true)
            .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH).setCategory(androidx.core.app.NotificationCompat.CATEGORY_CALL).build()
        runCatching { nm.notify(7701, n) }
    }
}
