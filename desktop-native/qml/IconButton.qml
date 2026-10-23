import QtQuick
import QtQuick.Controls

// A flat round button for a symbol (close, back, more...): no grey box, a soft circle on hover.
ToolButton {
    id: b
    property string symbol: ""
    property color tint: look.muted
    property int glyphSize: 18
    implicitWidth: 36; implicitHeight: 36
    contentItem: Label { text: b.symbol; color: b.hovered ? look.text : b.tint; font.pixelSize: b.glyphSize; horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter }
    background: Rectangle { radius: width / 2; color: b.down ? look.line : (b.hovered ? look.panel2 : "transparent") }
    HoverHandler { cursorShape: Qt.PointingHandCursor }
}
