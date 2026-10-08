package app.pager.android

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp

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

/** Accent choices: (dark-theme tone, light-theme tone, on-color for dark, on-color for light). */
val ACCENTS: Map<String, List<Color>> = mapOf(
    "teal" to listOf(Color(0xFF2DD4BF), Color(0xFF0D9488), Color(0xFF04201C), Color.White),
    "blue" to listOf(Color(0xFF60A5FA), Color(0xFF2563EB), Color(0xFF061A38), Color.White),
    "purple" to listOf(Color(0xFFC4A1FF), Color(0xFF7C3AED), Color(0xFF1E0B3D), Color.White),
    "pink" to listOf(Color(0xFFF9A8D4), Color(0xFFDB2777), Color(0xFF3B0A23), Color.White),
    "orange" to listOf(Color(0xFFFDBA74), Color(0xFFEA580C), Color(0xFF3A1A04), Color.White),
    "green" to listOf(Color(0xFF86EFAC), Color(0xFF16A34A), Color(0xFF062B12), Color.White),
    "red" to listOf(Color(0xFFFCA5A5), Color(0xFFDC2626), Color(0xFF3B0A0A), Color.White),
)

private fun scheme(dark: Boolean, black: Boolean, accent: String): ColorScheme {
    val a = ACCENTS[accent] ?: ACCENTS.getValue("teal")
    val primary = if (dark) a[0] else a[1]
    val on = if (dark) a[2] else a[3]
    return if (dark) darkColorScheme(
        primary = primary, onPrimary = on, primaryContainer = if (black) primary.copy(alpha = 0.85f) else primary.copy(alpha = 0.9f), onPrimaryContainer = on,
        background = if (black) Color.Black else Color(0xFF0B0E13), onBackground = Color(0xFFE8ECF2),
        surface = if (black) Color(0xFF0A0A0A) else Color(0xFF12161D), onSurface = Color(0xFFE8ECF2),
        surfaceVariant = if (black) Color(0xFF1A1A1A) else Color(0xFF1E2530), onSurfaceVariant = Color(0xFF8B95A5),
        error = Color(0xFFFF7B7B),
    ) else lightColorScheme(
        primary = primary, onPrimary = on, primaryContainer = primary, onPrimaryContainer = on,
        background = Color(0xFFF6F7F9), onBackground = Color(0xFF14181F),
        surface = Color.White, onSurface = Color(0xFF14181F),
        surfaceVariant = Color(0xFFECEFF4), onSurfaceVariant = Color(0xFF667085),
        error = Color(0xFFC62828),
    )
}

/** Looks up the live settings anywhere in the UI. */
val LocalSettings = staticCompositionLocalOf { AppSettings() }

fun bubbleShape(style: String) = when (style) {
    "square" -> RoundedCornerShape(6.dp)
    "soft" -> RoundedCornerShape(26.dp)
    else -> RoundedCornerShape(18.dp)
}

fun wallpaperBrush(name: String, dark: Boolean): Brush? = when (name) {
    "dusk" -> Brush.verticalGradient(if (dark) listOf(Color(0xFF1B1530), Color(0xFF0B0E13)) else listOf(Color(0xFFE9E1FA), Color(0xFFF6F7F9)))
    "forest" -> Brush.verticalGradient(if (dark) listOf(Color(0xFF0E2219), Color(0xFF0B0E13)) else listOf(Color(0xFFDCEFE3), Color(0xFFF6F7F9)))
    "ocean" -> Brush.verticalGradient(if (dark) listOf(Color(0xFF0A1F33), Color(0xFF0B0E13)) else listOf(Color(0xFFD9ECFA), Color(0xFFF6F7F9)))
    "sand" -> Brush.verticalGradient(if (dark) listOf(Color(0xFF2A2116), Color(0xFF0B0E13)) else listOf(Color(0xFFF5EBDA), Color(0xFFF6F7F9)))
    "graphite" -> Brush.verticalGradient(if (dark) listOf(Color(0xFF1C1F24), Color(0xFF0B0E13)) else listOf(Color(0xFFE3E6EA), Color(0xFFF6F7F9)))
    else -> null
}

@Composable
fun isDarkTheme(s: AppSettings) = when (s.themeMode) { "light" -> false; "dark", "black" -> true; else -> isSystemInDarkTheme() }

@Composable
fun PagerTheme(settings: AppSettings, content: @Composable () -> Unit) {
    val dark = isDarkTheme(settings)
    val context = LocalContext.current
    val colors = if (settings.accent == "dynamic" && Build.VERSION.SDK_INT >= 31) {
        if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
    } else scheme(dark, settings.themeMode == "black", settings.accent)
    val base = LocalDensity.current
    CompositionLocalProvider(
        LocalSettings provides settings,
        LocalDensity provides Density(base.density, base.fontScale * settings.fontScale),
    ) { MaterialTheme(colorScheme = colors, content = content) }
}
