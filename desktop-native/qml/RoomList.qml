import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Rectangle {
    id: pane
    color: look.panel
    signal opened()
    Recovery { id: recovery }
    Accounts { id: accounts }
    Admin { id: admin }
    Component.onCompleted: if (startupDialog === "settings") Qt.callLater(settings.open); else if (startupDialog === "accounts") Qt.callLater(accounts.open); else if (startupDialog === "admin") Qt.callLater(admin.open)
    Settings { id: settings; onRestoreRequested: recovery.open() }

    ColumnLayout {
        anchors.fill: parent
        spacing: 0
        RowLayout {
            Layout.fillWidth: true; Layout.margins: 16; Layout.bottomMargin: 8
            Label { text: "Pages"; font.pixelSize: Math.round(26 * look.textScale); font.weight: Font.Bold; color: look.text; Layout.fillWidth: true }
            ToolButton {
                id: menuBtn; text: "⋮"; font.pixelSize: Math.round(20 * look.textScale)
                contentItem: Label { text: menuBtn.text; color: look.muted; horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter; font.pixelSize: Math.round(20 * look.textScale) }
                background: Rectangle { color: "transparent" }
                onClicked: menu.popup()
                Menu {
                    id: menu
                    MenuItem { text: core.user; enabled: false }
                    MenuItem { text: "Chat accounts…"; onTriggered: accounts.open() }
                    MenuItem { text: "Server admin…"; visible: core.isAdmin; height: visible ? implicitHeight : 0; onTriggered: admin.open() }
                    MenuItem { text: "Settings"; onTriggered: settings.open() }
                    MenuItem { text: "Restore old messages…"; onTriggered: recovery.open() }
                    MenuItem { text: "Sign out"; onTriggered: core.logout() }
                }
            }
        }
        ListView {
            id: list
            Layout.fillWidth: true; Layout.fillHeight: true
            clip: true
            model: core.rooms
            boundsBehavior: Flickable.StopAtBounds
            ScrollBar.vertical: ScrollBar { }
            delegate: Rectangle {
                width: list.width; height: 68
                color: core.currentRoom === roomId ? Qt.rgba(look.accent.r, look.accent.g, look.accent.b, 0.16) : (hover.hovered ? look.panel2 : "transparent")
                HoverHandler { id: hover }
                TapHandler { onTapped: { core.openRoom(roomId); pane.opened() } }
                RowLayout {
                    anchors.fill: parent; anchors.leftMargin: 14; anchors.rightMargin: 14; spacing: 12
                    Avatar { letter: model.letter; seed: model.name; size: 46 }
                    ColumnLayout {
                        Layout.fillWidth: true; spacing: 2
                        RowLayout {
                            Layout.fillWidth: true
                            Label { text: model.name; color: look.text; font.pixelSize: Math.round(15 * look.textScale); font.weight: unread > 0 ? Font.Bold : Font.DemiBold; elide: Text.ElideRight; Layout.fillWidth: true }
                            Label { text: model.time; color: unread > 0 ? look.accent : look.muted; font.pixelSize: Math.round(12 * look.textScale) }
                        }
                        RowLayout {
                            Layout.fillWidth: true
                            Label { text: model.preview; color: look.muted; font.pixelSize: Math.round(13 * look.textScale); elide: Text.ElideRight; maximumLineCount: 1; Layout.fillWidth: true }
                            Rectangle {
                                visible: unread > 0; radius: 10; height: 20; width: Math.max(20, badge.implicitWidth + 12); color: look.accent
                                Label { id: badge; anchors.centerIn: parent; text: unread > 99 ? "99+" : unread; color: look.accentInk; font.pixelSize: Math.round(12 * look.textScale); font.weight: Font.Bold }
                            }
                        }
                    }
                }
            }
            Label { anchors.centerIn: parent; visible: list.count === 0; text: "Loading your chats…"; color: look.muted }
        }
    }
}
