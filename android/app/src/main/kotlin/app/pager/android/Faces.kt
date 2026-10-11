package app.pager.android

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** A person drawn in a group's round picture. */
data class Face(val name: String, val mxc: String? = null)

/** Where each face sits inside the circle (x, y and width as fractions of its width), like iMessage: one big, the rest smaller around it. */
fun faceLayout(n: Int): List<Triple<Float, Float, Float>> = when {
    n <= 1 -> listOf(Triple(0f, 0f, 1f))
    n == 2 -> listOf(Triple(0.02f, 0.10f, 0.58f), Triple(0.40f, 0.38f, 0.58f))
    n == 3 -> listOf(Triple(0.05f, 0.08f, 0.56f), Triple(0.50f, 0.10f, 0.42f), Triple(0.30f, 0.52f, 0.46f))
    else -> listOf(Triple(0.04f, 0.10f, 0.54f), Triple(0.56f, 0.04f, 0.38f), Triple(0.58f, 0.46f, 0.38f), Triple(0.22f, 0.60f, 0.34f))
}

private val bridgeGhost = Regex("^@(whatsapp|signal|gmessages|messenger|slack|discord|telegram|instagram|twitter|bluesky|linkedin|groupme)_")

/** Up to four people in a group, not counting you or any bridge bot: the faces for its round picture. */
fun groupFaces(c: ChatState, me: String): List<Face> =
    c.members.filter { (id, n) -> id != me && !Regex("^@[a-z0-9_-]*bot:").containsMatchIn(id) && n.isNotBlank() && !n.trim().startsWith("@") && !(bridgeGhost.containsMatchIn(id) && n.trim() == id.drop(1).substringBefore(':')) }
        .entries.sortedBy { it.value.lowercase() }.take(4).map { (id, n) -> Face(n, c.memberAvatars[id]) }

/** A group's round picture when it has none of its own: the faces of its people, one big and the rest smaller. */
@Composable
fun GroupAvatar(faces: List<Face>, size: Dp) {
    val spots = faceLayout(faces.size)
    Box(Modifier.size(size).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant)) {
        faces.take(spots.size).forEachIndexed { i, f ->
            val (x, y, d) = spots[i]
            Box(Modifier.offset(size * x, size * y).size(size * d).clip(CircleShape).border(2.dp, MaterialTheme.colorScheme.surface, CircleShape)) { Avatar(f.name, null, size * d, f.mxc) }
        }
    }
}

/** A chat's picture: its own, or for a group without one the faces of its people. */
@Composable
fun ChatAvatar(name: String, network: String?, size: Dp, mxc: String?, faces: List<Face>) {
    if (mxc == null && faces.size > 1) GroupAvatar(faces, size) else Avatar(name, network, size, mxc)
}
