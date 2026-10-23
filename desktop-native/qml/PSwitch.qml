import QtQuick
import QtQuick.Controls

// An on/off switch in Pager's colours.
Switch {
    id: sw
    implicitWidth: 46; implicitHeight: 28
    indicator: Rectangle {
        x: sw.leftPadding; y: (sw.height - height) / 2; width: 44; height: 26; radius: 13
        color: sw.checked ? look.accent : look.line
        Behavior on color { ColorAnimation { duration: 120 } }
        Rectangle { y: 3; x: sw.checked ? parent.width - width - 3 : 3; width: 20; height: 20; radius: 10; color: sw.checked ? look.accentInk : look.panel
            Behavior on x { NumberAnimation { duration: 120; easing.type: Easing.OutQuad } } }
    }
    contentItem: Item { }
    HoverHandler { cursorShape: Qt.PointingHandCursor }
}
