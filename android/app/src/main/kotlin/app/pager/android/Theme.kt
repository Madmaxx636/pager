package app.pager.android

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

data class NetworkMeta(val label: String, val color: Color, val glyph: String)

private val networks = mapOf(
    "whatsapp" to NetworkMeta("WhatsApp", Color(0xFF25D366), "W"),
    "signal" to NetworkMeta("Signal", Color(0xFF3A76F0), "S"),
    "discord" to NetworkMeta("Discord", Color(0xFF5865F2), "D"),
    "telegram" to NetworkMeta("Telegram", Color(0xFF2AABEE), "T"),
    "instagram" to NetworkMeta("Instagram", Color(0xFFE1306C), "I"),
    "messenger" to NetworkMeta("Messenger", Color(0xFF0A7CFF), "M"),
    "gmessages" to NetworkMeta("Messages", Color(0xFF1A73E8), "G"),
    "matrix" to NetworkMeta("Matrix", Color(0xFF8A94A6), "#"),
)

fun networkMeta(id: String) = networks[id] ?: NetworkMeta(id, Color(0xFF8A94A6), id.take(1).uppercase())

private val Dark = darkColorScheme(
    primary = Color(0xFF2DD4BF), onPrimary = Color(0xFF04201C),
    primaryContainer = Color(0xFF14B8A6), onPrimaryContainer = Color(0xFF031A17),
    background = Color(0xFF0B0E13), onBackground = Color(0xFFE8ECF2),
    surface = Color(0xFF12161D), onSurface = Color(0xFFE8ECF2),
    surfaceVariant = Color(0xFF1E2530), onSurfaceVariant = Color(0xFF8B95A5),
    error = Color(0xFFFF7B7B),
)
private val Light = lightColorScheme(
    primary = Color(0xFF0D9488), onPrimary = Color.White,
    primaryContainer = Color(0xFF0D9488), onPrimaryContainer = Color.White,
    background = Color(0xFFF6F7F9), onBackground = Color(0xFF14181F),
    surface = Color.White, onSurface = Color(0xFF14181F),
    surfaceVariant = Color(0xFFECEFF4), onSurfaceVariant = Color(0xFF667085),
    error = Color(0xFFC62828),
)

@Composable
fun PagerTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) Dark else Light, content = content)
}
