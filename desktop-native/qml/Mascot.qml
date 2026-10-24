import QtQuick

// Pager's mascot, the little black pager with a green screen, bobbing about (and shaking when it is busy), like the web app's.
Item {
    id: m
    property real size: 120
    property string mood: "idle"          // idle (bobbing), ring (shaking: working on something)
    implicitWidth: size; implicitHeight: size
    Image {
        id: img
        width: m.size; height: m.size
        source: "image://icon/mascot/" + String(look.accent).substring(1, 7)
        sourceSize.width: Math.round(m.size * 2); sourceSize.height: Math.round(m.size * 2); smooth: true
        transformOrigin: Item.Bottom
        SequentialAnimation on y { running: look.motion && m.mood === "idle" && m.visible; loops: Animation.Infinite
            NumberAnimation { to: -m.size * 0.03; duration: 1100; easing.type: Easing.InOutSine } NumberAnimation { to: 0; duration: 1100; easing.type: Easing.InOutSine } }
        SequentialAnimation on rotation { running: look.motion && m.mood === "ring" && m.visible; loops: Animation.Infinite
            NumberAnimation { to: -4; duration: 250; easing.type: Easing.InOutSine } NumberAnimation { to: 4; duration: 250; easing.type: Easing.InOutSine } }
    }
}
