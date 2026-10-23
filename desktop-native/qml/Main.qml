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
    property bool infoOpen: false
    readonly property bool roomy: width >= 1040          // room for the info panel beside the chat

    // Coming back to the window counts as reading what arrived while it was behind.
    Connections { target: Qt.application; function onStateChanged() { core.setActive(Qt.application.state === Qt.ApplicationActive) } }

    Component.onCompleted: { if (startupDialog === "info") infoOpen = true }
    Recovery { id: recovery }
    NewChat { id: newChat }
    SearchDialog { id: searchDlg; onChosen: (roomId, eventId) => core.openAt(roomId, eventId) }
    Connections { target: core; function onJumpRequested(id) { win.pendingJump = id } }
    property string pendingJump: ""
    Connections { target: core; function onRoomOpened(id) { win.showingChat = true } }
    Shortcut { sequence: "Ctrl+N"; onActivated: newChat.open() }
    Shortcut { sequence: "Ctrl+Shift+F"; onActivated: searchDlg.openFor("", "", "") }
    Shortcut { sequence: "Ctrl+F"; onActivated: searchDlg.openFor(core.currentRoom, core.currentName, "") }
    Shortcut { sequence: "Ctrl+Q"; onActivated: Qt.quit() }
    Shortcut { sequence: "Ctrl+I"; onActivated: win.infoOpen = !win.infoOpen }

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
                onRestoreRequested: recovery.open()
                onNewChat: newChat.open()
                onSearchRequested: (text) => searchDlg.openFor("", "", text)
            }
            Rectangle { Layout.fillHeight: true; width: 1; color: look.line; visible: win.wide }
            Chat {
                Layout.fillWidth: true; Layout.fillHeight: true
                visible: (win.wide || win.showingChat) && !(win.infoOpen && !win.roomy)
                showBack: !win.wide
                infoOpen: win.infoOpen
                onBack: win.showingChat = false
                onToggleInfo: win.infoOpen = !win.infoOpen
                onRestoreRequested: recovery.open()
                onSearchRequested: searchDlg.openFor(core.currentRoom, core.currentName, "")
                jumpTarget: win.pendingJump
            }
            InfoPanel {
                Layout.preferredWidth: win.roomy ? 310 : win.width; Layout.fillHeight: true
                visible: win.infoOpen && core.currentRoom.length > 0 && (win.roomy || win.showingChat || win.wide)
                onCloseRequested: win.infoOpen = false
            }
        }
    }
}
