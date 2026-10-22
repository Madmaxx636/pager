package app.pager.android

/**
 * Messenger looks: a whole app style modelled on a well-known messenger (drawn fresh, with no artwork or logos from the originals).
 * Choosing one sets colours, bubble shapes, type and motion together. Your own settings are untouched underneath: choose "Pager" and
 * they are as you left them.
 */
class Look(val id: String, val name: String, val blurb: String, val apply: (AppSettings) -> AppSettings)

val LOOKS: List<Look> = listOf(
    Look("imessage", "Messages (iPhone)", "Blue and gray bubbles with tails, springy sends, “Delivered / Read” text.") { s ->
        s.copy(
            accent = "custom", accentCustom = "#0A84FF", palette = "none", fontFamily = "sf", reactionStyle = "filled", bubbleStyle = "tail", outStyle = "tail", bubbleFill = "solid", bubbleBorder = "none", outBorder = "",
            bubbleRadius = 18, outRadius = -1, bubbleWidth = 74, bubbleDepth = "flat", bubbleNative = false,
            bubbleMine = "#0A84FF", bubbleMineDark = "#0A84FF", bubbleMineText = "#FFFFFF", bubbleMineTextDark = "#FFFFFF",
            bubbleTheirs = "#E9E9EB", bubbleTheirsDark = "#26262A", bubbleTheirsText = "#000000", bubbleTheirsTextDark = "#FFFFFF",
            messageAnimation = "pop", wallpaper = "none", colorSenderNames = false, avatarShape = "circle", showMessageTimes = false, showReadTicks = true, density = "comfortable",
        )
    },
    Look("hangouts", "Hangouts (classic)", "Green accents, flat cards with soft shadows, a round photo beside each message.") { s ->
        s.copy(
            accent = "custom", accentCustom = "#0F9D58", palette = "none", fontFamily = "roboto", reactionStyle = "filled", bubbleStyle = "round", outStyle = "round", bubbleFill = "solid", bubbleBorder = "none", outBorder = "",
            bubbleRadius = 4, outRadius = -1, bubbleWidth = 70, bubbleDepth = "soft", bubbleNative = false,
            bubbleMine = "#0F9D58", bubbleMineDark = "#0B8043", bubbleMineText = "#FFFFFF", bubbleMineTextDark = "#FFFFFF",
            bubbleTheirs = "#FFFFFF", bubbleTheirsDark = "#37474F", bubbleTheirsText = "#212121", bubbleTheirsTextDark = "#ECEFF1",
            messageAnimation = "fade", wallpaper = "none", colorSenderNames = true, avatarShape = "circle", showAvatars = true, showMessageTimes = true, showReadTicks = true, density = "comfortable",
        )
    },
    Look("gmessages", "Google Messages", "Big rounded bubbles that join neatly, a pill message field and soft Material motion.") { s ->
        s.copy(
            accent = "custom", accentCustom = "#0B57D0", palette = "none", fontFamily = "googlesans", reactionStyle = "filled", bubbleStyle = "round", outStyle = "round", bubbleFill = "solid", bubbleBorder = "none", outBorder = "",
            bubbleRadius = 20, outRadius = -1, bubbleWidth = 78, bubbleDepth = "flat", bubbleNative = false,
            bubbleMine = "#0B57D0", bubbleMineDark = "#A8C7FA", bubbleMineText = "#FFFFFF", bubbleMineTextDark = "#062E6F",
            bubbleTheirs = "#E9EEF6", bubbleTheirsDark = "#2B2F33", bubbleTheirsText = "#1F1F1F", bubbleTheirsTextDark = "#E3E3E3",
            messageAnimation = "slide", wallpaper = "none", colorSenderNames = false, avatarShape = "circle", showMessageTimes = true, showReadTicks = true, density = "comfortable",
        )
    },
)

/** What the look overrides, on top of your own settings. */
fun withLook(s: AppSettings): AppSettings = LOOKS.firstOrNull { it.id == s.look }?.apply?.invoke(s) ?: s
