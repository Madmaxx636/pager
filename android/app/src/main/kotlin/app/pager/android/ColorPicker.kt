package app.pager.android

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import kotlin.math.atan2
import kotlin.math.hypot
import kotlin.math.min

/** "Make your own" accent: drag on the wheel (colour and richness), slide for brightness, or type the colour code. */
@Composable
fun ColorPickerDialog(initial: Color, onDismiss: () -> Unit, onPick: (Color) -> Unit) {
    val hsv0 = remember { FloatArray(3).also { android.graphics.Color.colorToHSV(initial.toArgb(), it) } }
    var hue by remember { mutableFloatStateOf(hsv0[0]) }
    var sat by remember { mutableFloatStateOf(hsv0[1]) }
    var value by remember { mutableFloatStateOf(hsv0[2].coerceAtLeast(0.15f)) }
    val current = Color(android.graphics.Color.HSVToColor(floatArrayOf(hue, sat, value)))
    var hex by remember { mutableStateOf(current.toHex()) }
    var typing by remember { mutableStateOf(false) }

    fun pick(pos: Offset, size: androidx.compose.ui.unit.IntSize) {
        val c = Offset(size.width / 2f, size.height / 2f)
        val r = min(c.x, c.y)
        val dx = pos.x - c.x; val dy = pos.y - c.y
        hue = ((Math.toDegrees(atan2(dy, dx).toDouble()) + 360) % 360).toFloat()
        sat = (hypot(dx, dy) / r).coerceIn(0f, 1f)
        typing = false; hex = Color(android.graphics.Color.HSVToColor(floatArrayOf(hue, sat, value))).toHex()
    }

    AlertDialog(
        onDismissRequest = onDismiss, title = { Text("Make your own") },
        text = {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                var wheelSize by remember { mutableStateOf(androidx.compose.ui.unit.IntSize.Zero) }
                Canvas(
                    Modifier.size(230.dp)
                        .pointerInput(Unit) { detectDragGestures(onDragStart = { pick(it, size) }) { change, _ -> change.consume(); pick(change.position, size) } }
                        .pointerInput(Unit) { detectTapGestures { pick(it, size) } },
                ) {
                    wheelSize = androidx.compose.ui.unit.IntSize(size.width.toInt(), size.height.toInt())
                    val r = min(size.width, size.height) / 2f
                    val hues = (0..12).map { Color(android.graphics.Color.HSVToColor(floatArrayOf(it * 30f, 1f, value))) }
                    drawCircle(Brush.sweepGradient(hues, center), radius = r, center = center)
                    drawCircle(Brush.radialGradient(listOf(Color.hsv(0f, 0f, value), Color.Transparent), center = center, radius = r), radius = r, center = center)
                    val a = Math.toRadians(hue.toDouble())
                    val p = Offset(center.x + (kotlin.math.cos(a) * sat * r).toFloat(), center.y + (kotlin.math.sin(a) * sat * r).toFloat())
                    drawCircle(Color.White, 13.dp.toPx(), p, style = Stroke(3.dp.toPx()))
                    drawCircle(current, 10.dp.toPx(), p)
                }
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Dark", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Slider(value, { value = it; if (!typing) hex = Color(android.graphics.Color.HSVToColor(floatArrayOf(hue, sat, it))).toHex() }, valueRange = 0.15f..1f, modifier = Modifier.weight(1f).padding(horizontal = 8.dp))
                    Text("Light", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(Modifier.size(48.dp).clip(CircleShape).background(current).border(1.dp, MaterialTheme.colorScheme.outline, CircleShape))
                    OutlinedTextField(
                        hex, {
                            hex = it.uppercase(); typing = true
                            parseHex(it)?.let { c ->
                                val f = FloatArray(3); android.graphics.Color.colorToHSV(c.toArgb(), f)
                                hue = f[0]; sat = f[1]; value = f[2].coerceAtLeast(0.15f)
                            }
                        },
                        label = { Text("Colour code") }, singleLine = true, isError = parseHex(hex) == null, modifier = Modifier.width(150.dp),
                    )
                }
            }
        },
        confirmButton = { TextButton(enabled = parseHex(hex) != null || !typing, onClick = { onPick(if (typing) parseHex(hex) ?: current else current) }) { Text("Use this colour") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
