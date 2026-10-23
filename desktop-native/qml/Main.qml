import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQml.Models
import "Shortcuts.js" as SC

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
    WhenDialog { id: snoozeDialog; heading: "Snooze until"; onPicked: (ms) => core.snooze(core.currentRoom, ms) }
    function runShortcut(id) {
        const info = core.roomInfo(core.currentRoom), has = core.currentRoom.length > 0
        switch (id) {
        case "palette": palette.open(); break
        case "help": if (sidebarRef) sidebarRef.openSettingsPage("shortcuts"); break
        case "newChat": newChat.open(); break
        case "search": searchDlg.openFor("", "", ""); break
        case "inChatSearch": if (has) searchDlg.openFor(core.currentRoom, core.currentName, ""); break
        case "settings": rootSettings(); break
        case "prevChat": core.stepChat(-1, false); break
        case "nextChat": core.stepChat(1, false); break
        case "nextUnread": core.stepChat(1, true); break
        case "archive": if (has) core.archive(core.currentRoom, !info.archived); break
        case "markUnread": if (has) core.markUnread(core.currentRoom, true); break
        case "mute": if (has) core.setMuted(core.currentRoom, !info.muted); break
        case "pin": if (has) core.pin(core.currentRoom, !info.pinned); break
        case "snooze": if (has) snoozeDialog.open(); break
        case "info": win.infoOpen = !win.infoOpen; break
        case "quit": Qt.quit(); break
        }
    }
    signal settingsRequested()
    property var sidebarRef: null
    function rootSettings() { if (sidebarRef) sidebarRef.openSettings() }
    Instantiator {
        model: SC.ALL
        delegate: Shortcut { sequence: SC.keysFor(modelData.id, settings.shortcuts); enabled: core.signedIn; onActivated: win.runShortcut(modelData.id) }
    }
    NewChat { id: newChat }
    CommandBar { id: palette; onNewChat: newChat.open(); onSearchAll: searchDlg.openFor("", "", ""); onOpenSettingsPage: (id) => { if (sidebarRef) sidebarRef.openSettingsPage(id) }; onSnoozeCurrent: snoozeDialog.open() }
    AttentionOverlay { id: attention; onOpenChat: (roomId) => { core.openRoom(roomId); win.showingChat = true } }
    Connections { target: core; function onAttention(roomId, chat, sender, kind) { attention.raise(roomId, chat, sender, kind) } }
    SearchDialog { id: searchDlg; onChosen: (roomId, eventId) => core.openAt(roomId, eventId) }
    Connections { target: core; function onJumpRequested(id) { win.pendingJump = id } }
    property string pendingJump: ""
    Connections { target: core; function onRoomOpened(id) { win.showingChat = true } }



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
                id: sidebar
                Component.onCompleted: win.sidebarRef = sidebar
                Layout.preferredWidth: win.wide ? Math.max(280, Math.min(settings.sidebarWidth, win.width * 0.45)) : win.width
                Layout.fillHeight: true
                visible: win.wide || !win.showingChat
                onOpened: win.showingChat = true
                onRestoreRequested: recovery.open()
                onNewChat: newChat.open()
                onSearchRequested: (text) => searchDlg.openFor("", "", text)
            }
            Rectangle { Layout.fillHeight: true; width: 1; color: look.line; visible: win.wide }
            Chat {
                id: chatPane
                Layout.fillWidth: true; Layout.fillHeight: true
                visible: (win.wide || win.showingChat) && !(win.infoOpen && !win.roomy)
                showBack: !win.wide
                infoOpen: win.infoOpen
                onBack: win.showingChat = false
                onToggleInfo: win.infoOpen = !win.infoOpen
                onRestoreRequested: recovery.open()
                onOpenStickerSettings: if (sidebarRef) sidebarRef.openSettingsPage("media")
                onSearchRequested: searchDlg.openFor(core.currentRoom, core.currentName, "")
                jumpTarget: win.pendingJump
            }
            InfoPanel {
                Layout.preferredWidth: win.roomy ? 330 : 0; Layout.fillWidth: !win.roomy; Layout.fillHeight: true
                visible: win.infoOpen && core.currentRoom.length > 0 && (win.roomy || win.showingChat || win.wide)
                onCloseRequested: win.infoOpen = false
                onViewImage: (id) => chatPane.openViewer(id)
                onSearchInChat: searchDlg.openFor(core.currentRoom, core.currentName, "")
            }
        }
    }
}
