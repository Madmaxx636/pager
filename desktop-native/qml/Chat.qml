import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Dialogs

Rectangle {
    id: pane
    color: look.bg
    property bool showBack: false
    property string target: ""; property bool targetMine: false       // the message a menu was opened on
    property string replyingTo: ""; property string editing: ""       // set while the composer is answering or editing
    readonly property string barText: editing ? "Editing message" : (replyingTo ? "Replying to: " + core.bodyOf(replyingTo) : "")
    signal back()
    signal restoreRequested()

    ColumnLayout {
        anchors.fill: parent
        spacing: 0
        // header
        Rectangle {
            Layout.fillWidth: true; height: 64; color: look.panel
            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: look.line }
            RowLayout {
                anchors.fill: parent; anchors.leftMargin: 10; anchors.rightMargin: 16; spacing: 10
                ToolButton {
                    id: backBtn; visible: pane.showBack; text: "←"
                    contentItem: Label { text: backBtn.text; color: look.text; font.pixelSize: Math.round(22 * look.textScale); horizontalAlignment: Text.AlignHCenter }
                    background: Rectangle { color: "transparent" }
                    onClicked: pane.back()
                }
                Avatar { visible: core.currentRoom.length > 0; letter: core.currentName.length ? core.currentName[0].toUpperCase() : "?"; seed: core.currentName; size: 40 }
                ColumnLayout {
                    spacing: 0
                    Label { text: core.currentName; color: look.text; font.pixelSize: Math.round(16 * look.textScale); font.weight: Font.DemiBold }
                    Label { text: core.currentSub; color: look.muted; font.pixelSize: Math.round(12 * look.textScale) }
                }
                Item { Layout.fillWidth: true }
            }
        }
        Rectangle {   // some messages cannot be read yet: say how to fix it
            visible: core.currentLocked > 0
            Layout.fillWidth: true; implicitHeight: lockRow.implicitHeight + 16; color: Qt.rgba(look.accent.r, look.accent.g, look.accent.b, 0.14)
            RowLayout {
                id: lockRow; anchors.fill: parent; anchors.margins: 8; anchors.leftMargin: 14
                Label { Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.text; font.pixelSize: Math.round(13 * look.textScale)
                    text: "🔒 " + core.currentLocked + (core.currentLocked === 1 ? " message is" : " messages are") + " locked on this device. Enter your recovery key to read them." }
                Button { text: "Enter recovery key"; onClicked: pane.restoreRequested() }
            }
        }
        // messages: the list is upside down (newest first), so the newest message stays at the bottom by itself
        ListView {
            id: msgs
            Layout.fillWidth: true; Layout.fillHeight: true
            clip: true
            verticalLayoutDirection: ListView.BottomToTop
            model: core.timeline
            spacing: 0
            boundsBehavior: Flickable.StopAtBounds
            ScrollBar.vertical: ScrollBar { }
            delegate: Bubble {
                body: model.body; kind: model.kind; time: model.time; senderName: model.senderName
                mine: model.mine; locked: model.locked; local: model.local; first: model.first; last: model.last; edited: model.edited
                reactions: model.reactions; day: model.day; eventId: model.eventId; replyTo: model.replyTo
                media: model.media; imgWidth: model.imgWidth; imgHeight: model.imgHeight; fileName: model.fileName; poll: model.poll
                onMenuRequested: (id, mine, gx, gy) => { pane.target = id; pane.targetMine = mine; actions.popup() }
                onReactionTapped: (id, key) => core.react(id, key)
                showName: !core.currentIsDirect
            }
            // reaching the oldest message asks for older ones
            onAtYEndChanged: if (atYEnd && count > 0) core.loadOlder()
            Label { anchors.centerIn: parent; visible: core.currentRoom.length === 0; text: "Pick a chat"; color: look.muted; font.pixelSize: Math.round(16 * look.textScale) }
        }
        Rectangle {   // what the composer is answering or editing
            visible: pane.barText.length > 0
            Layout.fillWidth: true; implicitHeight: 34; color: look.panel2
            RowLayout { anchors.fill: parent; anchors.leftMargin: 14; anchors.rightMargin: 8
                Label { Layout.fillWidth: true; text: pane.barText; color: look.muted; font.pixelSize: Math.round(13 * look.textScale); elide: Text.ElideRight }
                ToolButton { text: "✕"; onClicked: { pane.replyingTo = ""; pane.editing = ""; input.clear() } } }
        }
        // composer
        Rectangle {
            visible: core.currentRoom.length > 0
            Layout.fillWidth: true; color: look.panel; implicitHeight: Math.min(input.implicitHeight, 160) + 24
            Rectangle { width: parent.width; height: 1; color: look.line }
            RowLayout {
                anchors.fill: parent; anchors.margins: 12; spacing: 10
                ToolButton {
                    id: plus; Layout.alignment: Qt.AlignBottom; text: "＋"
                    contentItem: Label { text: "＋"; color: look.muted; font.pixelSize: Math.round(24 * look.textScale); horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter }
                    background: Rectangle { implicitWidth: 40; implicitHeight: 40; radius: 20; color: plus.hovered ? look.panel2 : "transparent" }
                    onClicked: attachMenu.popup()
                    Menu {
                        id: attachMenu
                        MenuItem { text: "Photo or file…"; onTriggered: filePicker.open() }
                        MenuItem { text: "Poll…"; onTriggered: pollDialog.open() }
                    }
                }
                ScrollView {
                    Layout.fillWidth: true; Layout.fillHeight: true
                    TextArea {
                        id: input
                        placeholderText: "Message"
                        placeholderTextColor: look.muted; color: look.text; font.pixelSize: Math.round(15 * look.textScale)
                        wrapMode: TextArea.Wrap; leftPadding: 16; rightPadding: 16; topPadding: 9; bottomPadding: 9
                        background: Rectangle { radius: 20; color: look.panel2 }
                        Keys.onPressed: (e) => {
                            if (e.key !== Qt.Key_Return && e.key !== Qt.Key_Enter) return
                            const wantsSend = prefs.enterSends ? !(e.modifiers & Qt.ShiftModifier) : (e.modifiers & Qt.ControlModifier)
                            if (wantsSend) { e.accepted = true; sendIt() }
                        }
                    }
                }
                Button {
                    id: sendBtn
                    Layout.alignment: Qt.AlignBottom
                    enabled: input.text.trim().length > 0
                    contentItem: Label { text: "➤"; color: look.accentInk; font.pixelSize: Math.round(18 * look.textScale); horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter }
                    background: Rectangle { implicitWidth: 40; implicitHeight: 40; radius: 20; color: sendBtn.enabled ? look.accent : look.muted }
                    onClicked: sendIt()
                }
            }
        }
    }
    function sendIt() {
        if (!input.text.trim().length) return
        if (editing) core.edit(editing, input.text); else core.send(input.text, replyingTo)
        input.clear(); editing = ""; replyingTo = ""
    }
    PollDialog { id: pollDialog }
    FileDialog {
        id: filePicker; title: "Send a photo or file"; fileMode: FileDialog.OpenFiles
        onAccepted: { for (const u of selectedFiles) { const p = files.path(u); const sz = files.imageSize(p); core.sendFile(p, files.mime(p), sz.width, sz.height) } }
    }
    EmojiPicker { id: picker; onPicked: (e) => core.react(pane.target, e) }
    Menu {
        id: actions
        Row {
            padding: 6; spacing: 2
            Repeater {
                model: emoji.quick()
                delegate: Rectangle { width: 36; height: 36; radius: 8; color: h.hovered ? look.panel2 : "transparent"
                    HoverHandler { id: h }
                    Label { anchors.centerIn: parent; text: modelData; font.pixelSize: Math.round(22 * look.textScale) }
                    TapHandler { onTapped: { core.react(pane.target, modelData); actions.close() } } }
            }
            Rectangle { width: 36; height: 36; radius: 8; color: hm.hovered ? look.panel2 : "transparent"
                HoverHandler { id: hm }
                Label { anchors.centerIn: parent; text: "＋"; font.pixelSize: Math.round(20 * look.textScale); color: look.muted }
                TapHandler { onTapped: { actions.close(); picker.open() } } }
        }
        MenuItem { text: "Reply"; onTriggered: { pane.editing = ""; pane.replyingTo = pane.target; input.forceActiveFocus() } }
        MenuItem { text: "Edit"; visible: pane.targetMine; height: visible ? implicitHeight : 0; onTriggered: { pane.replyingTo = ""; pane.editing = pane.target; input.text = core.bodyOf(pane.target); input.forceActiveFocus() } }
        MenuItem { text: "Copy text"; onTriggered: { input.selectAll(); clip.text = core.bodyOf(pane.target); clip.selectAll(); clip.copy() } }
        MenuItem { text: "Delete"; visible: pane.targetMine; height: visible ? implicitHeight : 0; onTriggered: core.deleteMessage(pane.target) }
    }
    TextEdit { id: clip; visible: false }
}
