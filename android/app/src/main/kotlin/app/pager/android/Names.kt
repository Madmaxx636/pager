package app.pager.android

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.ContactsContract
import androidx.core.content.ContextCompat
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Tidy names. Bridges add their tag to every name ("Sam (WA)") and show a bare phone number for anyone they have no name for.
 * We drop the tag and look numbers up in a phone book built from your phone's contacts and your bridges' contact lists.
 */
object Names {
    private const val TAGS = "wa|whatsapp|signal|sms|rcs|gm|gmessages|google messages|messenger|fb|facebook|ig|instagram|tg|telegram|dc|discord|slack|twitter|x|bsky|bluesky|li|linkedin|imessage"
    private val tagSuffix = Regex("\\s*[(\\[]\\s*(?:$TAGS)\\s*[)\\]]\\s*$", RegexOption.IGNORE_CASE)
    private val phoneLike = Regex("^\\+?[\\d\\s().-]{7,20}$")

    fun stripTag(n: String) = n.replace(tagSuffix, "").trim()
    fun isPhone(n: String) = phoneLike.matches(n.trim()) && n.count { it.isDigit() } >= 7
    /** Digits only, matched on the last 10 so "+1 (555) 123-4567" and "5551234567" are the same person. */
    fun phoneKey(n: String): String { val d = n.filter { it.isDigit() }; return if (d.length >= 7) d.takeLast(10) else "" }

    private val book = HashMap<String, String>()
    private val _version = MutableStateFlow(0)
    /** Bumps when the phone book changes, so lists redraw with the new names. */
    val version: StateFlow<Int> = _version.asStateFlow()
    private var prefs: android.content.SharedPreferences? = null

    fun init(context: Context) {
        if (prefs != null) return
        prefs = context.getSharedPreferences("pager.phonebook", Context.MODE_PRIVATE)
        synchronized(book) { prefs!!.all.forEach { (k, v) ->
            if (v !is String) return@forEach
            if (k.startsWith("own.")) { val (num, nm) = v.split('\t', limit = 2).let { it[0] to it.getOrElse(1) { "" } }; own[k.removePrefix("own.")] = num to nm } else book[k] = v
        } }
    }

    /** Contacts you brought yourself (your phone's, or another device of yours). These sync to your account; bridge names don't. */
    private val own = LinkedHashMap<String, Pair<String, String>>()
    fun ownContacts(): List<Pair<String, String>> = synchronized(book) { own.values.toList() }

    /**
     * Add names. A later entry only replaces an earlier one when `override` (your own contacts).
     * `mine` also remembers the entry as one of your own, so it can be synced. Returns whether your own contacts changed.
     */
    fun add(entries: List<Pair<String, String>>, override: Boolean = false, mine: Boolean = false): Boolean {
        var changed = false; var ownChanged = false
        val edit = prefs?.edit()
        synchronized(book) {
            for ((number, raw) in entries) {
                val k = phoneKey(number); val nm = stripTag(raw)
                if (k.isEmpty() || nm.isEmpty() || isPhone(nm)) continue
                if (mine && own[k]?.second != nm) { own[k] = number to nm; edit?.putString("own.$k", "$number\t$nm"); ownChanged = true }
                val old = book[k]
                if (old == nm || (old != null && !override)) continue
                book[k] = nm; edit?.putString(k, nm); changed = true
            }
        }
        edit?.apply()
        if (changed) _version.value++
        return ownChanged
    }

    fun lookup(number: String): String? = synchronized(book) { book[phoneKey(number)] }

    /** A name fit to show: no network tag, and a contact's name instead of a bare number when we know it. */
    fun pretty(raw: String): String {
        val n = stripTag(raw)
        return if (isPhone(n)) lookup(n) ?: n else n.ifEmpty { raw }
    }

    fun hasDevicePermission(context: Context) = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED

    /** Read the phone's own contacts into the phone book (needs the contacts permission). True if there is anything new to sync. */
    fun loadDevice(context: Context): Boolean {
        if (!hasDevicePermission(context)) return false
        val out = ArrayList<Pair<String, String>>()
        runCatching {
            context.contentResolver.query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER, ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME), null, null, null,
            )?.use { c -> while (c.moveToNext()) { val num = c.getString(0) ?: continue; val name = c.getString(1) ?: continue; out.add(num to name) } }
        }
        return add(out, override = true, mine = true)
    }
}
