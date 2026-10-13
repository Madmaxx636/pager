package app.pager.android

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp

/** The corners of a bubble: your own roundness (18 by default) and a small corner next to the sender for the two tails. */
fun bubbleShape(look: SideLook, mine: Boolean, first: Boolean, last: Boolean, tailed: Boolean): RoundedCornerShape {
    val r = (if (look.radius > 0) look.radius else 18).dp
    val tailStyle = look.style == "tail" || look.style == "curved"
    val tight = if (tailStyle) r else minOf(8, (if (look.radius > 0) look.radius else 18) / 3).dp
    val corner = when { tailed -> 4.dp; last -> r; else -> tight }
    return if (mine) RoundedCornerShape(r, if (first) r else tight, corner, r) else RoundedCornerShape(if (first) r else tight, r, r, corner)
}

/** The ways to draw a line around a bubble. */
val BORDER_STYLES = listOf("none" to "None", "solid" to "Solid", "dotted" to "Dotted", "dashed" to "Dashed", "thick" to "Thick", "edge" to "Bottom edge", "dashdot" to "Dash dot")

