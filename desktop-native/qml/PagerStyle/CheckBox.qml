import QtQuick
import QtQuick.Controls.Basic as B

B.CheckBox {
    id: control
    spacing: 10
    contentItem: Text { text: control.text; font.pixelSize: Math.round(14 * look.textScale); color: look.text; verticalAlignment: Text.AlignVCenter; leftPadding: control.indicator.width + control.spacing; wrapMode: Text.Wrap }
    indicator: Rectangle {
        x: control.leftPadding; y: (control.height - height) / 2; width: 20; height: 20; radius: 6
        color: control.checked ? look.accent : look.panel2; border.width: control.checked ? 0 : 1; border.color: look.line
        Text { anchors.centerIn: parent; visible: control.checked; text: "✓"; color: look.accentInk; font.pixelSize: 13; font.bold: true }
    }
    HoverHandler { cursorShape: Qt.PointingHandCursor }
}
