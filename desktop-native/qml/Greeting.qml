import QtQuick
import QtQuick.Controls
import "Greetings.js" as G

// The pager says something silly on its green screen when the app opens (once per run). Click to skip.
Rectangle {
    id: root
    property bool shown: false
    property string text: ""
    anchors.fill: parent; z: 100; color: look.bg; opacity: 0; visible: opacity > 0
    function hello() { if (shown || !settings.greetings) return; shown = true; text = G.pick(); opacity = 1; hold.restart() }
    Behavior on opacity { NumberAnimation { duration: settings.reduceMotion ? 0 : 350 } }
    Timer { id: hold; interval: 2400; onTriggered: root.opacity = 0 }
    Column { anchors.centerIn: parent; spacing: 22
        Image { anchors.horizontalCenter: parent.horizontalCenter; source: "qrc:/pager.svg"; sourceSize.width: 300; sourceSize.height: 300; width: 150; height: 150; smooth: true }
        Rectangle { anchors.horizontalCenter: parent.horizontalCenter; width: Math.min(root.width - 60, lcd.implicitWidth + 44); height: 52; radius: 10; color: "#9bd9a1"; border.width: 3; border.color: "#2b3a2e"
            Label { id: lcd; anchors.centerIn: parent; text: root.text; color: "#183422"; font.family: "monospace"; font.bold: true; font.pixelSize: 20 } } }
    TapHandler { onTapped: { hold.stop(); root.opacity = 0 } }
}
