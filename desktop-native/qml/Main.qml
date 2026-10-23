import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ApplicationWindow {
    id: win
    width: 1100; height: 720; minimumWidth: 480; minimumHeight: 420
    visible: true
    title: "Pager"
    color: look.bg

    // Narrow windows show one thing at a time (the list, or the chat), wide ones show both.
    readonly property bool wide: width >= 760
    property bool showingChat: false

    // Coming back to the window counts as reading what arrived while it was behind.
    Connections { target: Qt.application; function onStateChanged() { core.setActive(Qt.application.state === Qt.ApplicationActive) } }

    Loader {
        anchors.fill: parent
        sourceComponent: core.starting ? splash : (core.signedIn ? main : login)
    }
    Component { id: splash; Rectangle { color: look.bg; Label { anchors.centerIn: parent; text: "Pager"; color: look.muted; font.pixelSize: Math.round(22 * look.textScale) } } }
    Component { id: login; Login { } }
    Component {
        id: main
        RowLayout {
            spacing: 0
            RoomList {
                Layout.preferredWidth: win.wide ? 340 : win.width
                Layout.fillHeight: true
                visible: win.wide || !win.showingChat
                onOpened: win.showingChat = true
            }
            Rectangle { Layout.fillHeight: true; width: 1; color: look.line; visible: win.wide }
            Chat {
                Layout.fillWidth: true; Layout.fillHeight: true
                visible: win.wide || win.showingChat
                showBack: !win.wide
                onBack: win.showingChat = false
            }
        }
    }
}
