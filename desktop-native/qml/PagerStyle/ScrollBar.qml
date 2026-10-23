import QtQuick
import QtQuick.Controls.Basic as B

// A slim bar that is only there while you scroll (or hover).
B.ScrollBar {
    id: control
    implicitWidth: 10; implicitHeight: 10
    padding: 2; minimumSize: 0.08
    contentItem: Rectangle {
        implicitWidth: 6; implicitHeight: 6; radius: 3; color: look.muted
        opacity: control.pressed ? 0.7 : (control.active || control.hovered ? 0.45 : 0)
        Behavior on opacity { NumberAnimation { duration: 180 } }
    }
    background: Item { }
    HoverHandler { id: hh }
}
