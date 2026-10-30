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
import app.pager.android.ChatSummary
import app.pager.android.Driving
import app.pager.android.networkMeta

private fun CarContext.limit(max: Int) = runCatching { getCarService(ConstraintManager::class.java).getContentLimit(ConstraintManager.CONTENT_LIMIT_TYPE_LIST) }.getOrDefault(6).coerceIn(1, max)

/** The extras: start a conversation, answer with a ready-made reply, and switch the driving auto-reply. */
class CarMoreScreen(carContext: CarContext) : Screen(carContext) {
    private val modes = listOf("off" to "Off", "car" to "On")
    override fun onGetTemplate(): Template {
        val s = carContext.store.settings
        val mode = if (s.value.drivingReply == "off") "off" else "car"
        val list = ItemList.Builder()
            .addItem(Row.Builder().setTitle("New conversation").addText("Pick someone, then answer by voice").setOnClickListener { screenManager.push(CarNewChatScreen(carContext)) }.build())
            .addItem(Row.Builder().setTitle("Quick reply").addText("Answer a chat with a ready-made message").setOnClickListener { screenManager.push(CarQuickChatScreen(carContext)) }.build())
            .addItem(Row.Builder().setTitle("Driving auto-reply: " + modes.first { it.first == mode }.second).addText("Tap to switch. “" + s.value.drivingReplyText.take(60) + "”")
                .setOnClickListener {
                    val next = modes[(modes.indexOfFirst { it.first == mode } + 1) % modes.size]
                    s.update { copy(drivingReply = next.first) }
                    CarToast.makeText(carContext, "Driving auto-reply: ${next.second}", CarToast.LENGTH_SHORT).show()
                    invalidate()
                }.build())
        return ListTemplate.Builder().setHeader(Header.Builder().setStartHeaderAction(Action.BACK).setTitle("More").build()).setSingleList(list.build()).build()
    }
}

/** Quick reply, step 1: which chat. The chats waiting for an answer come first. */
class CarQuickChatScreen(carContext: CarContext) : Screen(carContext) {
    override fun onGetTemplate(): Template {
        val chats = carContext.store.inbox.value.filter { !it.archived }
            .sortedWith(compareByDescending<ChatSummary> { it.unanswered || it.unread > 0 }.thenByDescending { it.ts }).take(carContext.limit(12))
        val list = ItemList.Builder().setNoItemsMessage("No chats yet")
        for (c in chats) list.addItem(
            Row.Builder().setTitle(c.name).addText(if (c.network == "matrix") c.preview.take(80) else networkMeta(c.network).label + " · " + c.preview.take(70))
                .setOnClickListener { screenManager.push(CarQuickTextScreen(carContext, c.id, c.name)) }.build(),
        )
        return ListTemplate.Builder().setHeader(Header.Builder().setStartHeaderAction(Action.BACK).setTitle("Quick reply to…").build()).setSingleList(list.build()).build()
    }
}

/** Quick reply, step 2: which message. Sends it and goes back to the list. */
class CarQuickTextScreen(carContext: CarContext, private val room: String, private val name: String) : Screen(carContext) {
    override fun onGetTemplate(): Template {
        val replies = Driving.quickReplies(carContext.store.settings.value)
        val list = ItemList.Builder().setNoItemsMessage("Add quick replies in Pager: Settings, Notifications, Driving")
        for (r in replies) list.addItem(Row.Builder().setTitle(r).setOnClickListener {
            carContext.store.send(room, r); carContext.store.markRead(room)
            CarToast.makeText(carContext, "Sent to $name", CarToast.LENGTH_SHORT).show()
            screenManager.popToRoot()
        }.build())
        return ListTemplate.Builder().setHeader(Header.Builder().setStartHeaderAction(Action.BACK).setTitle("Say to $name").build()).setSingleList(list.build()).build()
    }
}
