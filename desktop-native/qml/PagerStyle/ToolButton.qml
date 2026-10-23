import QtQuick
import QtQuick.Controls.Basic as B

B.ToolButton {
    id: control
    implicitWidth: Math.max(36, implicitContentWidth + leftPadding + rightPadding); implicitHeight: 36
    contentItem: Text { text: control.text; font.pixelSize: 18; color: control.hovered ? look.text : look.muted; horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter }
    background: Rectangle { radius: width / 2; color: control.down ? look.line : (control.hovered ? look.panel2 : "transparent") }
    HoverHandler { cursorShape: Qt.PointingHandCursor }
}
