import QtQuick
import QtQuick.Controls

// A flat round button for an icon (close, back, more...): no grey box, a soft circle on hover. [icon] is a name from the icon set; [symbol] a plain character.
ToolButton {
    id: b
    property string ico: ""
    property string symbol: ""
    property color tint: look.muted
    property int iconSize: 20
    property int glyphSize: 18
    implicitWidth: 38; implicitHeight: 38
    contentItem: Item {
        Icon { anchors.centerIn: parent; visible: b.ico.length > 0; name: b.ico; size: b.iconSize; color: b.hovered ? look.text : b.tint }
        Text { anchors.centerIn: parent; visible: b.ico.length === 0; text: b.symbol; color: b.hovered ? look.text : b.tint; font.pixelSize: b.glyphSize }
    }
    background: Rectangle { radius: width / 2; color: b.down ? look.line : (b.hovered ? look.panel2 : "transparent") }
    HoverHandler { cursorShape: Qt.PointingHandCursor }
}
