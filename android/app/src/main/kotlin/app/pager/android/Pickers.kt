@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package app.pager.android

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Label
import androidx.compose.material.icons.rounded.AccessTime
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.DarkMode
import androidx.compose.material.icons.rounded.Today
import androidx.compose.material.icons.rounded.WbSunny
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import java.util.Calendar

/** Presets for "snooze", "remind me" and "send later". */
fun timePresets(): List<Pair<String, Long>> {
    val now = System.currentTimeMillis()
    fun at(daysAhead: Int, hour: Int) = Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, daysAhead); set(Calendar.HOUR_OF_DAY, hour); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0) }.timeInMillis
    val list = mutableListOf("In 1 minute" to now + 60_000L, "In 1 hour" to now + 3_600_000L, "In 3 hours" to now + 3 * 3_600_000L)
    if (at(0, 20) > now + 600_000L) list += "This evening (8 PM)" to at(0, 20)
    list += "Tomorrow morning (9 AM)" to at(1, 9)
    list += "Next week (Mon 9 AM)" to Calendar.getInstance().apply {
        val d = (Calendar.MONDAY - get(Calendar.DAY_OF_WEEK) + 7) % 7; add(Calendar.DAY_OF_YEAR, if (d == 0) 7 else d)
        set(Calendar.HOUR_OF_DAY, 9); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0)
    }.timeInMillis
    return list
}

/** Pick a moment: quick presets, or a specific date and time. */
@Composable
fun WhenSheet(title: String, onPick: (Long) -> Unit, onDismiss: () -> Unit) {
    var custom by remember { mutableStateOf(false) }
    Sheet(onDismiss) {
        SheetTitle(title)
        timePresets().forEach { (label, at) ->
            SheetItem(if (label.startsWith("This evening")) Icons.Rounded.DarkMode else if (label.startsWith("Tomorrow")) Icons.Rounded.WbSunny else if (label.startsWith("Next")) Icons.Rounded.CalendarMonth else Icons.Rounded.AccessTime, label, { onPick(at) })
        }
        SheetItem(Icons.Rounded.Today, "Pick date & time…", { custom = true })
    }
    if (custom) CustomTimeDialog(onPick = { onPick(it) }, onDismiss = { custom = false })
}

@Composable
private fun CustomTimeDialog(onPick: (Long) -> Unit, onDismiss: () -> Unit) {
    var step by remember { mutableStateOf(0) }
    val date = rememberDatePickerState(initialSelectedDateMillis = System.currentTimeMillis())
    val cal = Calendar.getInstance().apply { add(Calendar.HOUR_OF_DAY, 1) }
    val time = rememberTimePickerState(cal.get(Calendar.HOUR_OF_DAY), 0, is24Hour = false)
    if (step == 0) DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = { TextButton(enabled = date.selectedDateMillis != null, onClick = { step = 1 }) { Text("Next") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    ) { DatePicker(date) }
    else AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = {
                val utc = date.selectedDateMillis ?: System.currentTimeMillis()
                // The date picker reports UTC midnight; rebuild it as a local date.
                val u = Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC")).apply { timeInMillis = utc }
                val local = Calendar.getInstance().apply { set(u.get(Calendar.YEAR), u.get(Calendar.MONTH), u.get(Calendar.DAY_OF_MONTH), time.hour, time.minute, 0); set(Calendar.MILLISECOND, 0) }
                onPick(local.timeInMillis.coerceAtLeast(System.currentTimeMillis() + 30_000))
            }) { Text("Set") }
        },
        dismissButton = { TextButton(onClick = { step = 0 }) { Text("Back") } },
        text = { TimePicker(time) },
    )
}

/** Add or remove labels on one chat, or make a new one. */
@Composable
fun LabelSheet(roomIds: List<String>, onDismiss: () -> Unit) {
    val store = LocalStore.current
    val labels by store.labels.collectAsState()
    val chats by store.chats.collectAsState()
    var creating by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    fun has(label: String) = roomIds.all { id -> chats[id]?.let { label in it.labels } == true }
    Sheet(onDismiss) {
        SheetTitle("Labels")
        labels.forEach { label ->
            Row(Modifier.fillMaxWidth().clickable { roomIds.forEach { id -> if (has(label)) store.removeLabel(id, label) else store.addLabel(id, label) } }.padding(horizontal = 24.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.AutoMirrored.Rounded.Label, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.width(20.dp))
                Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
                if (has(label)) Icon(Icons.Rounded.Check, null, tint = MaterialTheme.colorScheme.primary)
            }
        }
        SheetItem(Icons.Rounded.Add, "New label…", { creating = true })
    }
    if (creating) AlertDialog(
        onDismissRequest = { creating = false }, title = { Text("New label") },
        text = { OutlinedTextField(name, { name = it }, singleLine = true, placeholder = { Text("Work, Family, Travel…") }) },
        confirmButton = { TextButton(enabled = name.isNotBlank(), onClick = { roomIds.forEach { store.addLabel(it, name.trim()) }; creating = false; name = "" }) { Text("Create") } },
        dismissButton = { TextButton(onClick = { creating = false }) { Text("Cancel") } },
    )
}

/** Mute for a while, or forever. */
@Composable
fun MuteSheet(title: String, onPick: (Long?) -> Unit, onDismiss: () -> Unit) {
    Sheet(onDismiss) {
        SheetTitle(title)
        listOf("For 1 hour" to 3_600_000L, "For 8 hours" to 8 * 3_600_000L, "For 1 week" to 7 * 86_400_000L, "Until I turn it back on" to null).forEach { (label, ms) ->
            SheetItem(Icons.Rounded.AccessTime, label, { onPick(ms) })
        }
    }
}
