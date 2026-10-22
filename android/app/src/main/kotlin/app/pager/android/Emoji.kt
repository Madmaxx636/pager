package app.pager.android

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import androidx.compose.runtime.produceState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import kotlinx.coroutines.launch

/** Emoji for the reaction picker, grouped like every messenger does. */
val EMOJI_CATEGORIES: List<Pair<String, List<String>>> = listOf(
    "😀" to ("😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 ☺️ 😚 😙 🥲 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 ☹️ 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👹 👺 👻 👽 🤖 😺 😸 😹 😻 😼 😽 🙀 😿 😾").split(" "),
    "👋" to ("👍 👎 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐 🖖 👋 🤝 🙏 ✍️ 💪 🦾 🙌 👏 🤲 🫶 🫡 🫠 🫣 🫢 🫰 🫵 💅 🤳 🙋 🙆 🙅 🤷 🤦 🙇 💁 🧏").split(" "),
    "❤️" to ("❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ♥️ 💋 💯 💢 💥 💫 💦 💨 🕳 💬 💭 💤 ✨ 🌟 ⭐ 🔥 🎉 🎊").split(" "),
    "🐶" to ("🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐜 🐢 🐍 🦎 🐙 🦑 🦀 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐘 🦒 🦘 🐕 🐈 🌵 🌲 🌳 🌴 🌱 🌿 ☘️ 🍀 🍁 🍂 🍃 🌸 🌼 🌻 🌹 🥀 🌷 💐 🌈 ☀️ 🌤 ⛅ ☁️ 🌧 ⛈ ❄️ ⛄ 🌊").split(" "),
    "🍕" to ("🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🍆 🥔 🥕 🌽 🌶 🥒 🥦 🍄 🥜 🍞 🥐 🥖 🧀 🍳 🥞 🥓 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🥗 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🍤 🍙 🍚 🍘 🍦 🍧 🍨 🍩 🍪 🎂 🍰 🧁 🍫 🍬 🍭 🍮 ☕ 🍵 🥤 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🍾").split(" "),
    "⚽" to ("⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 🥊 🥋 ⛳ 🎣 🎽 🎿 🛷 🎯 🎮 🕹 🎲 🧩 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🎻 🏆 🥇 🥈 🥉 🏅 🎖").split(" "),
    "🚗" to ("🚗 🚕 🚙 🚌 🚎 🏎 🚓 🚑 🚒 🚚 🚜 🛵 🏍 🚲 ✈️ 🚀 🛸 🚁 ⛵ 🚤 🚢 🏠 🏡 🏢 🏰 🗼 🗽 ⛪ 🕌 🌋 🏖 🏝 ⛺ 🌅 🌄 🌃 🌉 🌍 🗺").split(" "),
    "💡" to ("⌚ 📱 💻 ⌨️ 🖥 📷 📸 📹 🎥 📞 ☎️ 📺 📻 🔋 🔌 💡 🔦 💰 💳 💎 🔧 🔨 ⚙️ 🔒 🔓 🔑 🛒 📦 📫 📝 📚 📖 📅 📌 📎 ✂️ 🗑 🎁 🎈 🕯 🧸 🪄").split(" "),
    "✅" to ("✅ ❌ ❎ ✔️ ➕ ➖ ➗ ✖️ ❓ ❗ ‼️ ⁉️ ⚠️ 🚫 ⛔ 📵 🔞 💲 ♻️ ⭕ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🔺 🔻 🔶 🔷 ➡️ ⬅️ ⬆️ ⬇️ ↩️ ↪️ 🔄 🔁 ▶️ ⏸ ⏹ ⏺ 🔊 🔇 🔔 🔕 🏳️ 🏴 🚩").split(" "),
)

/** A reaction chooser: your recent picks first, then every category. Calls back with the chosen emoji. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun EmojiPickerDialog(recent: List<String>, onPick: (String) -> Unit, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    val grid = rememberLazyGridState()
    var tab by remember { mutableIntStateOf(0) }
    val tabs = remember(recent) { (if (recent.isNotEmpty()) listOf("🕘" to recent) else emptyList()) + EMOJI_CATEGORIES }
    // Where each tab's header lands in the flat grid.
    val offsets = remember(tabs) { var at = 0; tabs.map { (_, list) -> at.also { at += 1 + list.size } } }

    var query by remember { mutableStateOf("") }
    val context = androidx.compose.ui.platform.LocalContext.current
    val found by produceState(emptyList<String>(), query) { value = if (query.isBlank()) emptyList() else withContext(Dispatchers.Default) { EmojiSearch.search(context, query) } }
    Dialog(onDismissRequest = onDismiss) {
        Surface(Modifier.einkFilter(LocalSettings.current.eink), shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surface) {
            Column(Modifier.height(480.dp)) {
                androidx.compose.material3.OutlinedTextField(
                    value = query, onValueChange = { query = it }, singleLine = true, placeholder = { Text("Search emoji: fire, heart, laugh…") },
                    shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 8.dp),
                )
                if (query.isNotBlank()) {
                    if (found.isEmpty()) Text("No emoji match \u201c${query.trim()}\u201d.", Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    LazyVerticalGrid(GridCells.Adaptive(52.dp), modifier = Modifier.padding(horizontal = 8.dp)) {
                        items(found) { e -> Box(Modifier.height(52.dp).clip(RoundedCornerShape(10.dp)).dpadFocus().clickable { onPick(e) }, contentAlignment = Alignment.Center) { Text(e, fontSize = 32.sp) } }
                    }
                    return@Column
                }
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    tabs.forEachIndexed { i, (icon, _) ->
                        Box(
                            Modifier.clip(CircleShape).background(if (i == tab) MaterialTheme.colorScheme.primary.copy(alpha = 0.2f) else androidx.compose.ui.graphics.Color.Transparent)
                                .dpadFocus().clickable { tab = i; scope.launch { grid.animateScrollToItem(offsets[i]) } }.padding(6.dp),
                            contentAlignment = Alignment.Center,
                        ) { Text(icon, fontSize = 22.sp) }
                    }
                }
                LazyVerticalGrid(GridCells.Adaptive(52.dp), state = grid, modifier = Modifier.padding(horizontal = 8.dp)) {
                    tabs.forEach { (icon, list) ->
                        item(span = { GridItemSpan(maxLineSpan) }) {
                            Text(
                                when (icon) { "🕘" -> "Recent"; "😀" -> "Smileys"; "👋" -> "People"; "❤️" -> "Hearts & more"; "🐶" -> "Nature"; "🍕" -> "Food"; "⚽" -> "Activities"; "🚗" -> "Travel"; "💡" -> "Objects"; else -> "Symbols" },
                                fontWeight = FontWeight.SemiBold, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(start = 6.dp, top = 10.dp, bottom = 4.dp),
                            )
                        }
                        items(list) { e ->
                            Box(Modifier.height(52.dp).clip(RoundedCornerShape(10.dp)).dpadFocus().clickable { onPick(e) }, contentAlignment = Alignment.Center) { Text(e, fontSize = 32.sp) }
                        }
                    }
                }
            }
        }
    }
}
