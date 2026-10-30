package app.pager.android.car

import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.constraints.ConstraintManager
import androidx.car.app.messaging.model.CarMessage
import androidx.car.app.messaging.model.ConversationCallback
import androidx.car.app.messaging.model.ConversationItem
import androidx.car.app.model.Action
import androidx.car.app.model.ActionStrip
import androidx.car.app.model.CarText
import androidx.car.app.model.Header
import androidx.car.app.model.ItemList
import androidx.car.app.model.ListTemplate
import androidx.car.app.model.Template
import androidx.core.app.Person
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import app.pager.android.ChatState
import app.pager.android.ChatSummary
import app.pager.android.Msg
import app.pager.android.PagerApp
import app.pager.android.networkMeta
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

internal val CarContext.store get() = (applicationContext as PagerApp).store

/** What a message says when you only hear it: words as they are, and "Photo", "Voice message"... for the rest. */
internal fun spoken(m: Msg): String {
    val t = m.body.trim()
    return when {
        m.voice -> "Voice message"
        m.sticker -> "Sticker"
        m.type == "m.image" -> if (!m.caption.isNullOrBlank()) "Photo: ${m.caption}" else "Photo"
        m.type == "m.video" -> if (!m.caption.isNullOrBlank()) "Video: ${m.caption}" else "Video"
        m.type == "m.audio" -> "Audio message"
        m.type == "m.file" -> "File: $t"
        m.geo != null -> "Location"
        m.poll != null -> "Poll"
        else -> t
    }.take(400).ifEmpty { "Message" }
}

/** Your chats, newest and unread first. Reply by voice and mark-as-read are the car's own buttons on each chat. */
class CarChatListScreen(carContext: CarContext) : Screen(carContext) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var chats: List<ChatSummary> = emptyList()
    private var states: Map<String, ChatState> = emptyMap()

    init {
        lifecycle.addObserver(object : DefaultLifecycleObserver { override fun onDestroy(owner: LifecycleOwner) { scope.cancel() } })
        scope.launch {
            // The car wants a screen to change no more than every half second.
            combine(carContext.store.inbox, carContext.store.chats) { a, b -> a to b }.collect { (inbox, all) ->
                chats = inbox; states = all; invalidate(); delay(600)
            }
        }
    }

    private fun limit(): Int = runCatching {
        carContext.getCarService(ConstraintManager::class.java).getContentLimit(ConstraintManager.CONTENT_LIMIT_TYPE_LIST)
    }.getOrDefault(6).coerceIn(1, 20)

    override fun onGetTemplate(): Template {
        val store = carContext.store
        val me = Person.Builder().setName("Me").setKey("self_id").build()
        val shown = chats.filter { !it.archived && !it.muted }
            .sortedWith(compareByDescending<ChatSummary> { it.unread > 0 || it.markedUnread }.thenByDescending { it.pinned }.thenByDescending { it.ts })
            .take(limit())
        val list = ItemList.Builder().setNoItemsMessage("No chats yet")
        for (c in shown) {
            val st = states[c.id]
            val recent = st?.messages?.takeLast(5).orEmpty()
            val unreadFrom = recent.size - c.unread.coerceAtMost(recent.size)
            val messages = recent.mapIndexed { i, m ->
                val mine = m.sender == store.session.value?.userId
                CarMessage.Builder()
                    .setSender(if (mine) me else Person.Builder().setName(st?.members?.get(m.sender) ?: c.name).setKey(m.sender).build())
                    .setBody(CarText.create(spoken(m)))
                    .setReceivedTimeEpochMillis(m.ts)
                    .setRead(mine || i < unreadFrom)
                    .build()
            }.ifEmpty { listOf(CarMessage.Builder().setSender(Person.Builder().setName(c.name).setKey(c.id).build()).setBody(CarText.create("No messages yet")).setReceivedTimeEpochMillis(System.currentTimeMillis()).setRead(true).build()) }
            val callback = object : ConversationCallback {
                override fun onMarkAsRead() { store.markRead(c.id) }
                override fun onTextReply(replyText: String) { if (replyText.isNotBlank()) { store.send(c.id, replyText.trim()); store.markRead(c.id) } }
            }
            list.addItem(
                ConversationItem.Builder(c.id, CarText.create(if (c.network == "matrix") c.name else "${c.name} · ${networkMeta(c.network).label}"), me, messages, callback)
                    .setGroupConversation(c.isGroup)
                    .build(),
            )
        }
        return ListTemplate.Builder()
            .setHeader(Header.Builder().setStartHeaderAction(Action.APP_ICON).setTitle("Pager").build())
            .setSingleList(list.build())
            .setActionStrip(ActionStrip.Builder().addAction(Action.Builder().setTitle("New").setOnClickListener { screenManager.push(CarNewChatScreen(carContext)) }.build()).build())
            .build()
    }
}
