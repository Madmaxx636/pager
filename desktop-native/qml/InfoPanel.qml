import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Pager.Items
import "Networks.js" as N

// About the open chat, laid out like the web app's page info: who it is, quick actions, switches, notification settings, shared photos, links and files, people.
Rectangle {
    id: panel
    color: look.panel
    property var info: core.roomInfo(core.currentRoom)
    property var people: core.members()
    property var shared: core.sharedMedia()
    property string tab: "photos"
    property string histNote: ""
    signal closeRequested()
    signal viewImage(string eventId)
    signal searchInChat()
    function refresh() { info = core.roomInfo(core.currentRoom); people = core.members(); shared = core.sharedMedia() }
    Connections { target: core; function onCurrentChanged() { panel.refresh() } function onListChanged() { panel.info = core.roomInfo(core.currentRoom) }
        function onHistoryProgress(n, done) { panel.histNote = done ? "Done: " + n + " messages loaded" : "Loading everything… " + n } }
    onVisibleChanged: if (visible) refresh()
    readonly property bool canSource: ["signal", "whatsapp", "gmessages"].indexOf(core.currentNetwork) >= 0

    Rectangle { anchors.left: parent.left; width: 1; height: parent.height; color: look.line }
    component SheetItem: Rectangle {
        id: si
        property string ico; property string label; property string hint: ""; property bool danger: false; signal clicked()
        Layout.fillWidth: true; implicitHeight: 54; radius: 12; color: sh.hovered ? look.panel2 : "transparent"
        HoverHandler { id: sh; cursorShape: Qt.PointingHandCursor }
        RowLayout { anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 8; spacing: 12
            Icon { name: si.ico; size: 20; color: si.danger ? look.danger : look.muted }
            ColumnLayout { Layout.fillWidth: true; spacing: 0
                Label { text: si.label; color: si.danger ? look.danger : look.text; font.pixelSize: Math.round(15 * look.textScale); Layout.fillWidth: true; elide: Text.ElideRight }
                Label { visible: si.hint.length > 0; text: si.hint; color: look.muted; font.pixelSize: Math.round(12 * look.textScale); Layout.fillWidth: true; elide: Text.ElideRight } } }
        TapHandler { onTapped: si.clicked() }
    }
    component ToggleRow: Item {
        id: tr
        property string label; property string hint: ""; property alias checked: sw.checked; signal toggled(bool on)
        Layout.fillWidth: true; implicitHeight: Math.max(texts.implicitHeight, 28) + 22
        Column { id: texts; x: 16; anchors.verticalCenter: parent.verticalCenter; width: parent.width - 28 - 60; spacing: 0
            Label { text: tr.label; color: look.text; font.pixelSize: Math.round(15 * look.textScale); width: parent.width; wrapMode: Text.Wrap }
            Label { visible: tr.hint.length > 0; text: tr.hint; color: look.muted; font.pixelSize: Math.round(12 * look.textScale); wrapMode: Text.Wrap; width: parent.width } }
        PSwitch { id: sw; anchors.right: parent.right; anchors.rightMargin: 16; anchors.verticalCenter: parent.verticalCenter; onToggled: tr.toggled(checked) }
    }

    Flickable {
        id: scroller
        anchors.fill: parent; contentHeight: col.implicitHeight + 30; clip: true; boundsBehavior: Flickable.StopAtBounds
        ScrollBar.vertical: ScrollBar { }
        SmoothWheel { view: scroller }
        ColumnLayout {
            id: col; width: scroller.width - 28; x: 14; y: 12; spacing: 6
            RowLayout { Layout.fillWidth: true
                Label { text: "Page info"; color: look.text; font.pixelSize: Math.round(15 * look.textScale); font.weight: Font.Bold; Layout.fillWidth: true }
                IconButton { ico: "x"; onClicked: panel.closeRequested() } }
            // who it is
            Item { Layout.alignment: Qt.AlignHCenter; Layout.topMargin: 6; width: 88; height: 88
                Loader { id: faceLoader; anchors.fill: parent; readonly property var f: core.faces(core.currentRoom); active: f.length > 1; sourceComponent: GroupAvatar { size: 88; faces: faceLoader.f } }
                Avatar { visible: !faceLoader.active; size: 88; source: core.currentAvatar; letter: core.currentName.length ? core.currentName[0].toUpperCase() : "?"; seed: core.currentName; network: core.currentNetwork } }
            Label { Layout.alignment: Qt.AlignHCenter; Layout.fillWidth: true; horizontalAlignment: Text.AlignHCenter; text: core.currentName; color: look.text; font.pixelSize: Math.round(18 * look.textScale); font.weight: Font.Bold; wrapMode: Text.Wrap }
            RowLayout { Layout.alignment: Qt.AlignHCenter; spacing: 6
                Rectangle { width: 9; height: 9; radius: 5; color: N.meta(core.currentNetwork).color }
                Label { text: core.merged ? core.linkedChats.length + " networks together" : N.meta(core.currentNetwork).label; color: look.muted; font.pixelSize: Math.round(13 * look.textScale) } }
            RowLayout { Layout.alignment: Qt.AlignHCenter; spacing: 12
                Button { text: "Rename for me"; flat: true; onClicked: aliasDlg.open() }
                Button { text: "Rename group"; flat: true; visible: !!panel.info.isGroup; onClicked: renameDlg.open() } }
            Button { visible: !panel.info.isGroup; text: core.isLinked(core.currentRoom) ? "Stop showing with other networks" : "Show as one with another network…"; flat: true; Layout.alignment: Qt.AlignHCenter
                onClicked: core.isLinked(core.currentRoom) ? core.unlink(core.currentRoom) : linkDlg.openNow() }
            Button { Layout.alignment: Qt.AlignHCenter; flat: true; enabled: panel.histNote.indexOf("Loading") !== 0; text: panel.histNote.length ? panel.histNote : "Load this page's whole history"; onClicked: { panel.histNote = "Loading everything… "; core.loadAllHistory(core.currentRoom) } }
            // quick actions
            RowLayout { Layout.fillWidth: true; Layout.topMargin: 6; spacing: 8
                Repeater {
                    model: [["search", "Search", false], [panel.info.pinned ? "pin-off" : "pin", panel.info.pinned ? "Unpin" : "Pin", !!panel.info.pinned], ["bell-off", panel.info.muted ? "Unmute" : "Mute", !!panel.info.muted], ["alarm-clock", "Remind", false]]
                    delegate: Rectangle { Layout.fillWidth: true; implicitHeight: 80; radius: 12; color: qh.hovered ? Qt.rgba(look.panel2.r, look.panel2.g, look.panel2.b, 0.5) : "transparent"
                        HoverHandler { id: qh; cursorShape: Qt.PointingHandCursor }
                        Column { anchors.centerIn: parent; spacing: 6
                            Rectangle { anchors.horizontalCenter: parent.horizontalCenter; width: 46; height: 46; radius: 23; color: modelData[2] ? look.accent : look.panel2
                                Icon { anchors.centerIn: parent; name: modelData[0]; size: 20; color: modelData[2] ? look.accentInk : look.accent } }
                            Label { anchors.horizontalCenter: parent.horizontalCenter; text: modelData[1]; color: look.text; font.pixelSize: Math.round(11.25 * look.textScale) } }
                        TapHandler { onTapped: {
                            if (index === 0) panel.searchInChat()
                            else if (index === 1) core.pin(core.currentRoom, !panel.info.pinned)
                            else if (index === 2) { if (panel.info.muted) core.setMuted(core.currentRoom, false); else muteDlg.open() }
                            else remindDlg.open() } } } } }
            // switches
            Rectangle { Layout.fillWidth: true; Layout.topMargin: 6; implicitHeight: sw.implicitHeight; radius: 14; color: look.panel2
                ColumnLayout { id: sw; width: parent.width; spacing: 0
                    ToggleRow { label: "Low priority"; hint: "Quiet, except @mentions and replies"; checked: !!panel.info.lowPriority; onToggled: (on) => core.setLowPriority(core.currentRoom, on) }
                    Rectangle { Layout.fillWidth: true; height: 1; color: look.line }
                    ToggleRow { label: "Archived"; checked: !!panel.info.archived; onToggled: (on) => core.archive(core.currentRoom, on) }
                    Rectangle { Layout.fillWidth: true; height: 1; color: look.line }
                    ToggleRow { label: "Marked unread"; checked: !!panel.info.markedUnread; onToggled: (on) => { if (on) core.markUnread(core.currentRoom, true); else core.markRead(core.currentRoom) } }
                    Label { visible: core.muteLeftMs(core.currentRoom) > 0; Layout.margins: 14; text: "Muted for " + Math.ceil(core.muteLeftMs(core.currentRoom) / 3.6e6) + " more hour(s)"; color: look.muted; font.pixelSize: Math.round(12 * look.textScale) } } }
            SheetItem { ico: "tag"; label: "Labels"; hint: panel.info.labels && panel.info.labels.length ? panel.info.labels.join(", ") : "None"; onClicked: labelsDlg.openNow() }
            SheetItem { visible: !panel.info.encrypted; ico: "lock"; label: "Turn on encryption"; hint: "Messages from now on are end-to-end encrypted"; onClicked: encDlg.open() }
            SheetItem { visible: !!panel.info.encrypted; ico: "lock"; label: "Encrypted"; hint: "End-to-end encrypted. This can't be turned off" }
            SheetItem { ico: "bell"; label: "Notifications"; hint: notifDlg.summary(); onClicked: notifDlg.open() }
            SheetItem { ico: "hourglass"; label: "Snooze…"; hint: "Hide this page and bring it back later"; onClicked: snoozeDlg.open() }
            // photos, links, files
            RowLayout { Layout.fillWidth: true; Layout.topMargin: 8; spacing: 6
                Repeater { model: [["photos", "Photos", panel.shared.photos.length], ["links", "Links", panel.shared.links.length], ["files", "Files", panel.shared.files.length]]
                    delegate: Rectangle { height: 32; Layout.preferredWidth: tl.implicitWidth + 24; radius: 16; color: panel.tab === modelData[0] ? look.accent : look.panel2
                        Label { id: tl; anchors.centerIn: parent; text: modelData[1] + " " + modelData[2]; color: panel.tab === modelData[0] ? look.accentInk : look.text; font.pixelSize: Math.round(13 * look.textScale) }
                        TapHandler { onTapped: panel.tab = modelData[0] } } }
                Item { Layout.fillWidth: true } }
            Label { visible: panel.tab === "photos" && panel.shared.photos.length === 0; Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.muted; text: "No photos loaded yet. Scroll up in the page to load more." }
            Flow { visible: panel.tab === "photos"; Layout.fillWidth: true; spacing: 4
                Repeater { model: panel.tab === "photos" ? panel.shared.photos : []
                    delegate: Rectangle { width: Math.floor((col.width - 8) / 3); height: width; radius: 8; color: look.panel2; clip: true
                        property string path: core.photoPath(modelData.id)
                        Connections { target: core; function onMediaReady(key) { if (key === modelData.id) parent.path = core.photoPath(modelData.id) } }
                        RoundedImage { anchors.fill: parent; source: parent.path; radius: 8; maxSide: 300 }
                        HoverHandler { cursorShape: Qt.PointingHandCursor }
                        TapHandler { onTapped: panel.viewImage(modelData.id) } } } }
            Label { visible: panel.tab === "links" && panel.shared.links.length === 0; color: look.muted; text: "No links yet." }
            Repeater { model: panel.tab === "links" ? panel.shared.links : []
                delegate: Rectangle { Layout.fillWidth: true; implicitHeight: 52; radius: 10; color: lk.hovered ? look.panel2 : "transparent"
                    HoverHandler { id: lk; cursorShape: Qt.PointingHandCursor }
                    Column { anchors.verticalCenter: parent.verticalCenter; x: 8; width: parent.width - 16
                        Label { text: modelData.url; width: parent.width; elide: Text.ElideMiddle; color: look.accent; font.pixelSize: Math.round(13 * look.textScale) }
                        Label { text: modelData.who + " · " + modelData.when; color: look.muted; font.pixelSize: Math.round(11 * look.textScale) } }
                    TapHandler { onTapped: files.openUrl(modelData.url) } } }
            Label { visible: panel.tab === "files" && panel.shared.files.length === 0; color: look.muted; text: "No files yet." }
            Repeater { model: panel.tab === "files" ? panel.shared.files : []
                delegate: Rectangle { Layout.fillWidth: true; implicitHeight: 52; radius: 10; color: fh.hovered ? look.panel2 : "transparent"
                    HoverHandler { id: fh; cursorShape: Qt.PointingHandCursor }
                    Column { anchors.verticalCenter: parent.verticalCenter; x: 8; width: parent.width - 16
                        Label { text: modelData.name; width: parent.width; elide: Text.ElideMiddle; color: look.text; font.pixelSize: Math.round(13 * look.textScale) }
                        Label { text: modelData.who + (modelData.size > 0 ? " · " + files.humanSize(modelData.size) : ""); color: look.muted; font.pixelSize: Math.round(11 * look.textScale) } }
                    TapHandler { onTapped: panel.viewImage(modelData.id) } } }
            SheetItem { Layout.topMargin: 8; ico: "log-out"; label: "Delete page"; danger: true; onClicked: leaveDlg.open() }
            // people
            Label { visible: panel.people.length > 0 && !!panel.info.isGroup; Layout.topMargin: 10; text: panel.people.length + " people"; color: look.accent; font.pixelSize: Math.round(12 * look.textScale); font.weight: Font.Bold; font.capitalization: Font.AllUppercase }
            Repeater { model: panel.info.isGroup ? panel.people : []
                delegate: RowLayout { Layout.fillWidth: true; spacing: 10
                    Avatar { size: 34; source: modelData.avatar; letter: modelData.name.length ? modelData.name[0].toUpperCase() : "?"; seed: modelData.id }
                    Label { Layout.fillWidth: true; text: modelData.name + (modelData.you ? " (you)" : ""); color: look.text; elide: Text.ElideRight; font.pixelSize: Math.round(14 * look.textScale) } } }
        }
    }

    // ---- dialogs
    WhenDialog { id: remindDlg; heading: "Remind me about this page"; onPicked: (ms) => core.remind(core.currentRoom, ms) }
    WhenDialog { id: snoozeDlg; heading: "Snooze until"; onPicked: (ms) => core.snooze(core.currentRoom, ms) }
    Dialog {
        id: muteDlg
        modal: true; anchors.centerIn: Overlay.overlay; width: Math.min(360, Overlay.overlay ? Overlay.overlay.width - 32 : 360); title: "Mute " + core.currentName; standardButtons: Dialog.Cancel

        ColumnLayout { width: parent.width; spacing: 6
            Repeater { model: [["For 1 hour", 3.6e6], ["For 8 hours", 8 * 3.6e6], ["For 1 week", 7 * 864e5], ["Until I turn it back on", 0]]
                delegate: Rectangle { Layout.fillWidth: true; height: 46; radius: 12; color: mh.hovered ? look.panel2 : look.bg
                    HoverHandler { id: mh; cursorShape: Qt.PointingHandCursor }
                    Label { x: 14; anchors.verticalCenter: parent.verticalCenter; text: modelData[0]; color: look.text }
                    TapHandler { onTapped: { core.muteFor(core.currentRoom, modelData[1]); muteDlg.close() } } } } }
    }
    Dialog {
        id: encDlg
        property string err: ""; property bool busy: false
        modal: true; anchors.centerIn: Overlay.overlay; width: Math.min(420, Overlay.overlay ? Overlay.overlay.width - 32 : 420); title: "Turn on encryption for this page?"; standardButtons: Dialog.Cancel

        onAboutToShow: { err = ""; busy = false }
        Connections { target: core; function onEncryptionResult(e) { encDlg.busy = false; if (e.length) encDlg.err = e; else encDlg.close() } }
        ColumnLayout { width: parent.width; spacing: 8
            Label { Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.text; text: "From now on, messages in this page are end-to-end encrypted." }
            Label { Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.muted; text: "Messages sent before stay readable on your server, as they were. Encryption can't be turned off again for this page. Make sure you've set up your recovery key first." }
            Label { visible: encDlg.err.length > 0; Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.danger; text: encDlg.err }
            Button { text: encDlg.busy ? "Turning on…" : "Turn on encryption"; highlighted: true; enabled: !encDlg.busy; onClicked: { encDlg.busy = true; core.enableEncryption(core.currentRoom) } } }
    }
    Dialog {
        id: leaveDlg
        property bool atSource: false
        modal: true; anchors.centerIn: Overlay.overlay; width: Math.min(420, Overlay.overlay ? Overlay.overlay.width - 32 : 420); title: "Delete this page?"; standardButtons: Dialog.Cancel | Dialog.Ok

        onAboutToShow: atSource = settings.deleteAtSource === true
        ColumnLayout { width: parent.width; spacing: 8
            Label { Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.muted
                text: leaveDlg.atSource ? "It will be removed from Pager and deleted on " + N.meta(core.currentNetwork).label + " too. This can't be undone." : "It will be removed from Pager. The conversation on " + N.meta(core.currentNetwork).label + " isn't deleted, and it comes back if someone writes." }
            CheckBox { visible: panel.canSource; text: "Also delete it on " + N.meta(core.currentNetwork).label; checked: leaveDlg.atSource; onToggled: leaveDlg.atSource = checked } }
        onAccepted: { core.leaveRoom(core.currentRoom, leaveDlg.atSource && panel.canSource); panel.closeRequested() }
    }
    Dialog {
        id: aliasDlg
        modal: true; anchors.centerIn: Overlay.overlay; width: Math.min(380, Overlay.overlay ? Overlay.overlay.width - 32 : 380); title: "Rename for me"; standardButtons: Dialog.Cancel | Dialog.Ok

        onAboutToShow: { aliasField.text = core.aliasOf(core.currentRoom); aliasField.forceActiveFocus() }
        ColumnLayout { width: parent.width; spacing: 6
            TextField { id: aliasField; Layout.fillWidth: true; placeholderText: core.currentName; onAccepted: aliasDlg.accept() }
            Label { Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.muted; font.pixelSize: Math.round(12 * look.textScale); text: "Only you see this name. Leave it empty to go back to the real one." } }
        onAccepted: core.setAlias(core.currentRoom, aliasField.text)
    }
    Dialog {
        id: renameDlg
        modal: true; anchors.centerIn: Overlay.overlay; title: "Rename group"; standardButtons: Dialog.Cancel | Dialog.Ok; width: Math.min(380, Overlay.overlay ? Overlay.overlay.width - 32 : 380)

        onAboutToShow: nameField.text = core.currentName
        TextField { id: nameField; width: parent.width; onAccepted: renameDlg.accept() }
        onAccepted: core.renameRoom(core.currentRoom, nameField.text)
    }
    Dialog {
        id: notifDlg
        modal: true; anchors.centerIn: Overlay.overlay; width: Math.min(440, Overlay.overlay ? Overlay.overlay.width - 32 : 440); title: "Notifications for " + core.currentName; standardButtons: Dialog.Close

        property int rev: 0
        function prefs() { rev; return (settings.notifChat || {})[core.currentRoom] || {} }
        function setPref(k, v) { const all = Object.assign({}, settings.notifChat || {}); const p = Object.assign({}, all[core.currentRoom] || {}); p[k] = v; all[core.currentRoom] = p; settings.set("notifChat", all); rev++ }
        function resetPrefs() { const all = Object.assign({}, settings.notifChat || {}); delete all[core.currentRoom]; settings.set("notifChat", all); rev++ }
        function summary() {
            const p = prefs(), parts = []
            if (p.level === "priority") parts.push("Priority"); else if (p.level === "silent") parts.push("Silent")
            if (p.mode && p.mode !== "default") parts.push({ all: "Every message", mentions: "Mentions only", none: "Off" }[p.mode])
            if (p.sound === "off") parts.push("Silent")
            if (p.preview === "hide") parts.push("Hidden")
            return parts.length ? parts.join(" · ") : "Default"
        }
        component Pick: ColumnLayout { id: pk; property string title; property string key; property var options: []; Layout.fillWidth: true; spacing: 4
            Label { text: pk.title; color: look.text; font.pixelSize: Math.round(13 * look.textScale) }
            Flow { Layout.fillWidth: true; spacing: 6
                Repeater { model: pk.options
                    delegate: Rectangle { readonly property bool on: (notifDlg.prefs()[pk.key] || "default") === modelData[0]
                        height: 30; width: pl.implicitWidth + 22; radius: 15; color: on ? look.accent : look.panel2
                        Label { id: pl; anchors.centerIn: parent; text: modelData[1]; color: parent.on ? look.accentInk : look.text; font.pixelSize: Math.round(12 * look.textScale) }
                        TapHandler { onTapped: notifDlg.setPref(pk.key, modelData[0]) } } } } }
        ColumnLayout { width: parent.width; spacing: 10
            Pick { title: "Importance"; key: "level"; options: [["default", "Default"], ["priority", "Priority: always gets through"], ["silent", "Silent: shown without sound"]] }
            Pick { title: "Notify me about"; key: "mode"; options: [["default", "My general settings"], ["all", "Every message"], ["mentions", "Mentions and replies only"], ["none", "Nothing"]] }
            Pick { title: "Sound"; key: "sound"; options: [["default", "My general settings"], ["off", "Silent"]] }
            Pick { title: "Message previews"; key: "preview"; options: [["default", "My general settings"], ["show", "Show message"], ["hide", "Hide message"]] }
            Label { Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.muted; font.pixelSize: Math.round(12 * look.textScale); text: "Mute and Low priority still apply: muted pages only notify for mentions, replies and your keywords." }
            Button { text: "Reset"; flat: true; onClicked: notifDlg.resetPrefs() } }
    }
    Dialog {
        id: labelsDlg
        function openNow() { open() }
        modal: true; anchors.centerIn: Overlay.overlay; width: Math.min(380, Overlay.overlay ? Overlay.overlay.width - 32 : 380); title: "Labels"; standardButtons: Dialog.Close

        property var have: panel.info.labels || []
        onAboutToShow: { have = core.roomInfo(core.currentRoom).labels; newLabel.text = "" }
        ColumnLayout { width: parent.width; spacing: 6
            Repeater { model: core.labels.concat(labelsDlg.have.filter(l => core.labels.indexOf(l) < 0))
                delegate: CheckBox { text: modelData; checked: labelsDlg.have.indexOf(modelData) >= 0; onToggled: { core.setLabel(core.currentRoom, modelData, checked); labelsDlg.have = core.roomInfo(core.currentRoom).labels } } }
            RowLayout { Layout.fillWidth: true
                TextField { id: newLabel; Layout.fillWidth: true; placeholderText: "New label"; onAccepted: addBtn.clicked() }
                Button { id: addBtn; text: "Add"; enabled: newLabel.text.trim().length > 0; onClicked: { core.setLabel(core.currentRoom, newLabel.text.trim(), true); newLabel.text = ""; labelsDlg.have = core.roomInfo(core.currentRoom).labels } } } }
    }
    Dialog {
        id: linkDlg
        property var options: []
        function openNow() { options = core.linkOptions(core.currentRoom); open() }
        modal: true; anchors.centerIn: Overlay.overlay; title: "Same person, another network"; standardButtons: Dialog.Close; width: Math.min(420, Overlay.overlay ? Overlay.overlay.width - 32 : 420); height: Math.min(560, Overlay.overlay ? Overlay.overlay.height - 60 : 560)

        contentItem: ColumnLayout { spacing: 8
            Label { Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.muted; text: "Pick their chat on another network. Both show as one in your list, and the name at the top of the chat switches between them." }
            ListView { Layout.fillWidth: true; Layout.fillHeight: true; clip: true; boundsBehavior: Flickable.StopAtBounds; model: linkDlg.options; ScrollBar.vertical: ScrollBar { }
                delegate: Rectangle { width: ListView.view.width; height: 44; radius: 10; color: lh.hovered ? look.panel2 : "transparent"
                    HoverHandler { id: lh; cursorShape: Qt.PointingHandCursor }
                    Row { x: 10; anchors.verticalCenter: parent.verticalCenter; spacing: 10
                        Rectangle { width: 10; height: 10; radius: 5; color: N.meta(modelData.network).color; anchors.verticalCenter: parent.verticalCenter }
                        Label { text: modelData.name; color: look.text; font.pixelSize: Math.round(14 * look.textScale) }
                        Label { text: N.meta(modelData.network).label; color: look.muted; font.pixelSize: Math.round(12 * look.textScale); anchors.verticalCenter: parent.verticalCenter } }
                    TapHandler { onTapped: { core.link(core.currentRoom, modelData.id); linkDlg.close() } } } }
        }
    }
}
