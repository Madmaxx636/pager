package app.pager.android

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** The Pager mark: a rounded square with three message lines, drawn in the current accent color. */
@Composable
fun PagerLogo(size: Dp = 56.dp, modifier: Modifier = Modifier) {
    val bg = MaterialTheme.colorScheme.primary
    val ink = MaterialTheme.colorScheme.onPrimary
    Box(modifier.size(size).clip(RoundedCornerShape(size * 0.28f))) {
        Canvas(Modifier.size(size)) {
            drawRect(bg)
            val u = this.size.width / 512f
            fun bar(x0: Float, y0: Float, x1: Float, y1: Float) = drawRoundRect(ink, Offset(x0 * u, y0 * u), Size((x1 - x0) * u, (y1 - y0) * u), CornerRadius(20f * u))
            bar(150f, 168f, 362f, 208f); bar(150f, 236f, 362f, 276f); bar(150f, 304f, 278f, 344f)
        }
    }
}
