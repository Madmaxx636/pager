import QtQuick
import QtQuick.Controls.Basic as B

B.MenuSeparator {
    implicitHeight: 9
    contentItem: Rectangle { implicitHeight: 1; color: look.line; anchors.centerIn: parent; width: parent.width - 16; height: 1 }
}
