package app.pager.android

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * What this phone did and what went wrong, kept on the phone so a problem can be looked at afterwards (Settings > Advanced > Logs).
 * Breadcrumbs are short lines about what the app was doing (sync, encryption, network). An incident is a problem with the breadcrumbs from
 * just before it and just after it. Never in here: message text, names, keys, tokens (they are scrubbed).
 */
object AppLog {
    class Crumb(val t: Long, val area: String, val text: String)
    class Incident(val id: String, val kind: String, val message: String, val stack: String, val first: Long, var last: Long, var count: Int, val version: String, val before: List<Crumb>, var after: MutableList<Crumb>)

    const val MAX_CRUMBS = 200
    const val MAX_INCIDENTS = 40
    const val BEFORE = 25
    const val AFTER = 10
    const val AFTER_WINDOW_MS = 60_000L

    private var crumbFile: File? = null
    private var incidentFile: File? = null
    private var version = ""
    private val crumbs = ArrayList<Crumb>()
    private val incidents = ArrayList<Incident>()
    private var dirtyCrumbs = 0
    @Volatile var loaded = false

    fun init(context: Context) = synchronized(this) {
        if (loaded) return
        crumbFile = File(context.filesDir, "applog-crumbs.txt"); incidentFile = File(context.filesDir, "applog-incidents.json")
        version = runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName.orEmpty() }.getOrDefault("")
        runCatching { crumbFile!!.readLines().forEach { l -> val p = l.split('\t', limit = 3); if (p.size == 3) crumbs.add(Crumb(p[0].toLong(), p[1], p[2])) } }
        runCatching { val a = JSONArray(incidentFile!!.readText()); for (i in 0 until a.length()) incidents.add(fromJson(a.getJSONObject(i))) }
        loaded = true
    }

    /** Takes out what must never be kept: access tokens, bearer headers, recovery keys, email addresses. */
    fun scrub(s: String): String = s
        .replace(Regex("(access_token|password|token|secret|recovery[ _-]?key)([\"']?\\s*[:=]\\s*[\"']?)[^\\s\"',&}]+", RegexOption.IGNORE_CASE), "$1$2[removed]")
        .replace(Regex("Bearer\\s+[A-Za-z0-9._~+/=-]+"), "Bearer [removed]")
        .replace(Regex("\\b(syt|mat)_[A-Za-z0-9_-]{10,}"), "[removed]")
        .replace(Regex("\\bE[sS][A-Za-z0-9]{2}(?:\\s[A-Za-z0-9]{4}){10,}\\b"), "[recovery key removed]")
        .replace(Regex("[\\w.+-]+@[\\w-]+(\\.[\\w-]+)+"), "[address removed]")

    fun crumb(area: String, text: String) = synchronized(this) {
        if (!loaded) return
        val c = Crumb(System.currentTimeMillis(), area, scrub(text).replace('\n', ' ').replace('\t', ' ').take(200))
        crumbs.add(c); while (crumbs.size > MAX_CRUMBS) crumbs.removeAt(0)
        var touched = false
        for (i in incidents) if (i.after.size < AFTER && c.t - i.last < AFTER_WINDOW_MS && c.t >= i.last) { i.after.add(c); touched = true }
        if (touched) saveIncidents()
        // Written every few lines, and straight away with every problem, so a crash loses little.
        if (++dirtyCrumbs >= 5) saveCrumbs()
    }

    private fun fingerprint(kind: String, message: String) = kind + "|" + message.replace(Regex("[0-9a-fA-F]{8,}|\\d+"), "#").take(120)

    /** A problem. The same problem again is counted, not listed again. */
    fun incident(kind: String, message: String, stack: String = "") = synchronized(this) {
        if (!loaded) return
        val msg = scrub(message).take(400); val id = fingerprint(kind, msg); val now = System.currentTimeMillis()
        val old = incidents.find { it.id == id }
        if (old != null) { old.count++; old.last = now; old.after = ArrayList() }
        else {
            incidents.add(Incident(id, kind, msg, scrub(stack).lines().take(8).joinToString("\n"), now, now, 1, version, crumbs.takeLast(BEFORE), ArrayList()))
            if (incidents.size > MAX_INCIDENTS) { incidents.sortByDescending { it.last }; while (incidents.size > MAX_INCIDENTS) incidents.removeAt(incidents.size - 1) }
        }
        crumb("problem", "$kind: ${msg.lineSequence().first()}")
        saveCrumbs(); saveIncidents()
    }

    fun incidents(): List<Incident> = synchronized(this) { incidents.sortedByDescending { it.last } }
    fun crumbs(): List<Crumb> = synchronized(this) { crumbs.toList() }
    fun dismiss(id: String) = synchronized(this) { incidents.removeAll { it.id == id }; saveIncidents() }
    fun clear() = synchronized(this) { crumbs.clear(); incidents.clear(); saveCrumbs(); saveIncidents() }

    private fun saveCrumbs() { dirtyCrumbs = 0; runCatching { crumbFile?.writeText(crumbs.joinToString("\n", postfix = "\n") { "${it.t}\t${it.area}\t${it.text}" }) } }
    private fun saveIncidents() { runCatching { incidentFile?.writeText(JSONArray().also { a -> incidents.forEach { a.put(toJson(it)) } }.toString()) } }
    private fun toJson(i: Incident) = JSONObject().put("id", i.id).put("kind", i.kind).put("message", i.message).put("stack", i.stack).put("first", i.first).put("last", i.last).put("count", i.count).put("version", i.version)
        .put("before", crumbsJson(i.before)).put("after", crumbsJson(i.after))
    private fun crumbsJson(l: List<Crumb>) = JSONArray().also { a -> l.forEach { a.put(JSONObject().put("t", it.t).put("area", it.area).put("text", it.text)) } }
    private fun crumbsFrom(a: JSONArray) = (0 until a.length()).map { a.getJSONObject(it).let { o -> Crumb(o.getLong("t"), o.getString("area"), o.getString("text")) } }
    private fun fromJson(o: JSONObject) = Incident(o.getString("id"), o.getString("kind"), o.getString("message"), o.optString("stack"), o.getLong("first"), o.getLong("last"), o.getInt("count"), o.optString("version"),
        crumbsFrom(o.getJSONArray("before")), crumbsFrom(o.getJSONArray("after")).toMutableList())

    private fun clock(t: Long) = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US).format(java.util.Date(t))
    private fun full(t: Long) = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", java.util.Locale.US).format(java.util.Date(t))
    private fun line(c: Crumb) = "  ${clock(c.t)}  ${c.area}: ${c.text}"

    /** One incident as plain text, to copy or send. */
    fun text(i: Incident): String = buildString {
        append("${i.kind} (${if (i.count == 1) "once" else "${i.count} times"}), first ${full(i.first)}, last ${full(i.last)}${if (i.version.isNotEmpty()) ", app ${i.version}" else ""}\n\n")
        if (i.before.isNotEmpty()) { append("Before:\n"); i.before.forEach { append(line(it)).append('\n') }; append('\n') }
        append("Problem:\n  ${i.message}\n")
        if (i.stack.isNotEmpty()) i.stack.lines().forEach { append("  $it\n") }
        if (i.after.isNotEmpty()) { append("\nAfter:\n"); i.after.forEach { append(line(it)).append('\n') } }
    }

    /** Everything as text: the problems, then the latest breadcrumbs. */
    fun all(): String {
        val inc = incidents(); val cr = crumbs()
        return "Pager $version  Android ${android.os.Build.VERSION.RELEASE}  ${android.os.Build.MODEL}\n\n== Problems (${inc.size}) ==\n" +
            (if (inc.isEmpty()) "none" else inc.joinToString("\n\n") { text(it) }) + "\n\n== Recent activity (${cr.size}) ==\n" + (if (cr.isEmpty()) "none" else cr.joinToString("\n") { line(it) })
    }
}
