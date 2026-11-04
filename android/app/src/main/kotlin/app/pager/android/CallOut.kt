package app.pager.android

import androidx.core.net.toUri
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.ContactsContract
import androidx.compose.foundation.layout.Row
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Call
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Starting a call with someone from a one-to-one chat. A bridge carries messages, not calls, so Pager hands over to the app that can make the call:
 * WhatsApp or Signal straight into a call when the person is in your phone's contacts (those apps add a "call" entry to the contact), otherwise their
 * chat (one tap from the call button); Messenger's chat; or the phone's dialler.
 */
object CallOut {
    class Option(val id: String, val label: String, val intent: () -> Intent)

    /** A bridge puts a person's number in the id it gives them: @whatsapp_15551234567:server. (Signal and others use ids with no number.) */
    private val ghostNumber = Regex("^@(?:whatsapp|gmessages|gvoice|googlevoice|sms)_\\+?(\\d{7,15})(?::|$)")
    private val ghostMessenger = Regex("^@(?:messenger|facebook|meta)_(\\d{5,20})(?::|$)")

    /** "+1 (555) 123-4567" -> "+15551234567". Without a country code and shorter than 11 digits it stays as written (a dialler can use it, WhatsApp and Signal cannot). */
    fun normalize(raw: String): String {
        val digits = raw.filter { it.isDigit() }
        if (digits.length < 7 || digits.length > 15) return ""
        return if (raw.trim().startsWith("+") || digits.length >= 11) "+$digits" else digits
    }

    private fun others(c: ChatState, me: String) = (c.heroes + c.joined).distinct().filter { it != me }

    /** The other person's number(s) in a one-to-one chat: from their bridge id; else the chat's name when it is a bare number; else every number the contacts list for that name (a contact can have two). */
    fun numbersFor(c: ChatState, me: String, contacts: List<Pair<String, String>>): List<String> {
        for (u in others(c, me)) ghostNumber.find(u)?.let { return listOf("+" + it.groupValues[1]) }
        val name = Names.stripTag(c.name).trim()
        if (Names.isPhone(name)) return listOf(normalize(name)).filter { it.isNotEmpty() }
        val seen = HashSet<String>(); val out = ArrayList<String>()
        for ((num, n) in contacts) {
            if (!n.trim().equals(name, ignoreCase = true)) continue
            val v = normalize(num); val key = v.filter { it.isDigit() }.takeLast(10)
            if (v.isNotEmpty() && seen.add(key)) out.add(v)
        }
        return out
    }
    fun numberFor(c: ChatState, me: String, contacts: List<Pair<String, String>>): String = numbersFor(c, me, contacts).firstOrNull().orEmpty()

    fun messengerId(c: ChatState, me: String): String { for (u in others(c, me)) ghostMessenger.find(u)?.let { return it.groupValues[1] }; return "" }

    private fun view(url: String) = Intent(Intent.ACTION_VIEW, url.toUri()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    /** The ways that need nothing from the phone's contacts. */
    fun options(c: ChatState, me: String, contacts: List<Pair<String, String>>): List<Option> {
        if (c.isGroup || c.network == "matrix") return emptyList()
        val numbers = numbersFor(c, me, contacts); val number = numbers.firstOrNull().orEmpty()
        val international = number.startsWith("+")
        val out = ArrayList<Option>()
        if (c.network == "whatsapp" && international) out.add(Option("whatsapp", "Open in WhatsApp (then tap the call button)") { view("https://wa.me/${number.drop(1)}") })
        if (c.network == "signal" && international) out.add(Option("signal", "Open in Signal (then tap the call button)") { view("https://signal.me/#p/$number") })
        if (c.network == "messenger") messengerId(c, me).takeIf { it.isNotEmpty() }?.let { id -> out.add(Option("messenger", "Open in Messenger (then tap the call button)") { view("https://www.messenger.com/t/$id") }) }
        for (n in numbers) out.add(Option("phone-$n", "Call $n with your phone") { Intent(Intent.ACTION_DIAL, "tel:$n".toUri()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) })
        return out
    }

    /** One list for a person who has several chats (a merged page): what each of them offers, without repeats. */
    fun optionsFor(chats: List<ChatState>, me: String, contacts: List<Pair<String, String>>): List<Option> {
        val seen = HashSet<String>()
        return chats.flatMap { options(it, me, contacts) }.filter { seen.add(it.id) }
    }

    /**
     * WhatsApp and Signal add "voice call" and "video call" entries to a contact in the phone's address book. Opening one starts that call at once.
     * Only found for people who are in your contacts, and only once the phone has allowed Pager to read them; otherwise the list is empty and the chat links above are used.
     */
    fun directCalls(context: Context, number: String): List<Option> {
        if (number.isEmpty() || !Names.hasDevicePermission(context)) return emptyList()
        return runCatching {
            val cr = context.contentResolver
            val lookup = Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(number))
            val ids = cr.query(lookup, arrayOf(ContactsContract.PhoneLookup.CONTACT_ID), null, null, null)?.use { c -> generateSequence { if (c.moveToNext()) c.getLong(0) else null }.toList() }.orEmpty()
            val out = ArrayList<Option>()
            for (id in ids.distinct()) {
                val sel = "${ContactsContract.Data.CONTACT_ID}=? AND (${ContactsContract.Data.MIMETYPE} LIKE ? OR ${ContactsContract.Data.MIMETYPE} LIKE ?)"
                cr.query(ContactsContract.Data.CONTENT_URI, arrayOf(ContactsContract.Data._ID, ContactsContract.Data.MIMETYPE), sel, arrayOf(id.toString(), "%com.whatsapp.%call%", "%org.thoughtcrime.securesms.%call%"), null)?.use { c ->
                    while (c.moveToNext()) {
                        val dataId = c.getLong(0); val mime = c.getString(1).orEmpty()
                        val app = if (mime.contains("whatsapp")) "WhatsApp" else "Signal"
                        val video = mime.contains("video", ignoreCase = true)
                        out.add(Option("direct-$dataId", (if (video) "Video call" else "Voice call") + " in $app") {
                            Intent(Intent.ACTION_VIEW).setDataAndType(ContactsContract.Data.CONTENT_URI.buildUpon().appendPath(dataId.toString()).build(), mime).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        })
                    }
                }
            }
            out.sortedBy { if (it.label.startsWith("Voice")) 0 else 1 }
        }.getOrDefault(emptyList())
    }

    fun launch(context: Context, o: Option) { runCatching { context.startActivity(o.intent()) } }
}

/** The phone icon in a one-to-one chat's top bar; nothing when there is no way to call this person. Merged pages offer what all of their chats offer. */
@Composable
fun CallButton(chats: List<ChatState>, me: String) {
    val context = LocalContext.current
    val bookVersion by Names.version.collectAsState()
    val ids = chats.map { it.id }
    // The contacts as they are now (not as they were when this page first drew), plus any the phone lists under the chat's name that have not been read in yet.
    var fromPhone by remember(ids) { mutableStateOf(emptyList<Pair<String, String>>()) }
    LaunchedEffect(ids, bookVersion) { fromPhone = withContext(Dispatchers.IO) { chats.flatMap { c -> Names.numbersForName(context, Names.stripTag(c.name)).map { it to Names.stripTag(c.name) } } } }
    val contacts = remember(ids, bookVersion, fromPhone) { Names.ownContacts() + fromPhone }
    val plain = remember(chats, contacts) { CallOut.optionsFor(chats, me, contacts) }
    var direct by remember(ids) { mutableStateOf(emptyList<CallOut.Option>()) }
    LaunchedEffect(chats, contacts) {
        val numbers = chats.filter { it.network == "whatsapp" || it.network == "signal" }.flatMap { CallOut.numbersFor(it, me, contacts) }.distinct()
        direct = withContext(Dispatchers.IO) { numbers.flatMap { CallOut.directCalls(context, it) } }.distinctBy { it.id }
    }
    val all = direct + plain
    if (all.isEmpty()) return
    var open by remember { mutableStateOf(false) }
    Row {
        IconBtn(Icons.Rounded.Call, "Call", { if (all.size == 1) CallOut.launch(context, all[0]) else open = true })
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            all.forEach { o -> DropdownMenuItem(text = { Text(o.label) }, onClick = { open = false; CallOut.launch(context, o) }) }
        }
    }
}
