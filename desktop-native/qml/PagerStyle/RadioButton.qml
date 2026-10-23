import QtQuick
import QtQuick.Controls.Basic as B

B.RadioButton {
    id: control
    spacing: 10
    contentItem: Text { text: control.text; font.pixelSize: Math.round(14 * look.textScale); color: look.text; verticalAlignment: Text.AlignVCenter; leftPadding: control.indicator.width + control.spacing; wrapMode: Text.Wrap }
    indicator: Rectangle {
        x: control.leftPadding; y: (control.height - height) / 2; width: 20; height: 20; radius: 10; color: "transparent"; border.width: 2; border.color: control.checked ? look.accent : look.muted
        Rectangle { anchors.centerIn: parent; width: 10; height: 10; radius: 5; color: look.accent; visible: control.checked }
    }
    HoverHandler { cursorShape: Qt.PointingHandCursor }
}
