import QtQuick
import QtQuick.Controls.Basic as B

B.ProgressBar {
    id: control
    implicitHeight: 6
    background: Rectangle { radius: 3; color: look.line }
    contentItem: Item { Rectangle { width: control.visualPosition * parent.width; height: parent.height; radius: 3; color: look.accent } }
}
