import QtQuick
import "Networks.js" as N

// How one side's bubbles look (Settings > Appearance > Message bubbles): shape, corner radius, border, fill and colours, with the same rules as the web app.
QtObject {
    id: lk
    property bool mine: false
    property string network: ""
    readonly property string shape: mine ? (settings.outStyle || settings.bubbleStyle) : settings.bubbleStyle
    readonly property int baseRadius: { const r = mine ? (settings.outRadius < 0 ? settings.bubbleRadius : settings.outRadius) : settings.bubbleRadius; return r > 0 ? r : 18 }
    readonly property int tight: (shape === "curved" || shape === "tail") ? baseRadius : Math.min(8, Math.round(baseRadius / 3))
    readonly property string borderStyle: (mine ? (settings.outBorder || settings.bubbleBorder) : settings.bubbleBorder) || "none"
    readonly property string fill: mine ? settings.bubbleFill : "solid"
    readonly property string customBg: { const v = mine ? (look.dark ? settings.bubbleMineDark : settings.bubbleMine) : (look.dark ? settings.bubbleTheirsDark : settings.bubbleTheirs); return /^#[0-9a-fA-F]{6}$/.test(v) ? v : "" }
    readonly property string customInk: { const v = mine ? (look.dark ? settings.bubbleMineTextDark : settings.bubbleMineText) : (look.dark ? settings.bubbleTheirsTextDark : settings.bubbleTheirsText); return /^#[0-9a-fA-F]{6}$/.test(v) ? v : "" }
    readonly property string nativeBg: !mine && settings.bubbleNative && customBg === "" ? N.meta(lk.network).color : ""
    readonly property color base: customBg !== "" ? customBg : (nativeBg !== "" ? nativeBg : (mine ? look.accent : look.theirs))
    function inkFor(c) { const l = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b); return l > 0.6 ? "#101418" : "#ffffff" }
    readonly property bool outlined: shape === "outline" || fill === "glass"
    readonly property bool tinted: fill === "tinted" && mine
    readonly property color bubbleColor: shape === "outline" ? "transparent" : (fill === "glass" ? Qt.rgba(base.r, base.g, base.b, 0.55) : (tinted ? Qt.tint(look.panel, Qt.rgba(base.r, base.g, base.b, 0.24)) : base))
    readonly property color ink: customInk !== "" ? customInk : (shape === "outline" || tinted || fill === "glass" ? look.text : (mine ? (customBg !== "" ? inkFor(base) : (fill === "gradient" ? "#ffffff" : look.accentInk)) : (nativeBg !== "" ? inkFor(base) : look.text)))
    readonly property color softInk: Qt.rgba(ink.r, ink.g, ink.b, 0.72)
    readonly property color borderColorOf: { const v = mine ? (settings.outBorderColor || settings.bubbleBorderColor) : settings.bubbleBorderColor; return /^#[0-9a-fA-F]{6}$/.test(v) ? v : (shape === "outline" && mine ? base : Qt.rgba(ink.r, ink.g, ink.b, 0.65)) }
    readonly property real tailRadius: Math.min(4, baseRadius)

}
