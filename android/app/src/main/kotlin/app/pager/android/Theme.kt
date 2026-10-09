package app.pager.android

import androidx.compose.material.icons.rounded.Call
import androidx.compose.material.icons.rounded.ChatBubble
import androidx.compose.material.icons.rounded.Send
import androidx.compose.material.icons.rounded.SportsEsports
import androidx.compose.material.icons.rounded.PhotoCamera
import androidx.compose.material.icons.rounded.Forum
import androidx.compose.material.icons.rounded.Sms
import androidx.compose.material.icons.Icons
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.os.Build
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
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
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.toArgb
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

/** Simple original glyphs for each network (no brand marks). */
fun networkIcon(id: String): androidx.compose.ui.graphics.vector.ImageVector? = when (id) {
    "whatsapp" -> Icons.Rounded.Call
    "signal" -> Icons.Rounded.ChatBubble
    "telegram" -> Icons.Rounded.Send
    "discord" -> Icons.Rounded.SportsEsports
    "instagram" -> Icons.Rounded.PhotoCamera
    "messenger" -> Icons.Rounded.Forum
    "gmessages" -> Icons.Rounded.Sms
    else -> null
}

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

/** Parses "#RRGGBB" (or without the #); null if it isn't a colour. */
fun parseHex(s: String): Color? = runCatching {
    val h = s.trim().removePrefix("#")
    if (h.length != 6) null else Color(0xFF000000L or h.toLong(16))
}.getOrNull()

fun Color.toHex(): String = "#%02X%02X%02X".format((red * 255 + 0.5f).toInt(), (green * 255 + 0.5f).toInt(), (blue * 255 + 0.5f).toInt())

private fun hsl(c: Color): FloatArray = FloatArray(3).also { androidx.core.graphics.ColorUtils.colorToHSL(c.toArgb(), it) }
private fun fromHsl(h: Float, s: Float, l: Float) = Color(androidx.core.graphics.ColorUtils.HSLToColor(floatArrayOf(((h % 360f) + 360f) % 360f, s.coerceIn(0f, 1f), l.coerceIn(0f, 1f))))
private fun onColor(c: Color) = if (c.luminance() > 0.45f) Color(0xFF101418) else Color.White

/** The four tones of an accent: (dark theme, light theme, text on it in dark, text on it in light). A custom colour is adjusted so it stays readable in both. */
fun accentTones(accent: String, custom: String): List<Color> {
    ACCENTS[accent]?.let { return it }
    val base = parseHex(custom) ?: return ACCENTS.getValue("teal")
    val (h, s, l) = hsl(base)
    val dark = fromHsl(h, s, l.coerceAtLeast(0.68f))
    val light = fromHsl(h, s, l.coerceAtMost(0.42f))
    return listOf(dark, light, onColor(dark), onColor(light))
}

/** The accent colours the whole app, not just buttons: backgrounds, cards, chips and selections all take a tint of it. */
private fun scheme(dark: Boolean, black: Boolean, accent: String, custom: String): ColorScheme {
    val a = accentTones(accent, custom)
    val primary = if (dark) a[0] else a[1]
    val on = if (dark) a[2] else a[3]
    val (h, s, l) = hsl(primary)
    val tertiary = fromHsl(h + 40f, s, l)
    fun tint(base: Color, f: Float) = lerp(base, primary, f)
    return if (dark) darkColorScheme(
        primary = primary, onPrimary = on, primaryContainer = if (black) primary.copy(alpha = 0.85f) else primary.copy(alpha = 0.9f), onPrimaryContainer = on,
        secondary = primary, onSecondary = on, secondaryContainer = tint(if (black) Color(0xFF111111) else Color(0xFF1E2530), 0.32f), onSecondaryContainer = Color(0xFFE8ECF2),
        tertiary = tertiary, onTertiary = onColor(tertiary), surfaceTint = primary,
        background = if (black) Color.Black else tint(Color(0xFF0B0E13), 0.07f), onBackground = Color(0xFFE8ECF2),
        surface = if (black) Color(0xFF0A0A0A) else tint(Color(0xFF12161D), 0.07f), onSurface = Color(0xFFE8ECF2),
        surfaceVariant = if (black) tint(Color(0xFF1A1A1A), 0.14f) else tint(Color(0xFF1E2530), 0.18f), onSurfaceVariant = tint(Color(0xFF8B95A5), 0.2f),
        outline = tint(Color(0xFF6B7585), 0.25f), outlineVariant = tint(Color(0xFF2B3340), 0.2f),
        surfaceContainer = if (black) Color(0xFF0E0E0E) else tint(Color(0xFF161B23), 0.1f), surfaceContainerHigh = tint(if (black) Color(0xFF161616) else Color(0xFF1C222C), 0.14f),
        surfaceContainerHighest = tint(if (black) Color(0xFF1C1C1C) else Color(0xFF232A36), 0.18f),
        error = Color(0xFFFF7B7B),
    ) else lightColorScheme(
        primary = primary, onPrimary = on, primaryContainer = primary, onPrimaryContainer = on,
        secondary = primary, onSecondary = on, secondaryContainer = tint(Color.White, 0.22f), onSecondaryContainer = Color(0xFF14181F),
        tertiary = tertiary, onTertiary = onColor(tertiary), surfaceTint = primary,
        background = tint(Color(0xFFF4F6F9), 0.08f), onBackground = Color(0xFF111418),
        surface = tint(Color.White, 0.03f), onSurface = Color(0xFF14181F),
        surfaceVariant = tint(Color(0xFFE9ECF1), 0.16f), onSurfaceVariant = tint(Color(0xFF5F6B7A), 0.18f),
        outline = tint(Color(0xFF7A8594), 0.25f), outlineVariant = tint(Color(0xFFCDD3DC), 0.25f),
        surfaceContainer = tint(Color(0xFFF1F3F6), 0.1f), surfaceContainerHigh = tint(Color(0xFFEBEEF2), 0.14f), surfaceContainerHighest = tint(Color(0xFFE5E8ED), 0.18f),
        error = Color(0xFFC62828),
    )
}

/** Looks up the live settings anywhere in the UI (with E-ink mode's overrides applied). */
val LocalSettings = staticCompositionLocalOf { AppSettings() }
/** The settings exactly as you chose them; the settings screens show these. */
val LocalRawSettings = staticCompositionLocalOf { AppSettings() }

/** What the app actually uses: your settings, with E-ink mode and the small-screen layout applied on top. */
fun effectiveSettings(s: AppSettings, screenWidthDp: Int, screenHeightDp: Int): AppSettings {
    var e = s
    if (s.eink) e = e.copy(
        themeMode = "light", reduceMotion = true, screenEffects = false, messageAnimation = "none", bubbleFill = "solid", bubbleDepth = "flat",
        bubbleStyle = if (s.bubbleStyle == "plain") "plain" else "outline", wallpaper = "none", autoPlayGifs = false, colorSenderNames = false, accent = "teal",
    )
    // Small screens get tighter rows.
    val small = screenWidthDp < 340 || screenHeightDp < 560
    if (s.smallScreen == "on" || (s.smallScreen == "auto" && small)) e = e.copy(density = "compact")
    return e
}

/** True while E-ink mode is on. Lets plain helpers (no composition access) make faint things solid. */
object Ink { @Volatile var on = false }

/** Like Color.copy(alpha) for text, icons and lines, but never faint in E-ink mode: faded gray disappears on a fast-refresh screen. */
fun Color.dim(alpha: Float): Color = if (Ink.on && alpha >= 0.4f) copy(alpha = 1f) else copy(alpha = alpha)

/**
 * How much to scale the whole interface. Automatic reads the screen: Android already normalizes density, so what differs is how many
 * dp fit across the screen's short side (a 3-inch handset has fewer than a 10-inch tablet); we scale so the layout always looks like
 * a ~411dp phone. Manual uses your slider.
 */
fun uiScaleFor(s: AppSettings, config: android.content.res.Configuration): Float {
    if (s.scaleMode == "auto") return (config.smallestScreenWidthDp / 411f).coerceIn(0.8f, 1.6f)
    return s.uiScale.coerceIn(0.6f, 1.8f)
}

/** Pure black on white with light-gray fills: reads well on e-ink and needs no color. */
private fun einkScheme(): ColorScheme = lightColorScheme(
    primary = Color.Black, onPrimary = Color.White, primaryContainer = Color.White, onPrimaryContainer = Color.Black,
    secondary = Color.Black, onSecondary = Color.White, secondaryContainer = Color(0xFFE6E6E6), onSecondaryContainer = Color.Black,
    background = Color.White, onBackground = Color.Black, surface = Color.White, onSurface = Color.Black,
    surfaceVariant = Color(0xFFE6E6E6), onSurfaceVariant = Color(0xFF1A1A1A), surfaceContainer = Color.White, surfaceContainerHigh = Color(0xFFF0F0F0),
    surfaceContainerHighest = Color(0xFFE6E6E6), outline = Color.Black, outlineVariant = Color.Black, error = Color.Black, onError = Color.White,
    inverseSurface = Color.Black, inverseOnSurface = Color.White, inversePrimary = Color.White, scrim = Color.Black,
)

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

private fun Context.findActivity(): Activity? {
    var c = this
    while (c is ContextWrapper) { if (c is Activity) return c; c = c.baseContext }
    return null
}

/** Tighter, calmer type scale than the Material default (closer to Google Messages / iOS Messages). */
private val PagerTypography = Typography(
    headlineMedium = TextStyle(fontSize = 28.sp, lineHeight = 34.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.3).sp),
    titleLarge = TextStyle(fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.2).sp),
    titleMedium = TextStyle(fontSize = 16.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 22.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
    labelLarge = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium),
    labelMedium = TextStyle(fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.Medium),
)

/** E-ink typography: every style at least semi-bold, titles and labels bold, so thin strokes don't vanish. */
private val EinkTypography = PagerTypography.let { t ->
    fun TextStyle.bold(w: FontWeight) = copy(fontWeight = w)
    Typography(
        displayLarge = t.displayLarge.bold(FontWeight.Bold), displayMedium = t.displayMedium.bold(FontWeight.Bold), displaySmall = t.displaySmall.bold(FontWeight.Bold),
        headlineLarge = t.headlineLarge.bold(FontWeight.ExtraBold), headlineMedium = t.headlineMedium.bold(FontWeight.ExtraBold), headlineSmall = t.headlineSmall.bold(FontWeight.Bold),
        titleLarge = t.titleLarge.bold(FontWeight.ExtraBold), titleMedium = t.titleMedium.bold(FontWeight.Bold), titleSmall = t.titleSmall.bold(FontWeight.Bold),
        bodyLarge = t.bodyLarge.bold(FontWeight.SemiBold), bodyMedium = t.bodyMedium.bold(FontWeight.SemiBold), bodySmall = t.bodySmall.bold(FontWeight.SemiBold),
        labelLarge = t.labelLarge.bold(FontWeight.Bold), labelMedium = t.labelMedium.bold(FontWeight.Bold), labelSmall = t.labelSmall.bold(FontWeight.Bold),
    )
}

private val PagerShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp), small = RoundedCornerShape(10.dp), medium = RoundedCornerShape(14.dp),
    large = RoundedCornerShape(20.dp), extraLarge = RoundedCornerShape(28.dp),
)

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun PagerTheme(rawSettings: AppSettings, content: @Composable () -> Unit) {
    val config = androidx.compose.ui.platform.LocalConfiguration.current
    val settings = effectiveSettings(rawSettings, config.screenWidthDp, config.screenHeightDp)
    Ink.on = settings.eink
    val dark = isDarkTheme(settings)
    val context = LocalContext.current
    // The app has its own light/dark setting, so the system bars must follow it, not the phone's theme
    // (otherwise light mode draws white status-bar icons on a light background).
    val view = LocalView.current
    if (!view.isInEditMode) SideEffect {
        val window = view.context.findActivity()?.window ?: return@SideEffect
        val controller = WindowCompat.getInsetsController(window, view)
        controller.isAppearanceLightStatusBars = !dark
        controller.isAppearanceLightNavigationBars = !dark
        window.setWindowAnimations(if (settings.eink) 0 else android.R.style.Animation_Activity)
    }
    val colors = if (settings.accent == "dynamic" && Build.VERSION.SDK_INT >= 31) {
        if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
    } else scheme(dark, settings.themeMode == "black", settings.accent, settings.accentCustom)
    val base = LocalDensity.current
    CompositionLocalProvider(
        LocalSettings provides settings,
        LocalRawSettings provides rawSettings,
        LocalDensity provides Density(base.density * uiScaleFor(rawSettings, config), base.fontScale * settings.fontScale),
        androidx.compose.material3.LocalRippleConfiguration provides (if (settings.eink) null else androidx.compose.material3.LocalRippleConfiguration.current),
    ) { MaterialTheme(colorScheme = if (settings.eink) einkScheme() else colors, typography = if (settings.eink) EinkTypography else PagerTypography, shapes = PagerShapes, content = content) }
}
