import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "Networks.js" as N

// The left side: your chats, with search, tabs and a menu for each chat.
Rectangle {
    id: pane
    color: look.panel
    signal opened()
    signal restoreRequested()
    signal newChat()
    property string menuRoom: ""
    property var menuInfo: ({})

    Component.onCompleted: {
        if (startupDialog === "settings") Qt.callLater(settings.open); else if (startupDialog === "accounts") Qt.callLater(accounts.open); else if (startupDialog === "admin") Qt.callLater(admin.open)
    }
    Accounts { id: accounts }
    Admin { id: admin }
    Settings { id: settings; onRestoreRequested: pane.restoreRequested() }

    function showMenu(id) { menuRoom = id; menuInfo = core.roomInfo(id); chatMenu.popup() }

    ColumnLayout {
        anchors.fill: parent
        spacing: 0
        RowLayout {
            Layout.fillWidth: true; Layout.margins: 14; Layout.bottomMargin: 8; spacing: 6
            Label { text: "Pages"; font.pixelSize: Math.round(26 * look.textScale); font.weight: Font.Bold; color: look.text; Layout.fillWidth: true }
            ToolButton {
                id: composeBtn; text: "✎"; onClicked: pane.newChat(); ToolTip.text: "New chat"; ToolTip.visible: hovered; ToolTip.delay: 600
                contentItem: Label { text: composeBtn.text; color: look.text; horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter; font.pixelSize: 20 }
                background: Rectangle { radius: 18; color: composeBtn.hovered ? look.panel2 : "transparent" }
            }
            ToolButton {
                id: menuBtn; text: "⋮"; onClicked: menu.popup()
                contentItem: Label { text: menuBtn.text; color: look.muted; horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter; font.pixelSize: 20 }
                background: Rectangle { radius: 18; color: menuBtn.hovered ? look.panel2 : "transparent" }
                Menu {
                    id: menu
                    MenuItem { text: core.user; enabled: false }
                    MenuItem { text: "Mark all as read"; onTriggered: core.markAllRead() }
                    MenuItem { text: "Chat accounts…"; onTriggered: accounts.open() }
                    MenuItem { text: "Server admin…"; visible: core.isAdmin; height: visible ? implicitHeight : 0; onTriggered: admin.open() }
                    MenuItem { text: "Settings"; onTriggered: settings.open() }
                    MenuItem { text: "Restore old messages…"; onTriggered: pane.restoreRequested() }
                    MenuItem { text: "Sign out"; onTriggered: core.logout() }
                }
            }
        }
        // search
        TextField {
            id: search
            Layout.fillWidth: true; Layout.leftMargin: 14; Layout.rightMargin: 14; Layout.bottomMargin: 8
            placeholderText: "Search chats and messages"; placeholderTextColor: look.muted; color: look.text; selectByMouse: true
            font.pixelSize: Math.round(14 * look.textScale); leftPadding: 14; rightPadding: 30
            background: Rectangle { radius: 18; color: look.panel2 }
            onTextChanged: core.filter(core.tab, text)
            Keys.onEscapePressed: { text = ""; list.forceActiveFocus() }
            Label { visible: search.text.length > 0; text: "✕"; color: look.muted; anchors.right: parent.right; anchors.rightMargin: 10; anchors.verticalCenter: parent.verticalCenter; TapHandler { onTapped: search.text = "" } }
        }
        // tabs
        Flickable {
            Layout.fillWidth: true; Layout.preferredHeight: 38; Layout.bottomMargin: 4
            contentWidth: tabRow.width + 28; contentHeight: height; clip: true; flickableDirection: Flickable.HorizontalFlick; boundsBehavior: Flickable.StopAtBounds
            Row {
                id: tabRow; x: 14; spacing: 6
                Repeater {
                    model: [["inbox", "Inbox"], ["unread", "Unread"], ["pinned", "Pinned"], ["low", "Low priority"], ["archive", "Archive"]].concat(core.labels.map(l => ["label:" + l, l]))
                    delegate: Rectangle {
                        readonly property bool on: core.tab === modelData[0]
                        height: 32; width: tl.implicitWidth + 24 + (modelData[0] === "unread" && core.unreadChats > 0 ? badge.width + 6 : 0); radius: 16
                        color: on ? look.accent : look.panel2
                        Row {
                            anchors.centerIn: parent; spacing: 6
                            Label { id: tl; text: modelData[1]; color: parent.parent.on ? look.accentInk : look.text; font.pixelSize: Math.round(13 * look.textScale); font.weight: parent.parent.on ? Font.DemiBold : Font.Normal }
                            Rectangle { id: badge; visible: modelData[0] === "unread" && core.unreadChats > 0; height: 18; width: Math.max(18, bl.implicitWidth + 10); radius: 9
                                color: parent.parent.on ? look.accentInk : look.accent
                                Label { id: bl; anchors.centerIn: parent; text: core.unreadChats; font.pixelSize: 11; font.weight: Font.Bold; color: parent.parent.parent.on ? look.accent : look.accentInk } }
                        }
                        TapHandler { onTapped: core.filter(modelData[0], search.text) }
                    }
                }
            }
        }
        // the chats
        ListView {
            id: list
            Layout.fillWidth: true; Layout.fillHeight: true
            clip: true; model: core.rooms; boundsBehavior: Flickable.StopAtBounds; cacheBuffer: 400; reuseItems: true
            ScrollBar.vertical: ScrollBar { }
            SmoothWheel { view: list }
            delegate: Rectangle {
                id: row
                width: list.width; height: 70
                readonly property bool current: core.currentRoom === roomId
                color: current ? Qt.rgba(look.accent.r, look.accent.g, look.accent.b, 0.16) : (hover.hovered ? look.panel2 : "transparent")
                HoverHandler { id: hover }
                TapHandler { acceptedButtons: Qt.LeftButton; onTapped: { core.openRoom(roomId); pane.opened() } }
                TapHandler { acceptedButtons: Qt.RightButton; onTapped: pane.showMenu(roomId) }
                TapHandler { acceptedDevices: PointerDevice.TouchScreen; longPressThreshold: 0.5; onLongPressed: pane.showMenu(roomId) }
                RowLayout {
                    anchors.fill: parent; anchors.leftMargin: 14; anchors.rightMargin: 14; spacing: 12
                    Avatar { source: model.avatar; letter: model.letter; seed: model.name; size: 48; network: model.network }
                    ColumnLayout {
                        Layout.fillWidth: true; spacing: 3
                        RowLayout {
                            Layout.fillWidth: true; spacing: 4
                            Label { text: model.name; color: look.text; font.pixelSize: Math.round(15 * look.textScale); font.weight: unread > 0 || markedUnread ? Font.Bold : Font.DemiBold; elide: Text.ElideRight; Layout.fillWidth: true }
                            Label { visible: pinned; text: "📌"; font.pixelSize: 11 }
                            Label { visible: muted; text: "🔕"; font.pixelSize: 11 }
                            Label { text: model.time; color: unread > 0 || markedUnread ? look.accent : look.muted; font.pixelSize: Math.round(12 * look.textScale) }
                        }
                        RowLayout {
                            Layout.fillWidth: true; spacing: 6
                            Label { visible: model.tick === 3 || model.tick === 5 || model.tick === 4; text: model.tick === 5 ? "✓✓" : "✓"; color: model.tick === 5 ? look.accent : look.muted; font.pixelSize: 12 }
                            Label {
                                text: model.typing.length ? model.typing : model.preview; elide: Text.ElideRight; maximumLineCount: 1; Layout.fillWidth: true
                                color: model.typing.length ? look.accent : (unread > 0 ? look.text : look.muted); font.pixelSize: Math.round(13 * look.textScale); font.italic: model.typing.length > 0
                            }
                            Label { visible: mention; text: "@"; color: look.accentInk; font.bold: true; font.pixelSize: 11; leftPadding: 5; rightPadding: 5; background: Rectangle { radius: 9; color: look.accent } }
                            Rectangle {
                                visible: unread > 0 || markedUnread; radius: 10; height: 20; width: Math.max(20, badgeText.implicitWidth + 12); color: muted ? look.muted : look.accent
                                Label { id: badgeText; anchors.centerIn: parent; text: unread > 0 ? (unread > 99 ? "99+" : unread) : "●"; color: look.accentInk; font.pixelSize: 12; font.weight: Font.Bold }
                            }
                        }
                    }
                }
            }
            Label {
                anchors.centerIn: parent; visible: list.count === 0 && !core.loading; width: parent.width - 40; horizontalAlignment: Text.AlignHCenter; wrapMode: Text.Wrap; color: look.muted
                text: core.search.length ? "No matches" : core.tab === "unread" ? "You're all caught up" : core.tab === "archive" ? "Nothing archived" : core.tab === "pinned" ? "Pin a chat to keep it here" : core.tab === "low" ? "No low-priority chats" : "No chats here yet"
            }
        }
        Label {   // first load of a big account takes a while: say so instead of showing nothing
            visible: core.loading && list.count === 0
            Layout.fillWidth: true; Layout.margins: 16; wrapMode: Text.Wrap; color: look.muted; font.pixelSize: Math.round(14 * look.textScale)
            text: "Loading your chats… The first time can take a minute or two."
        }
        Label {
            visible: core.problem.length > 0 && list.count === 0
            Layout.fillWidth: true; Layout.margins: 16; wrapMode: Text.Wrap; color: look.danger; font.pixelSize: Math.round(12 * look.textScale)
            text: core.problem
        }
    }

    Menu {
        id: chatMenu
        MenuItem { text: pane.menuInfo.unread > 0 || pane.menuInfo.markedUnread ? "Mark as read" : "Mark as unread"; onTriggered: (pane.menuInfo.unread > 0 || pane.menuInfo.markedUnread) ? core.markRead(pane.menuRoom) : core.markUnread(pane.menuRoom, true) }
        MenuItem { text: pane.menuInfo.pinned ? "Unpin" : "Pin"; onTriggered: core.pin(pane.menuRoom, !pane.menuInfo.pinned) }
        MenuItem { text: pane.menuInfo.muted ? "Unmute" : "Mute"; onTriggered: core.setMuted(pane.menuRoom, !pane.menuInfo.muted) }
        MenuItem { text: pane.menuInfo.archived ? "Move to inbox" : "Archive"; onTriggered: core.archive(pane.menuRoom, !pane.menuInfo.archived) }
        MenuItem { text: pane.menuInfo.lowPriority ? "Move to inbox" : "Low priority"; onTriggered: core.setLowPriority(pane.menuRoom, !pane.menuInfo.lowPriority) }
        MenuItem { text: "Labels…"; onTriggered: labelsDialog.openFor(pane.menuRoom) }
        MenuItem { text: "Rename…"; visible: !!pane.menuInfo.isGroup; height: visible ? implicitHeight : 0; onTriggered: renameDialog.openFor(pane.menuRoom, pane.menuInfo.name) }
        MenuSeparator { }
        MenuItem { text: "Delete chat…"; onTriggered: deleteDialog.openFor(pane.menuRoom, pane.menuInfo.name, pane.menuInfo.network) }
    }
    Dialog {
        id: deleteDialog
        property string room; property string label; property string net
        function openFor(r, n, network) { room = r; label = n; net = network; sourceToo.checked = false; open() }
        modal: true; anchors.centerIn: Overlay.overlay; width: Math.min(400, Overlay.overlay ? Overlay.overlay.width - 32 : 400); title: "Delete this chat?"; standardButtons: Dialog.Cancel | Dialog.Ok
        background: Rectangle { color: look.panel; radius: 14; border.color: look.line }
        contentItem: ColumnLayout { spacing: 10
            Label { Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.text; text: "“" + deleteDialog.label + "” leaves Pager. Messages stay on the other app unless you also delete it there." }
            CheckBox { id: sourceToo; visible: deleteDialog.net !== "matrix" && deleteDialog.net !== ""; text: "Also delete it on " + N.meta(deleteDialog.net).label; palette.windowText: look.text }
        }
        onAccepted: core.leaveRoom(room, sourceToo.checked)
    }
    Dialog {
        id: renameDialog
        property string room
        function openFor(r, n) { room = r; nameField.text = n; open(); nameField.forceActiveFocus(); nameField.selectAll() }
        modal: true; anchors.centerIn: Overlay.overlay; width: Math.min(380, Overlay.overlay ? Overlay.overlay.width - 32 : 380); title: "Rename chat"; standardButtons: Dialog.Cancel | Dialog.Ok
        background: Rectangle { color: look.panel; radius: 14; border.color: look.line }
        TextField { id: nameField; width: parent.width; color: look.text; onAccepted: renameDialog.accept(); background: Rectangle { color: look.bg; radius: 8; border.color: look.line } }
        onAccepted: core.renameRoom(room, nameField.text)
    }
    Dialog {
        id: labelsDialog
        property string room; property var have: []
        function openFor(r) { room = r; have = core.roomInfo(r).labels; newLabel.text = ""; open() }
        modal: true; anchors.centerIn: Overlay.overlay; width: Math.min(380, Overlay.overlay ? Overlay.overlay.width - 32 : 380); title: "Labels"; standardButtons: Dialog.Close
        background: Rectangle { color: look.panel; radius: 14; border.color: look.line }
        contentItem: ColumnLayout { spacing: 6
            Repeater {
                model: core.labels.concat(labelsDialog.have.filter(l => core.labels.indexOf(l) < 0))
                delegate: CheckBox { text: modelData; checked: labelsDialog.have.indexOf(modelData) >= 0; palette.windowText: look.text
                    onClicked: { if (checked) core.addLabel(labelsDialog.room, modelData); else core.removeLabel(labelsDialog.room, modelData); labelsDialog.have = core.roomInfo(labelsDialog.room).labels } }
            }
            RowLayout { Layout.fillWidth: true
                TextField { id: newLabel; Layout.fillWidth: true; placeholderText: "New label"; color: look.text; background: Rectangle { color: look.bg; radius: 8; border.color: look.line }
                    onAccepted: addBtn.clicked() }
                Button { id: addBtn; text: "Add"; enabled: newLabel.text.trim().length > 0; onClicked: { core.addLabel(labelsDialog.room, newLabel.text.trim()); newLabel.text = ""; labelsDialog.have = core.roomInfo(labelsDialog.room).labels } }
            }
        }
    }
}
