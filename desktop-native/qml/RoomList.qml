import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "Networks.js" as N

// The left side, like the web app: the logo and "Pages", search, filters, tabs, a row of pinned chats and the chats.
Rectangle {
    id: pane
    color: look.panel
    signal opened()
    signal restoreRequested()
    signal newChat()
    signal searchRequested(string text)
    property string menuRoom: ""
    property var menuInfo: ({})

    Component.onCompleted: {
        if (settings.defaultTab !== "inbox") core.filter(settings.defaultTab, "")
        if (startupDialog === "settings") Qt.callLater(settingsPage.open); else if (startupDialog === "accounts") Qt.callLater(accounts.open); else if (startupDialog === "admin") Qt.callLater(admin.open)
    }
    Accounts { id: accounts }
    Admin { id: admin }
    Settings { id: settingsPage; onRestoreRequested: pane.restoreRequested(); onAccountsRequested: accounts.open(); onAdminRequested: admin.open(); onOpenMessage: (r, e) => core.openAt(r, e) }
    FilterDialog { id: filterDialog }
    WhenDialog { id: snoozeDialog; heading: "Snooze until"; property string room; onPicked: (ms) => core.snooze(room, ms) }
    function openSettings() { settingsPage.open() }
    function showMenu(id) { menuRoom = id; menuInfo = core.roomInfo(id); chatMenu.popup() }

    ColumnLayout {
        anchors.fill: parent
        spacing: 0
        // ---- title
        RowLayout {
            Layout.fillWidth: true; Layout.leftMargin: 18; Layout.rightMargin: 10; Layout.topMargin: 12; Layout.bottomMargin: 4; spacing: 8
            Image { source: "qrc:/pager.svg"; sourceSize.width: 64; sourceSize.height: 64; Layout.preferredWidth: 32; Layout.preferredHeight: 32; smooth: true }
            ColumnLayout { spacing: 0
                Label { text: "Pages"; font.pixelSize: Math.round(26 * look.textScale); font.weight: Font.Bold; font.letterSpacing: -0.7; color: look.text }
                Label { visible: core.totalUnreadChats > 0; text: core.totalUnreadChats + " unread"; color: look.accent; font.pixelSize: Math.round(12 * look.textScale); Layout.topMargin: -2 } }
            Item { Layout.fillWidth: true }
            IconButton { ico: "square-pen"; onClicked: pane.newChat(); ToolTip.text: "Page someone (Ctrl+N)"; ToolTip.visible: hovered }
            IconButton { ico: "search"; onClicked: pane.searchRequested(""); ToolTip.text: "Search all messages"; ToolTip.visible: hovered }
            IconButton {
                id: menuBtn; ico: "ellipsis-vertical"; onClicked: menu.popup()
                Menu {
                    id: menu
                    MenuItem { text: core.user; enabled: false }
                    MenuItem { text: "Mark all as read"; onTriggered: core.markAllRead() }
                    MenuItem { text: "Starred messages"; onTriggered: settingsPage.openPage("starred") }
                    MenuSeparator { }
                    MenuItem { text: "Chat accounts…"; onTriggered: accounts.open() }
                    MenuItem { text: "Server admin…"; visible: core.isAdmin; height: visible ? implicitHeight : 0; onTriggered: admin.open() }
                    MenuItem { text: "Settings"; onTriggered: settingsPage.open() }
                    MenuItem { text: "Restore old messages…"; onTriggered: pane.restoreRequested() }
                    MenuSeparator { }
                    MenuItem { text: "Sign out"; onTriggered: core.logout() }
                }
            }
        }
        // ---- search and filters
        Rectangle {
            Layout.fillWidth: true; Layout.leftMargin: 14; Layout.rightMargin: 14; Layout.topMargin: 4; Layout.bottomMargin: 8; implicitHeight: 44; radius: 22; color: look.panel2
            RowLayout { anchors.fill: parent; anchors.leftMargin: 14; anchors.rightMargin: 6; spacing: 10
                Icon { name: "search"; size: 18; color: look.muted }
                TextField {
                    id: search
                    Layout.fillWidth: true; Layout.fillHeight: true; placeholderText: "Search pages"
                    background: Item { }
                    leftPadding: 0; topPadding: 0; bottomPadding: 0
                    onTextChanged: core.filter(core.tab, text)
                    Keys.onEscapePressed: { text = ""; list.forceActiveFocus() }
                }
                IconButton { visible: search.text.length > 0; ico: "x"; iconSize: 16; implicitWidth: 28; implicitHeight: 28; onClicked: search.text = "" }
                IconButton { visible: settings.showFilterBar; ico: "list-filter"; tint: core.filterCount > 0 ? look.accent : look.muted; onClicked: filterDialog.open(); ToolTip.text: "Filters"; ToolTip.visible: hovered
                    Rectangle { visible: core.filterCount > 0; width: 8; height: 8; radius: 4; color: look.accent; anchors.right: parent.right; anchors.top: parent.top; anchors.margins: 6 } }
            }
        }
        // ---- tabs
        Flickable {
            visible: settings.showFilterBar
            Layout.fillWidth: true; Layout.preferredHeight: tabFlow.height + 8
            contentWidth: width; contentHeight: height; clip: true; interactive: false
            Flow {
                id: tabFlow; x: 14; width: parent.width - 28; spacing: 6
                Repeater {
                    model: [["inbox", "Inbox", "inbox"], ["unread", "Unread", "message-square-dot"], ["low", "Low priority", "arrow-down-to-line"], ["archive", "Archive", "archive"]].concat(settings.showLabelsInFilterBar ? core.labels.map(l => ["label:" + l, l, "tag"]) : [])
                    delegate: Rectangle {
                        readonly property bool on: core.tab === modelData[0]
                        height: 34; width: tabRow.implicitWidth + 26; radius: 17
                        color: on ? look.accent : (th.hovered ? Qt.darker(look.panel2, look.dark ? 0.9 : 1.04) : look.panel2)
                        HoverHandler { id: th }
                        Row {
                            id: tabRow; anchors.centerIn: parent; spacing: 6
                            Icon { name: modelData[2]; size: 15; color: parent.parent.on ? look.accentInk : look.muted; anchors.verticalCenter: parent.verticalCenter }
                            Label { text: modelData[1]; color: parent.parent.on ? look.accentInk : look.muted; font.pixelSize: Math.round(13 * look.textScale); font.weight: Font.Medium; anchors.verticalCenter: parent.verticalCenter }
                            Label { visible: modelData[0] === "unread" && core.unreadChats > 0; text: core.unreadChats; font.weight: Font.Bold; font.pixelSize: Math.round(13 * look.textScale); color: parent.parent.on ? look.accentInk : look.muted; anchors.verticalCenter: parent.verticalCenter }
                        }
                        TapHandler { onTapped: core.filter(modelData[0], search.text) }
                        HoverHandler { cursorShape: Qt.PointingHandCursor }
                    }
                }
            }
        }
        // ---- the chats (with the pinned ones as a row on top)
        ListView {
            id: list
            Layout.fillWidth: true; Layout.fillHeight: true; Layout.topMargin: 2
            clip: true; model: core.rooms; boundsBehavior: Flickable.StopAtBounds; cacheBuffer: 400; reuseItems: true
            ScrollBar.vertical: ScrollBar { }
            SmoothWheel { view: list }
            header: Flickable {
                visible: core.pins.length > 0
                width: list.width; height: visible ? 100 : 0; contentWidth: pinRow.width + 8; contentHeight: height; clip: true; flickableDirection: Flickable.HorizontalFlick; boundsBehavior: Flickable.StopAtBounds
                Row {
                    id: pinRow; x: 8; y: 6; spacing: 2
                    Repeater {
                        model: core.pins
                        delegate: Rectangle {
                            width: 74; height: 88; radius: 14; color: pinHover.hovered || core.currentRoom === modelData.id ? look.panel2 : "transparent"
                            HoverHandler { id: pinHover }
                            Column { anchors.horizontalCenter: parent.horizontalCenter; y: 6; spacing: 5
                                Item { width: 54; height: 54; anchors.horizontalCenter: parent.horizontalCenter
                                    Avatar { anchors.centerIn: parent; size: 52; source: modelData.avatar; letter: modelData.name.length ? modelData.name[0].toUpperCase() : "?"; seed: modelData.name; network: settings.showNetworkBadges ? modelData.network : "" }
                                    Rectangle { visible: modelData.unread; width: 14; height: 14; radius: 7; color: modelData.muted ? look.muted : look.accent; border.width: 2.5; border.color: look.panel; anchors.right: parent.right; anchors.top: parent.top } }
                                Label { text: modelData.name; width: 70; horizontalAlignment: Text.AlignHCenter; elide: Text.ElideRight; font.pixelSize: Math.round(12 * look.textScale); font.weight: Font.Medium; color: look.text } }
                            TapHandler { acceptedButtons: Qt.LeftButton; onTapped: { core.openRoom(modelData.id); pane.opened() } }
                            TapHandler { acceptedButtons: Qt.RightButton; onTapped: pane.showMenu(modelData.id) }
                            TapHandler { acceptedDevices: PointerDevice.TouchScreen; longPressThreshold: 0.5; onLongPressed: pane.showMenu(modelData.id) }
                        }
                    }
                }
            }
            delegate: Rectangle {
                id: row
                width: list.width - 16; x: 8; height: settings.density === "compact" ? 58 : 70; radius: 14
                readonly property bool current: core.currentRoom === roomId
                readonly property bool isUnread: unread > 0 || markedUnread
                color: current ? Qt.rgba(look.accent.r, look.accent.g, look.accent.b, 0.15) : (hover.hovered ? look.panel2 : "transparent")
                HoverHandler { id: hover }
                TapHandler { acceptedButtons: Qt.LeftButton; onTapped: { core.openRoom(roomId); pane.opened() } }
                TapHandler { acceptedButtons: Qt.RightButton; onTapped: pane.showMenu(roomId) }
                TapHandler { acceptedDevices: PointerDevice.TouchScreen; longPressThreshold: 0.5; onLongPressed: pane.showMenu(roomId) }
                RowLayout {
                    anchors.fill: parent; anchors.leftMargin: 10; anchors.rightMargin: 10; spacing: 13
                    Item { visible: settings.showAvatars; Layout.preferredWidth: 48; Layout.preferredHeight: 48
                        Avatar { anchors.centerIn: parent; size: settings.density === "compact" ? 40 : 46; ring: row.isUnread && !muted; source: model.avatar; letter: model.letter; seed: model.name; network: settings.showNetworkBadges ? model.network : "" } }
                    ColumnLayout {
                        Layout.fillWidth: true; spacing: 1
                        RowLayout {
                            Layout.fillWidth: true; spacing: 6
                            Label { text: model.name; color: look.text; font.pixelSize: Math.round(15 * look.textScale); font.weight: row.isUnread ? Font.ExtraBold : Font.DemiBold; elide: Text.ElideRight; Layout.fillWidth: true }
                            Icon { visible: muted; name: "bell-off"; size: 13; color: look.muted }
                            Label { visible: !hover.hovered; text: model.time; color: row.isUnread && !muted ? look.accent : look.muted; font.pixelSize: Math.round(12 * look.textScale); font.weight: Font.Medium }
                        }
                        RowLayout {
                            Layout.fillWidth: true; spacing: 6
                            Icon { visible: model.tick >= 3; name: model.tick === 5 ? "check-check" : "check"; size: 14; color: model.tick === 5 ? look.accent : look.muted }
                            Label {
                                text: model.typing.length ? model.typing : (settings.showPreviews ? model.preview : ""); elide: Text.ElideRight; maximumLineCount: 1; Layout.fillWidth: true
                                color: model.typing.length ? look.accent : look.muted; font.pixelSize: Math.round(14 * look.textScale); font.italic: model.typing.length > 0
                            }
                            Rectangle { visible: mention; radius: 10; height: 20; width: 20; color: look.accent; Label { anchors.centerIn: parent; text: "@"; color: look.accentInk; font.bold: true; font.pixelSize: 12 } }
                            Rectangle {
                                visible: row.isUnread; radius: 10; height: unread > 0 ? 20 : 11; width: unread > 0 ? Math.max(20, badgeText.implicitWidth + 12) : 11; color: muted ? look.muted : look.accent
                                Label { id: badgeText; visible: unread > 0; anchors.centerIn: parent; text: unread > 99 ? "99+" : unread; color: look.accentInk; font.pixelSize: 12; font.weight: Font.Bold }
                            }
                        }
                    }
                }
                Row {   // quick actions on hover
                    visible: hover.hovered; anchors.right: parent.right; anchors.rightMargin: 10; anchors.top: parent.top; anchors.topMargin: 8; spacing: 2
                    Rectangle { width: 30; height: 28; radius: 9; color: qa1.hovered ? look.panel2 : look.panel; border.width: 1; border.color: look.line
                        Icon { anchors.centerIn: parent; name: row.isUnread ? "mail-open" : "message-square-dot"; size: 16; color: look.muted }
                        HoverHandler { id: qa1; cursorShape: Qt.PointingHandCursor }
                        TapHandler { onTapped: row.isUnread ? core.markRead(roomId) : core.markUnread(roomId, true) }
                        ToolTip.visible: qa1.hovered; ToolTip.text: row.isUnread ? "Mark read" : "Mark unread"; ToolTip.delay: 500 }
                    Rectangle { width: 30; height: 28; radius: 9; color: qa2.hovered ? look.panel2 : look.panel; border.width: 1; border.color: look.line
                        Icon { anchors.centerIn: parent; name: archived ? "archive-restore" : "archive"; size: 16; color: look.muted }
                        HoverHandler { id: qa2; cursorShape: Qt.PointingHandCursor }
                        TapHandler { onTapped: core.archive(roomId, !archived) }
                        ToolTip.visible: qa2.hovered; ToolTip.text: archived ? "Move to inbox" : "Archive"; ToolTip.delay: 500 }
                }
            }
            footer: Rectangle {
                visible: core.search.trim().length >= 2; width: list.width; height: visible ? 56 : 0; color: fh.hovered ? look.panel2 : "transparent"
                HoverHandler { id: fh }
                Row { anchors.verticalCenter: parent.verticalCenter; x: 18; spacing: 12
                    Rectangle { width: 36; height: 36; radius: 18; color: look.accent; Icon { anchors.centerIn: parent; name: "search"; size: 18; color: look.accentInk } }
                    Label { anchors.verticalCenter: parent.verticalCenter; text: "Search all messages for “" + core.search.trim() + "”"; color: look.text; elide: Text.ElideRight; width: list.width - 90 } }
                TapHandler { onTapped: pane.searchRequested(core.search.trim()) }
            }
            Column {
                anchors.centerIn: parent; visible: list.count === 0 && core.pins.length === 0 && !core.loading; width: parent.width - 40; spacing: 10
                Rectangle { anchors.horizontalCenter: parent.horizontalCenter; width: 78; height: 78; radius: 39; color: Qt.rgba(look.accent.r, look.accent.g, look.accent.b, 0.12)
                    Icon { anchors.centerIn: parent; name: core.tab === "archive" ? "archive" : core.tab === "unread" ? "check-check" : "inbox"; size: 34; color: look.accent } }
                Label { width: parent.width; horizontalAlignment: Text.AlignHCenter; wrapMode: Text.Wrap; color: look.text; font.weight: Font.DemiBold; font.pixelSize: Math.round(16 * look.textScale)
                    text: core.search.length || core.filterCount > 0 ? "No matches" : core.tab === "unread" ? "You're all caught up" : core.tab === "archive" ? "Nothing archived" : core.tab === "low" ? "No low-priority pages" : "No pages yet" }
                Label { width: parent.width; horizontalAlignment: Text.AlignHCenter; wrapMode: Text.Wrap; color: look.muted
                    text: core.search.length || core.filterCount > 0 ? "" : core.tab === "unread" ? "No unread pages." : core.tab === "archive" ? "Archived pages come back when someone writes." : core.tab === "low" ? "They stay quiet except for @mentions and replies." : "Connect an app to bring your conversations here." }
            }
        }
        Label {   // first load of a big account takes a while: say so instead of showing nothing
            visible: core.loading && list.count === 0
            Layout.fillWidth: true; Layout.margins: 16; wrapMode: Text.Wrap; color: look.muted; font.pixelSize: Math.round(14 * look.textScale)
            text: "Syncing… The first time can take a minute or two."
        }
        Label {
            visible: core.problem.length > 0 && list.count === 0
            Layout.fillWidth: true; Layout.margins: 16; wrapMode: Text.Wrap; color: look.danger; font.pixelSize: Math.round(12 * look.textScale)
            text: core.problem
        }
    }

    Menu {
        id: chatMenu
        MenuItem { text: pane.menuInfo.unread > 0 || pane.menuInfo.markedUnread ? "Mark read" : "Mark unread"; onTriggered: (pane.menuInfo.unread > 0 || pane.menuInfo.markedUnread) ? core.markRead(pane.menuRoom) : core.markUnread(pane.menuRoom, true) }
        MenuItem { text: pane.menuInfo.pinned ? "Unpin" : "Pin"; onTriggered: core.pin(pane.menuRoom, !pane.menuInfo.pinned) }
        MenuItem { text: pane.menuInfo.muted ? "Unmute" : "Mute"; onTriggered: core.setMuted(pane.menuRoom, !pane.menuInfo.muted) }
        MenuItem { text: pane.menuInfo.archived ? "Move to inbox" : "Archive"; onTriggered: core.archive(pane.menuRoom, !pane.menuInfo.archived) }
        MenuItem { text: pane.menuInfo.lowPriority ? "Move to inbox" : "Low priority"; onTriggered: core.setLowPriority(pane.menuRoom, !pane.menuInfo.lowPriority) }
        MenuItem { text: "Snooze 3 hours"; onTriggered: core.snooze(pane.menuRoom, Date.now() + 3 * 3600000) }
        MenuItem { text: "Snooze until…"; onTriggered: { snoozeDialog.room = pane.menuRoom; snoozeDialog.open() } }
        MenuItem { text: "Labels…"; onTriggered: labelsDialog.openFor(pane.menuRoom) }
        MenuItem { text: "Rename…"; visible: !!pane.menuInfo.isGroup; height: visible ? implicitHeight : 0; onTriggered: renameDialog.openFor(pane.menuRoom, pane.menuInfo.name) }
        MenuSeparator { }
        MenuItem { text: "Delete page…"; onTriggered: deleteDialog.openFor(pane.menuRoom, pane.menuInfo.name, pane.menuInfo.network) }
    }
    Dialog {
        id: deleteDialog
        property string room; property string label; property string net
        function openFor(r, n, network) { room = r; label = n; net = network; sourceToo.checked = false; open() }
        modal: true; anchors.centerIn: Overlay.overlay; width: Math.min(400, Overlay.overlay ? Overlay.overlay.width - 32 : 400); title: "Delete this page?"; standardButtons: Dialog.Cancel | Dialog.Ok
        contentItem: ColumnLayout { spacing: 10
            Label { Layout.fillWidth: true; wrapMode: Text.Wrap; text: "“" + deleteDialog.label + "” leaves Pager. Messages stay on the other app unless you also delete it there." }
            CheckBox { id: sourceToo; visible: deleteDialog.net !== "matrix" && deleteDialog.net !== ""; text: "Also delete it on " + N.meta(deleteDialog.net).label }
        }
        onAccepted: core.leaveRoom(room, sourceToo.checked)
    }
    Dialog {
        id: renameDialog
        property string room
        function openFor(r, n) { room = r; nameField.text = n; open(); nameField.forceActiveFocus(); nameField.selectAll() }
        modal: true; anchors.centerIn: Overlay.overlay; width: Math.min(380, Overlay.overlay ? Overlay.overlay.width - 32 : 380); title: "Rename page"; standardButtons: Dialog.Cancel | Dialog.Ok
        TextField { id: nameField; width: parent.width; onAccepted: renameDialog.accept() }
        onAccepted: core.renameRoom(room, nameField.text)
    }
    Dialog {
        id: labelsDialog
        property string room; property var have: []
        function openFor(r) { room = r; have = core.roomInfo(r).labels; newLabel.text = ""; open() }
        modal: true; anchors.centerIn: Overlay.overlay; width: Math.min(380, Overlay.overlay ? Overlay.overlay.width - 32 : 380); title: "Labels"; standardButtons: Dialog.Close
        contentItem: ColumnLayout { spacing: 6
            Repeater {
                model: core.labels.concat(labelsDialog.have.filter(l => core.labels.indexOf(l) < 0))
                delegate: CheckBox { text: modelData; checked: labelsDialog.have.indexOf(modelData) >= 0
                    onClicked: { if (checked) core.addLabel(labelsDialog.room, modelData); else core.removeLabel(labelsDialog.room, modelData); labelsDialog.have = core.roomInfo(labelsDialog.room).labels } }
            }
            RowLayout { Layout.fillWidth: true
                TextField { id: newLabel; Layout.fillWidth: true; placeholderText: "New label"; onAccepted: addBtn.clicked() }
                Button { id: addBtn; text: "Add"; highlighted: true; enabled: newLabel.text.trim().length > 0; onClicked: { core.addLabel(labelsDialog.room, newLabel.text.trim()); newLabel.text = ""; labelsDialog.have = core.roomInfo(labelsDialog.room).labels } }
            }
        }
    }
}
