package app.pager.android

import androidx.compose.material.icons.rounded.Call
import androidx.compose.material.icons.rounded.ChatBubble
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.SportsEsports
import androidx.compose.material.icons.rounded.PhotoCamera
import androidx.compose.material.icons.rounded.Forum
import androidx.compose.material.icons.rounded.Groups
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
    "groupme" to NetworkMeta("GroupMe", Color(0xFF00AFF0), "G"),
    "matrix" to NetworkMeta("Matrix", Color(0xFF8A94A6), "#"),
)

/** Simple original glyphs for each network (no brand marks). */
fun networkIcon(id: String): androidx.compose.ui.graphics.vector.ImageVector? = when (id) {
    "whatsapp" -> Icons.Rounded.Call
    "signal" -> Icons.Rounded.ChatBubble
    "telegram" -> Icons.AutoMirrored.Rounded.Send
    "discord" -> Icons.Rounded.SportsEsports
    "instagram" -> Icons.Rounded.PhotoCamera
    "messenger" -> Icons.Rounded.Forum
    "gmessages" -> Icons.Rounded.Sms
    "groupme" -> Icons.Rounded.Groups
    else -> null
}

fun networkMeta(id: String) = networks[id] ?: NetworkMeta(id, Color(0xFF8A94A6), id.take(1).uppercase())

/** Accent choices: (dark-theme tone, light-theme tone, on-color for dark, on-color for light). */
val ACCENTS: Map<String, List<Color>> by lazy { baseAccents + moreAccents() }

private val baseAccents: Map<String, List<Color>> = mapOf(
    "teal" to listOf(Color(0xFF2DD4BF), Color(0xFF0D9488), Color(0xFF04201C), Color.White),
    "blue" to listOf(Color(0xFF60A5FA), Color(0xFF2563EB), Color(0xFF061A38), Color.White),
    "purple" to listOf(Color(0xFFC4A1FF), Color(0xFF7C3AED), Color(0xFF1E0B3D), Color.White),
    "pink" to listOf(Color(0xFFF9A8D4), Color(0xFFDB2777), Color(0xFF3B0A23), Color.White),
    "orange" to listOf(Color(0xFFFDBA74), Color(0xFFEA580C), Color(0xFF3A1A04), Color.White),
    "green" to listOf(Color(0xFF86EFAC), Color(0xFF16A34A), Color(0xFF062B12), Color.White),
    "red" to listOf(Color(0xFFFCA5A5), Color(0xFFDC2626), Color(0xFF3B0A0A), Color.White),
)

/** More accent colours, made from a hue so each one reads well on light and on dark backgrounds. Same list as the web app. */
private fun moreAccents(): Map<String, List<Color>> = listOf(
    Triple("crimson", 350f, .8f), Triple("coral", 10f, .85f), Triple("amber", 38f, .9f), Triple("yellow", 50f, .9f), Triple("lime", 84f, .65f), Triple("mint", 150f, .6f),
    Triple("emerald", 160f, .75f), Triple("cyan", 188f, .8f), Triple("sky", 204f, .85f), Triple("indigo", 240f, .7f), Triple("violet", 262f, .75f), Triple("magenta", 300f, .7f),
    Triple("rose", 340f, .8f), Triple("brown", 28f, .45f), Triple("slate", 215f, .2f), Triple("gold", 45f, .85f),
).associate { (name, h, sat) ->
    val dark = fromHsl(h, sat, .72f); val light = fromHsl(h, sat, .4f)
    name to listOf(dark, light, onColor(dark), onColor(light))
}

/** Parses "#RRGGBB" (or without the #); null if it isn't a colour. */
fun parseHex(s: String): Color? = runCatching {
    val h = s.trim().removePrefix("#")
    if (h.length != 6) null else Color(0xFF000000L or h.toLong(16))
}.getOrNull()

fun Color.toHex(): String = "#%02X%02X%02X".format((red * 255 + 0.5f).toInt(), (green * 255 + 0.5f).toInt(), (blue * 255 + 0.5f).toInt())

private fun hsl(c: Color): FloatArray {
    val r = c.red; val g = c.green; val b = c.blue
    val max = maxOf(r, g, b); val min = minOf(r, g, b); val l = (max + min) / 2f; val d = max - min
    if (d == 0f) return floatArrayOf(0f, 0f, l)
    val s = d / (1f - kotlin.math.abs(2f * l - 1f))
    val h = when (max) { r -> ((g - b) / d) % 6f; g -> (b - r) / d + 2f; else -> (r - g) / d + 4f } * 60f
    return floatArrayOf((h + 360f) % 360f, s, l)
}
private fun fromHsl(h: Float, s: Float, l: Float): Color {
    val hh = ((h % 360f) + 360f) % 360f; val ss = s.coerceIn(0f, 1f); val ll = l.coerceIn(0f, 1f)
    val c = (1f - kotlin.math.abs(2f * ll - 1f)) * ss
    val x = c * (1f - kotlin.math.abs((hh / 60f) % 2f - 1f)); val m = ll - c / 2f
    val (r, g, b) = when { hh < 60f -> Triple(c, x, 0f); hh < 120f -> Triple(x, c, 0f); hh < 180f -> Triple(0f, c, x); hh < 240f -> Triple(0f, x, c); hh < 300f -> Triple(x, 0f, c); else -> Triple(c, 0f, x) }
    return Color(r + m, g + m, b + m)
}
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
/** True on a phone driven by a d-pad and keys (or when switched on in Settings): focus is drawn clearly and everything is reachable without touching the screen. */
val LocalKeypad = staticCompositionLocalOf { false }
/** A phone with a d-pad or a number pad (flip phones, the CAT S22 Flip and the like). */
fun keypadDevice(c: android.content.res.Configuration) = c.navigation == android.content.res.Configuration.NAVIGATION_DPAD || c.keyboard == android.content.res.Configuration.KEYBOARD_12KEY
/** The settings exactly as you chose them; the settings screens show these. */
val LocalRawSettings = staticCompositionLocalOf { AppSettings() }

/** What the app actually uses: your settings, with E-ink mode and the small-screen layout applied on top. */
fun effectiveSettings(s: AppSettings, screenWidthDp: Int, screenHeightDp: Int, keypad: Boolean = false): AppSettings {
    var e = s
    // Keypad phones are slow and have no gestures: calm, light and plain.
    if (keypad) e = e.copy(reduceMotion = true, screenEffects = false, autoPlayGifs = false)
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
object Ink { @Volatile var on = false; @Volatile var dark = 4 }
/** The colour of E-ink text and lines: from dark gray to pure black. Darkness is the only thing the setting changes; lines stay thin. */
fun inkColor(): Color = when (Ink.dark) { 1 -> Color(0xFF5A5A5A); 2 -> Color(0xFF383838); 3 -> Color(0xFF1C1C1C); else -> Color.Black }
/** A thin line width for E-ink drawings (never more than about 1.5 dp, however dark). */
fun inkDp(base: Float) = (minOf(base, 2f) * 0.75f).dp

/** Like Color.copy(alpha) for text, icons and lines, but never faint in E-ink mode: faded gray disappears on a fast-refresh screen. */
fun Color.dim(alpha: Float): Color = if (Ink.on && alpha >= 0.4f) copy(alpha = 1f) else copy(alpha = alpha)

/**
 * How much to scale the whole interface. Automatic reads the screen: Android already normalizes density, so what differs is how many
 * dp fit across the screen's short side (a 3-inch handset has fewer than a 10-inch tablet); we scale so the layout always looks like
 * a ~411dp phone. Manual uses your slider.
 */
fun uiScaleFor(s: AppSettings, config: android.content.res.Configuration): Float {
    when (s.scaleMode) { "small" -> return 0.88f; "medium" -> return 1f; "large" -> return 1.15f }
    if (s.scaleMode == "auto") return (config.smallestScreenWidthDp / 411f).coerceIn(0.8f, 1.6f)
    return s.uiScale.coerceIn(0.6f, 1.8f)
}

/** Pure black on white with light-gray fills: reads well on e-ink and needs no color. */
private fun einkScheme(): ColorScheme { val k = inkColor(); return lightColorScheme(
    primary = k, onPrimary = Color.White, primaryContainer = Color.White, onPrimaryContainer = k,
    secondary = k, onSecondary = Color.White, secondaryContainer = Color(0xFFE6E6E6), onSecondaryContainer = k,
    background = Color.White, onBackground = k, surface = Color.White, onSurface = k,
    surfaceVariant = Color(0xFFE6E6E6), onSurfaceVariant = k, surfaceContainer = Color.White, surfaceContainerHigh = Color(0xFFF0F0F0),
    surfaceContainerHighest = Color(0xFFE6E6E6), outline = k, outlineVariant = k, error = k, onError = Color.White,
    inverseSurface = k, inverseOnSurface = Color.White, inversePrimary = Color.White, scrim = Color.Black,
) }

fun bubbleShape(style: String) = when (style) {
    "square" -> RoundedCornerShape(6.dp)
    "soft" -> RoundedCornerShape(26.dp)
    else -> RoundedCornerShape(18.dp)
}

/** Wallpaper gradients: (light top, light bottom, dark top, dark bottom, angle). Same names as the web app, which also has patterns. */
private val WALLPAPER_COLORS: Map<String, List<Long>> = mapOf(
    "dusk" to listOf(0xE9E1FA, 0xF6F7F9, 0x1B1530, 0x0B0E13), "forest" to listOf(0xDCEFE3, 0xF6F7F9, 0x0E2219, 0x0B0E13), "ocean" to listOf(0xD9ECFA, 0xF6F7F9, 0x0A1F33, 0x0B0E13),
    "sand" to listOf(0xF5EBDA, 0xF6F7F9, 0x2A2116, 0x0B0E13), "graphite" to listOf(0xE3E6EA, 0xF6F7F9, 0x1C1F24, 0x0B0E13),
    "sunrise" to listOf(0xFFE3CF, 0xFFD0E0, 0x2C1620, 0x3A1F12), "lavender" to listOf(0xECE4FF, 0xDBE9FF, 0x1E1838, 0x12203A), "mint" to listOf(0xDCF7EC, 0xE1F0FF, 0x0C2A22, 0x0E2133),
    "peach" to listOf(0xFFE8DC, 0xFFF3D6, 0x2E1B14, 0x2B2410), "rosegold" to listOf(0xFDE4E4, 0xF7E3CF, 0x321A1F, 0x2C2013), "steel" to listOf(0xE6EBF1, 0xCFD8E3, 0x1A2028, 0x10151B),
    "midnight" to listOf(0xD6DCF5, 0xE9D9F5, 0x0A0F24, 0x1A1038), "lagoon" to listOf(0xCDF0F0, 0xD4E5FF, 0x07262B, 0x0B1D3A), "ember" to listOf(0xFFE0D0, 0xFFECCB, 0x2E100A, 0x2F1F08),
    "moss" to listOf(0xE4EFD3, 0xD6ECDF, 0x162410, 0x0E2419), "aurora" to listOf(0xB9F2DC, 0xF1C9FF, 0x0F5A46, 0x5A1F6E), "candy" to listOf(0xFFC8DD, 0xC8E7FF, 0x6A1F45, 0x1F4A6A),
    "tropic" to listOf(0xB8F0E4, 0xFFC1C1, 0x0D5A50, 0x6A1F1F), "dawn" to listOf(0xFFD6B8, 0xBFE3FF, 0x6A3517, 0x1A4A6A),
)
val WALLPAPER_NAMES = listOf("none" to "None", "dusk" to "Dusk", "forest" to "Forest", "ocean" to "Ocean", "sand" to "Sand", "graphite" to "Graphite", "sunrise" to "Sunrise", "lavender" to "Lavender",
    "mint" to "Mint", "peach" to "Peach", "rosegold" to "Rose gold", "steel" to "Steel", "midnight" to "Midnight sky", "lagoon" to "Lagoon", "ember" to "Ember", "moss" to "Moss",
    "aurora" to "Aurora", "candy" to "Candy", "tropic" to "Tropic", "dawn" to "Dawn")

fun wallpaperBrush(name: String, dark: Boolean): Brush? {
    val c = WALLPAPER_COLORS[name] ?: return null
    val (a, b) = if (dark) c[2] to c[3] else c[0] to c[1]
    return Brush.verticalGradient(listOf(Color(0xFF000000 or a), Color(0xFF000000 or b)))
}

@Composable
fun isDarkTheme(s: AppSettings) = paletteById(s.palette)?.dark ?: when (s.themeMode) { "light" -> false; "dark", "black" -> true; else -> isSystemInDarkTheme() }

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
private fun einkTypography(base: Typography) = base.let { t ->
    // Text gets a touch heavier than normal so it stays readable, but never bold: the setting makes it darker, not thicker.
    fun TextStyle.bold(w: FontWeight) = copy(fontWeight = if (w.weight >= 600) FontWeight.SemiBold else FontWeight.Medium)
    Typography(
        displayLarge = t.displayLarge.bold(FontWeight.Bold), displayMedium = t.displayMedium.bold(FontWeight.Bold), displaySmall = t.displaySmall.bold(FontWeight.Bold),
        headlineLarge = t.headlineLarge.bold(FontWeight.ExtraBold), headlineMedium = t.headlineMedium.bold(FontWeight.ExtraBold), headlineSmall = t.headlineSmall.bold(FontWeight.Bold),
        titleLarge = t.titleLarge.bold(FontWeight.ExtraBold), titleMedium = t.titleMedium.bold(FontWeight.Bold), titleSmall = t.titleSmall.bold(FontWeight.Bold),
        bodyLarge = t.bodyLarge.bold(FontWeight.SemiBold), bodyMedium = t.bodyMedium.bold(FontWeight.SemiBold), bodySmall = t.bodySmall.bold(FontWeight.SemiBold),
        labelLarge = t.labelLarge.bold(FontWeight.Bold), labelMedium = t.labelMedium.bold(FontWeight.Bold), labelSmall = t.labelSmall.bold(FontWeight.Bold),
    )
}

private fun typographyFor(s: AppSettings): Typography {
    val base = PagerTypography.let { t -> fontFamilyFor(s.fontFamily)?.let { f -> t.copy(
        displayLarge = t.displayLarge.copy(fontFamily = f), displayMedium = t.displayMedium.copy(fontFamily = f), displaySmall = t.displaySmall.copy(fontFamily = f),
        headlineLarge = t.headlineLarge.copy(fontFamily = f), headlineMedium = t.headlineMedium.copy(fontFamily = f), headlineSmall = t.headlineSmall.copy(fontFamily = f),
        titleLarge = t.titleLarge.copy(fontFamily = f), titleMedium = t.titleMedium.copy(fontFamily = f), titleSmall = t.titleSmall.copy(fontFamily = f),
        bodyLarge = t.bodyLarge.copy(fontFamily = f), bodyMedium = t.bodyMedium.copy(fontFamily = f), bodySmall = t.bodySmall.copy(fontFamily = f),
        labelLarge = t.labelLarge.copy(fontFamily = f), labelMedium = t.labelMedium.copy(fontFamily = f), labelSmall = t.labelSmall.copy(fontFamily = f),
    ) } ?: t }
    return if (s.eink) einkTypography(base) else base
}

/** The colours of a ready-made look; the accent you chose still colours buttons and your own messages. */
private fun paletteScheme(p: Palette, primary: Color, on: Color): ColorScheme {
    val tertiary = hsl(primary).let { (h, s, l) -> fromHsl(h + 40f, s, l) }
    return if (p.dark) darkColorScheme(
        primary = primary, onPrimary = on, primaryContainer = primary.copy(alpha = 0.9f), onPrimaryContainer = on, secondary = primary, onSecondary = on,
        secondaryContainer = p.panel2, onSecondaryContainer = p.text, tertiary = tertiary, onTertiary = onColor(tertiary), surfaceTint = primary,
        background = p.bg, onBackground = p.text, surface = p.panel, onSurface = p.text, surfaceVariant = p.panel2, onSurfaceVariant = p.muted,
        outline = p.muted, outlineVariant = p.line, surfaceContainer = p.panel, surfaceContainerHigh = p.panel2, surfaceContainerHighest = p.panel2, error = Color(0xFFFF7B7B),
    ) else lightColorScheme(
        primary = primary, onPrimary = on, primaryContainer = primary, onPrimaryContainer = on, secondary = primary, onSecondary = on,
        secondaryContainer = p.panel2, onSecondaryContainer = p.text, tertiary = tertiary, onTertiary = onColor(tertiary), surfaceTint = primary,
        background = p.bg, onBackground = p.text, surface = p.panel, onSurface = p.text, surfaceVariant = p.panel2, onSurfaceVariant = p.muted,
        outline = p.muted, outlineVariant = p.line, surfaceContainer = p.panel, surfaceContainerHigh = p.panel2, surfaceContainerHighest = p.panel2, error = Color(0xFFC62828),
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
    val keypad = rawSettings.keypad == "on" || (rawSettings.keypad == "auto" && keypadDevice(config))
    val settings = effectiveSettings(rawSettings, config.screenWidthDp, config.screenHeightDp, keypad)
    Ink.on = settings.eink; Ink.dark = settings.einkDark.coerceIn(1, 4)
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
    val pal = if (settings.palette != "none") paletteById(settings.palette) else null
    val colors = if (pal != null) paletteScheme(pal, accentTones(settings.accent, settings.accentCustom).let { if (pal.dark) it[0] else it[1] }, if (pal.dark) accentTones(settings.accent, settings.accentCustom)[2] else accentTones(settings.accent, settings.accentCustom)[3]) else if (settings.accent == "dynamic" && Build.VERSION.SDK_INT >= 31) {
        if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
    } else scheme(dark, settings.themeMode == "black", settings.accent, settings.accentCustom)
    val base = LocalDensity.current
    CompositionLocalProvider(
        LocalSettings provides settings,
        LocalRawSettings provides rawSettings,
        LocalDensity provides Density(base.density * uiScaleFor(rawSettings, config), base.fontScale * settings.fontScale),
        LocalKeypad provides keypad,
        androidx.compose.material3.LocalRippleConfiguration provides (if (settings.eink) null else if (keypad) androidx.compose.material3.RippleConfiguration(rippleAlpha = androidx.compose.material.ripple.RippleAlpha(draggedAlpha = 0.16f, focusedAlpha = 0.14f, hoveredAlpha = 0.08f, pressedAlpha = 0.3f)) else androidx.compose.material3.LocalRippleConfiguration.current),
    ) { MaterialTheme(colorScheme = if (settings.eink) einkScheme() else colors, typography = typographyFor(settings), shapes = PagerShapes, content = content) }
}
