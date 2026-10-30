package app.pager.android.car

import androidx.car.app.CarContext
import androidx.car.app.CarToast
import androidx.car.app.Screen
import androidx.car.app.constraints.ConstraintManager
import androidx.car.app.model.Action
import androidx.car.app.model.Header
import androidx.car.app.model.ItemList
import androidx.car.app.model.ListTemplate
import androidx.car.app.model.Row
import androidx.car.app.model.Template
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import app.pager.android.Contact
import app.pager.android.Names
import app.pager.android.Network
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/** Start a conversation: the people you have on your networks. Pick one, and their chat opens in the list, ready to answer by voice. */
class CarNewChatScreen(carContext: CarContext) : Screen(carContext) {
    private data class Who(val name: String, val net: Network, val login: String?, val contact: Contact)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var people: List<Who>? = null
    private var busy = false

    init {
        lifecycle.addObserver(object : DefaultLifecycleObserver { override fun onDestroy(owner: LifecycleOwner) { scope.cancel() } })
        scope.launch {
            val store = carContext.store
            people = runCatching {
                val nets = store.pager.networks().filter { it.logins.isNotEmpty() }
                val recent = store.inbox.value.filter { !it.isGroup }.map { it.name.lowercase() }.toSet()
                nets.flatMap { n -> n.logins.map { l -> async { runCatching { store.pager.contacts(n.id, l.id) }.getOrDefault(emptyList()).map { c -> Who(Names.pretty(c.name), n, l.id, c) } } } }
                    .awaitAll().flatten().distinctBy { it.name.lowercase() }
                    // People you do not already talk to come first: this screen is for starting something new.
                    .sortedWith(compareBy<Who> { it.name.lowercase() in recent }.thenBy { it.name.lowercase() })
            }.getOrDefault(emptyList())
            invalidate()
        }
    }

    private fun start(w: Who) {
        if (busy) return
        busy = true
        scope.launch {
            runCatching { carContext.store.pager.createDm(w.net.id, w.login, w.contact.id, w.contact.detail) }
                .onSuccess { room ->
                    if (room != null) { CarToast.makeText(carContext, "Chat with ${w.name} is ready: tap it in the list and Reply", CarToast.LENGTH_LONG).show(); screenManager.pop() }
                    else CarToast.makeText(carContext, "Couldn't open that chat", CarToast.LENGTH_LONG).show()
                }
                .onFailure { CarToast.makeText(carContext, "Couldn't open that chat", CarToast.LENGTH_LONG).show() }
            busy = false
        }
    }

    override fun onGetTemplate(): Template {
        val header = Header.Builder().setStartHeaderAction(Action.BACK).setTitle("New conversation").build()
        val all = people ?: return ListTemplate.Builder().setHeader(header).setLoading(true).build()
        val limit = runCatching { carContext.getCarService(ConstraintManager::class.java).getContentLimit(ConstraintManager.CONTENT_LIMIT_TYPE_LIST) }.getOrDefault(6).coerceIn(1, 30)
        val list = ItemList.Builder().setNoItemsMessage("No contacts yet. Connect an account in the Pager app.")
        for (w in all.take(limit)) list.addItem(Row.Builder().setTitle(w.name).addText(w.net.name).setOnClickListener { start(w) }.build())
        return ListTemplate.Builder().setHeader(header).setSingleList(list.build()).build()
    }
}
