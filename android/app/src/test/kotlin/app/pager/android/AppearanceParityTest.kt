package app.pager.android

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AppearanceParityTest {
    private fun contrast(a: Color, b: Color): Float { val (x, y) = listOf(a.luminance(), b.luminance()).sortedDescending(); return (x + 0.05f) / (y + 0.05f) }

    @Test fun everyColourComesWithWhiteBlackAndSolid() {
        for ((name, _) in HUES) for (kind in listOf("white", "black", "solid")) assertNotNull("$name $kind", paletteById("${name.lowercase()}-$kind"))
        assertEquals(ALL_PALETTES.size, ALL_PALETTES.map { it.id }.toSet().size)
    }

    @Test fun textStaysReadableOnEveryLook() {
        for (p in ALL_PALETTES) for (bg in listOf(p.bg, p.panel)) assertTrue("${p.id} text on $bg", contrast(p.text, bg) > 4.5f)
    }

    @Test fun moreAccentsAndWallpapers() {
        assertTrue(ACCENTS.size >= 23)
        assertTrue(WALLPAPER_NAMES.size >= 20)
        for ((id, _) in WALLPAPER_NAMES.filter { it.first != "none" }) { assertNotNull(id, wallpaperBrush(id, true)); assertNotNull(id, wallpaperBrush(id, false)) }
    }

    @Test fun everySoundInTheListHasARecipe() {
        for ((id, _) in ChatSounds.choices.filter { it.first != "none" }) assertNotNull(id, ChatSounds.render(id))
        assertTrue(ChatSounds.choices.size >= 28)
    }

    @Test fun bigPhotosAreShrunk() {
        assertEquals(1920 to 960, WallpaperPhoto.fit(4000, 2000))
        assertEquals(1000 to 500, WallpaperPhoto.fit(1000, 500))
    }
}
