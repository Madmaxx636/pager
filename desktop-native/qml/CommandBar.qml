import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "Networks.js" as N

// Ctrl+K: jump to any chat, run an action or open a setting by typing.
Popup {
    id: pop
    signal openSettingsPage(string id)
    signal newChat()
    signal searchAll()
    signal snoozeCurrent()
    parent: Overlay.overlay; modal: true; focus: true; padding: 0
    width: Math.min(620, (parent ? parent.width : 700) - 24); height: Math.min(480, (parent ? parent.height : 600) - 80)
    x: parent ? (parent.width - width) / 2 : 0; y: Math.min(90, parent ? parent.height * 0.12 : 60)
    property int at: 0
    property var info: ({})
    readonly property var settingIndex: [
        ["appearance", "Theme mode", "Appearance"], ["appearance", "Accent color", "Appearance"], ["appearance", "Text size", "Appearance"], ["appearance", "Bubble style", "Appearance"], ["appearance", "Avatar shape", "Appearance"],
        ["appearance", "Large emoji", "Appearance"], ["appearance", "Quick reactions", "Appearance"], ["system", "Time format", "System"], ["system", "Reduce motion", "System"], ["system", "Hide Stories", "System"],
        ["layout", "Show filter bar", "Inbox & layout"], ["layout", "Inbox style", "Inbox & layout"], ["layout", "Pinned pages row", "Inbox & layout"], ["notifications", "Notifications", "Notifications"],
        ["privacy", "Recovery key", "Privacy & encryption"], ["privacy", "Read receipts", "Privacy & encryption"], ["media", "GIF search keys", "Stickers & GIFs"], ["labels", "Labels", "Labels"], ["shortcuts", "Keyboard shortcuts", "Shortcuts"]
    ]
    function entries() {
        const out = []
        const cur = core.currentRoom, i = info
        if (cur.length) {
            const n = core.currentName
            out.push({ group: "This page", label: (i.archived ? "Move “" + n + "” to inbox" : "Archive “" + n + "”"), icon: "archive", run: () => core.archive(cur, !i.archived) })
            out.push({ group: "This page", label: "Mark “" + n + "” unread", icon: "mail-open", run: () => core.markUnread(cur, true) })
            out.push({ group: "This page", label: (i.pinned ? "Unpin “" : "Pin “") + n + "”", icon: i.pinned ? "pin-off" : "pin", run: () => core.pin(cur, !i.pinned) })
            out.push({ group: "This page", label: (i.muted ? "Unmute “" : "Mute “") + n + "”", icon: "bell-off", run: () => core.setMuted(cur, !i.muted) })
            out.push({ group: "This page", label: (i.lowPriority ? "Remove “" + n + "” from low priority" : "Low priority: “" + n + "”"), icon: "arrow-down-to-line", run: () => core.setLowPriority(cur, !i.lowPriority) })
            out.push({ group: "This page", label: "Snooze “" + n + "”…", icon: "hourglass", run: () => pop.snoozeCurrent() })
        }
        for (const c of core.chatChoices("")) out.push({ group: "Pages", label: c.name, hint: N.meta(c.network).label, avatar: c, run: () => { core.openRoom(c.id) } })
        out.push({ group: "Actions", label: "Page someone", icon: "square-pen", run: () => pop.newChat() })
        out.push({ group: "Actions", label: "Search all messages", icon: "search", run: () => pop.searchAll() })
        out.push({ group: "Actions", label: "Mark all pages as read", icon: "check-check", run: () => core.markAllRead() })
        out.push({ group: "Actions", label: "Starred messages", icon: "star", run: () => pop.openSettingsPage("starred") })
        out.push({ group: "Actions", label: "Keyboard shortcuts", icon: "keyboard", run: () => pop.openSettingsPage("shortcuts") })
        out.push({ group: "Actions", label: "Settings", icon: "settings", run: () => pop.openSettingsPage("appearance") })
        for (const s of settingIndex) out.push({ group: "Settings", label: s[1], hint: s[2], icon: "settings", run: () => pop.openSettingsPage(s[0]) })
        return out
    }
    property var shown: []
    function recompute() {
        const all = entries(), t = field.text.trim().toLowerCase()
        let list
        if (t.length) list = all.filter(e => (e.label + " " + (e.hint || "")).toLowerCase().indexOf(t) >= 0)
        else list = all.filter(e => e.group === "This page").concat(all.filter(e => e.group === "Pages").slice(0, 8), all.filter(e => e.group === "Actions"))
        shown = list.slice(0, 40); at = 0
    }
    onAboutToShow: { info = core.currentRoom.length ? core.roomInfo(core.currentRoom) : ({}); field.text = ""; recompute() }
    onOpened: field.forceActiveFocus()
    function runAt(i) { const e = shown[i]; if (!e) return; close(); e.run() }
    background: Rectangle { color: look.panel; radius: 16; border.color: look.line }
    contentItem: ColumnLayout { spacing: 0
        RowLayout { Layout.fillWidth: true; Layout.margins: 14; spacing: 10
            Icon { name: "search"; size: 20; color: look.muted }
            TextField { id: field; Layout.fillWidth: true; placeholderText: "Jump to a page, run an action, or find a setting"; background: Item { } color: look.text; placeholderTextColor: look.muted; font.pixelSize: Math.round(16 * look.textScale)
                onTextChanged: pop.recompute()
                Keys.onDownPressed: pop.at = Math.min(pop.shown.length - 1, pop.at + 1)
                Keys.onUpPressed: pop.at = Math.max(0, pop.at - 1)
                Keys.onReturnPressed: pop.runAt(pop.at)
                Keys.onEnterPressed: pop.runAt(pop.at) }
            Label { text: "Esc"; color: look.muted; font.pixelSize: 11; leftPadding: 6; rightPadding: 6; topPadding: 2; bottomPadding: 2; background: Rectangle { radius: 5; color: look.panel2 } } }
        Rectangle { Layout.fillWidth: true; height: 1; color: look.line }
        ListView {
            id: list
            Layout.fillWidth: true; Layout.fillHeight: true; clip: true; model: pop.shown; currentIndex: pop.at; boundsBehavior: Flickable.StopAtBounds
            ScrollBar.vertical: ScrollBar { }
            onCurrentIndexChanged: positionViewAtIndex(currentIndex, ListView.Contain)
            Label { visible: pop.shown.length === 0; anchors.centerIn: parent; text: "Nothing matches “" + field.text + "”."; color: look.muted }
            delegate: Column { width: ListView.view.width
                Label { visible: index === 0 || pop.shown[index - 1].group !== modelData.group; text: modelData.group; color: look.accent; font.pixelSize: Math.round(12 * look.textScale); font.weight: Font.Bold; font.capitalization: Font.AllUppercase; leftPadding: 16; topPadding: 10; bottomPadding: 4 }
                Rectangle { width: parent.width - 12; x: 6; height: 44; radius: 10; color: index === pop.at ? look.panel2 : "transparent"
                    HoverHandler { cursorShape: Qt.PointingHandCursor; onHoveredChanged: if (hovered) pop.at = index }
                    RowLayout { anchors.fill: parent; anchors.leftMargin: 10; anchors.rightMargin: 12; spacing: 10
                        Avatar { visible: !!modelData.avatar; size: 28; source: modelData.avatar ? modelData.avatar.avatar : ""; letter: modelData.avatar && modelData.avatar.name.length ? modelData.avatar.name[0].toUpperCase() : "?"; seed: modelData.avatar ? modelData.avatar.name : ""; network: modelData.avatar ? modelData.avatar.network : "" }
                        Rectangle { visible: !modelData.avatar; width: 28; height: 28; radius: 8; color: look.panel2; Icon { anchors.centerIn: parent; name: modelData.icon || "message-square"; size: 16; color: look.muted } }
                        Label { Layout.fillWidth: true; text: modelData.label; color: look.text; elide: Text.ElideRight }
                        Label { visible: !!modelData.hint; text: modelData.hint || ""; color: look.muted; font.pixelSize: Math.round(12 * look.textScale) } }
                    TapHandler { onTapped: pop.runAt(index) } } }
        }
    }
}
