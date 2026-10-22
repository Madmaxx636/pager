package app.pager.android

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily

/** Ready-made looks for the whole app: surfaces, text and a matching accent together. The web app has the same list. */
class Palette(val id: String, val name: String, val dark: Boolean, bg: Long, panel: Long, panel2: Long, line: Long, text: Long, muted: Long, accent: Long, val group: String = "classic") {
    val bg = Color(0xFF000000 or bg); val panel = Color(0xFF000000 or panel); val panel2 = Color(0xFF000000 or panel2); val line = Color(0xFF000000 or line)
    val text = Color(0xFF000000 or text); val muted = Color(0xFF000000 or muted); val accent = Color(0xFF000000 or accent)
}

val PALETTES = listOf(
    Palette("paper", "Paper", false, 0xF4EFE6, 0xFBF8F2, 0xEBE4D6, 0xDCD3C1, 0x2B2620, 0x7A6F5F, 0xB45309),
    Palette("ocean", "Ocean", false, 0xE8F2F7, 0xFFFFFF, 0xD6E8F0, 0xC3DBE7, 0x0F2A38, 0x55758A, 0x0A7EA4),
    Palette("rose", "Rose", false, 0xFBEFF2, 0xFFF8FA, 0xF5DDE3, 0xEBC9D2, 0x3A1D26, 0x8A5D6B, 0xD6336C),
    Palette("midnight", "Midnight", true, 0x0A1020, 0x101830, 0x18223F, 0x202C4D, 0xE6EBF7, 0x8A96B5, 0x7AA2FF),
    Palette("forest", "Forest", true, 0x0C1410, 0x121D17, 0x1A2A21, 0x223629, 0xE3EFE7, 0x86A091, 0x5AD28A),
    Palette("sunset", "Sunset", true, 0x1A0F14, 0x241419, 0x321C23, 0x3D232B, 0xF6E9E6, 0xB89AA0, 0xFF8A5C),
    Palette("slate", "Slate", true, 0x14171C, 0x1B1F26, 0x252A33, 0x2F3540, 0xE4E7EC, 0x8F98A6, 0x9DB4D3),
    Palette("terminal", "Terminal", true, 0x000000, 0x031003, 0x0A1F0A, 0x0F3A0F, 0x6DFF6D, 0x3FAE3F, 0x39FF14),
    Palette("pager", "Pager (amber)", true, 0x1B1608, 0x241D0B, 0x332A10, 0x44381A, 0xFFCF5A, 0xB08E35, 0xFFB000),
)
/** Every colour comes with white, with black, and as a solid colour. Name, hue in degrees, how much colour (Grey has none). */
val HUES = listOf("Red" to 0, "Orange" to 24, "Amber" to 40, "Yellow" to 50, "Lime" to 84, "Green" to 130, "Emerald" to 155, "Teal" to 175, "Cyan" to 190,
    "Sky" to 205, "Blue" to 220, "Indigo" to 240, "Violet" to 262, "Purple" to 282, "Fuchsia" to 300, "Pink" to 330, "Rose" to 348, "Grey" to -215)

private fun hexOf(h: Int, s: Double, l: Double): Long {
    val ss = s / 100.0; val ll = l / 100.0
    val c = (1 - Math.abs(2 * ll - 1)) * ss; val x = c * (1 - Math.abs((h / 60.0) % 2 - 1)); val m = ll - c / 2
    val (r, g, b) = when { h < 60 -> Triple(c, x, 0.0); h < 120 -> Triple(x, c, 0.0); h < 180 -> Triple(0.0, c, x); h < 240 -> Triple(0.0, x, c); h < 300 -> Triple(x, 0.0, c); else -> Triple(c, 0.0, x) }
    fun ch(v: Double) = Math.round((v + m) * 255).toLong()
    return (ch(r) shl 16) or (ch(g) shl 8) or ch(b)
}

private fun family(name: String, hue: Int): List<Palette> {
    val grey = hue < 0; val h = Math.abs(hue); val k = if (grey) 0.0 else 1.0; val id = name.lowercase()
    return listOf(
        Palette("$id-white", "$name on white", false, hexOf(h, 40 * k, 97.0), 0xFFFFFF, hexOf(h, 40 * k, 93.0), hexOf(h, 30 * k, 86.0), hexOf(h, 30 * k, 12.0), hexOf(h, 12 * k, 42.0), hexOf(h, 75 * k, 42.0), "white"),
        Palette("$id-black", "$name on black", true, 0x000000, hexOf(h, 30 * k, 7.0), hexOf(h, 30 * k, 12.0), hexOf(h, 25 * k, 19.0), hexOf(h, 20 * k, 94.0), hexOf(h, 12 * k, 62.0), hexOf(h, 90 * k, 64.0), "black"),
        Palette("$id-solid", "$name solid", true, hexOf(h, 55 * k, 28.0), hexOf(h, 55 * k, 23.0), hexOf(h, 55 * k, 18.0), hexOf(h, 45 * k, 38.0), 0xFFFFFF, hexOf(h, 30 * k, 82.0), hexOf(h, 100 * k, 85.0), "solid"),
    )
}
val ALL_PALETTES: List<Palette> = PALETTES + HUES.flatMap { (n, h) -> family(n, h) }
val PALETTE_GROUPS = listOf("classic" to "Classic", "white" to "With white", "black" to "With black", "solid" to "Solid colours")
fun paletteById(id: String) = ALL_PALETTES.firstOrNull { it.id == id }

/** Fonts that ship with Android, so nothing is downloaded. */
val FONT_CHOICES = listOf("system" to "System", "serif" to "Serif", "rounded" to "Rounded", "humanist" to "Humanist", "mono" to "Monospace", "readable" to "Easy to read")
fun fontFamilyFor(id: String): FontFamily? = when (id) {
    "serif" -> FontFamily.Serif
    "mono" -> FontFamily.Monospace
    "rounded" -> FontFamily(android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL))
    "humanist" -> FontFamily(android.graphics.Typeface.create("sans-serif-condensed", android.graphics.Typeface.NORMAL))
    "sf" -> FontFamily(android.graphics.Typeface.create("sans-serif", android.graphics.Typeface.NORMAL))
    "googlesans" -> FontFamily(android.graphics.Typeface.create("google-sans", android.graphics.Typeface.NORMAL))
    "roboto" -> FontFamily(android.graphics.Typeface.create("sans-serif", android.graphics.Typeface.NORMAL))
    "readable" -> FontFamily(android.graphics.Typeface.create("casual", android.graphics.Typeface.NORMAL))
    else -> null
}
