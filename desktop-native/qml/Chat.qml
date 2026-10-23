import QtQuick
import QtQuick.Controls
import QtQuick.Dialogs
import QtQuick.Layouts
import "Networks.js" as N

// The open chat: header, messages, and the box you write in.
Rectangle {
    id: pane
    color: look.bg
    property bool showBack: false
    property bool infoOpen: false
    signal back()
    signal restoreRequested()
    signal toggleInfo()
    signal searchRequested()
    property string jumpTarget: ""
    onJumpTargetChanged: if (jumpTarget.length) { pane.jumpTo(jumpTarget); jumpTarget = "" }
    property string target: ""; property bool targetMine: false        // the message a menu was opened on
    property string replyingTo: ""; property string editing: ""        // set while the composer is answering or editing
    property string highlight: ""
    readonly property string barText: editing ? "Editing message" : (replyingTo ? "Replying to " + core.nameOfMessage(replyingTo) + ": " + core.bodyOf(replyingTo) : "")
    readonly property string roomId: core.currentRoom

    function jumpTo(id) {
        const r = core.timeline.rowOfMessage(id)
        if (r < 0) return
        msgs.positionViewAtIndex(r, ListView.Center); highlight = id; flash.restart()
    }
    function sendIt() {
        if (!input.text.trim().length) return
        if (editing) core.edit(editing, input.text); else core.send(input.text, replyingTo, settings.markdown)
        input.clear(); editing = ""; replyingTo = ""
        msgs.positionViewAtBeginning()
    }
    function attach(urls) { for (const u of urls) { const p = files.path(u); if (!p.length) continue; const sz = files.imageSize(p); core.sendFile(p, files.mime(p), sz.width, sz.height) } }
    Timer { id: flash; interval: 1400; onTriggered: pane.highlight = "" }

    onRoomIdChanged: {
        replyingTo = ""; editing = ""
        input.text = core.draft(roomId)
        Qt.callLater(function () { const r = core.dividerRow(); if (r >= 0) msgs.positionViewAtIndex(r, ListView.Center); else msgs.positionViewAtBeginning() })
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 0
        // ---- header
        Rectangle {
            Layout.fillWidth: true; height: 64; color: look.panel
            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: look.line }
            RowLayout {
                anchors.fill: parent; anchors.leftMargin: 10; anchors.rightMargin: 12; spacing: 10
                ToolButton {
                    id: backBtn; visible: pane.showBack; onClicked: pane.back()
                    contentItem: Label { text: "←"; color: look.text; font.pixelSize: 22; horizontalAlignment: Text.AlignHCenter }
                    background: Rectangle { color: "transparent" }
                }
                RowLayout {
                    Layout.fillWidth: true; spacing: 10; visible: core.currentRoom.length > 0
                    Avatar { source: core.currentAvatar; letter: core.currentName.length ? core.currentName[0].toUpperCase() : "?"; seed: core.currentName; size: 42; network: core.currentNetwork }
                    ColumnLayout {
                        spacing: 0; Layout.fillWidth: true
                        Label { text: core.currentName; color: look.text; font.pixelSize: Math.round(16 * look.textScale); font.weight: Font.DemiBold; elide: Text.ElideRight; Layout.fillWidth: true }
                        Label {
                            Layout.fillWidth: true; elide: Text.ElideRight; font.pixelSize: Math.round(12 * look.textScale)
                            text: core.currentTyping.length ? core.currentTyping : core.currentSub; color: core.currentTyping.length ? look.accent : look.muted; font.italic: core.currentTyping.length > 0
                        }
                    }
                    TapHandler { onTapped: pane.toggleInfo() }
                }
                Item { Layout.fillWidth: true; visible: core.currentRoom.length === 0 }
                IconButton { visible: core.currentRoom.length > 0; symbol: "⌕"; glyphSize: 22; onClicked: pane.searchRequested(); ToolTip.text: "Search this chat (Ctrl+F)"; ToolTip.visible: hovered; ToolTip.delay: 600 }
                ToolButton {
                    visible: core.currentRoom.length > 0; id: infoBtn; onClicked: pane.toggleInfo(); ToolTip.text: "Chat info"; ToolTip.visible: hovered; ToolTip.delay: 600
                    contentItem: Label { text: "ⓘ"; color: pane.infoOpen ? look.accent : look.muted; font.pixelSize: 22; horizontalAlignment: Text.AlignHCenter }
                    background: Rectangle { radius: 18; color: infoBtn.hovered ? look.panel2 : "transparent" }
                }
            }
        }
        // ---- some messages cannot be read yet
        Rectangle {
            visible: core.currentLocked > 0
            Layout.fillWidth: true; implicitHeight: lockRow.implicitHeight + 16; color: Qt.rgba(look.accent.r, look.accent.g, look.accent.b, 0.14)
            RowLayout {
                id: lockRow; anchors.fill: parent; anchors.margins: 8; anchors.leftMargin: 14
                Label { Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.text; font.pixelSize: Math.round(13 * look.textScale)
                    text: "🔒 " + core.currentLocked + (core.currentLocked === 1 ? " message is" : " messages are") + " locked on this device. Enter your recovery key to read them." }
                Button { text: "Enter recovery key"; onClicked: pane.restoreRequested() }
            }
        }
        // ---- the messages
        Item {
            Layout.fillWidth: true; Layout.fillHeight: true
            ListView {
                id: msgs
                anchors.fill: parent
                clip: true
                // the list is upside down (newest first), so the newest message stays at the bottom by itself
                verticalLayoutDirection: ListView.BottomToTop
                model: core.timeline
                spacing: 0; cacheBuffer: 900
                boundsBehavior: Flickable.StopAtBounds
                ScrollBar.vertical: ScrollBar { }
                SmoothWheel { view: msgs }
                delegate: Bubble {
                    showName: core.currentIsGroup
                    onMenuRequested: (id, mine, gx, gy) => { pane.target = id; pane.targetMine = mine; actions.popup() }
                    onReactionTapped: (id, key) => core.react(id, key)
                    onJumpTo: (id) => pane.jumpTo(id)
                    onOpenMedia: (id) => viewer.show(id)
                    onReplyRequested: (id) => { pane.editing = ""; pane.replyingTo = id; input.forceActiveFocus() }
                    Rectangle { anchors.fill: parent; z: -1; color: look.accent; opacity: pane.highlight === eventId ? 0.18 : 0; Behavior on opacity { NumberAnimation { duration: 300 } } }
                }
                onAtYEndChanged: core.setAtBottom(atYEnd)
                // reaching the oldest message asks for older ones
                onContentYChanged: if (count > 0 && !dragging && contentY - originY < 900) core.loadOlder()
                Label { anchors.centerIn: parent; visible: core.currentRoom.length === 0; text: "Pick a chat"; color: look.muted; font.pixelSize: Math.round(16 * look.textScale) }
                Label { anchors.centerIn: parent; visible: core.currentRoom.length > 0 && msgs.count === 0; text: core.loading ? "Loading…" : "No messages yet. Say hello!"; color: look.muted; font.pixelSize: Math.round(14 * look.textScale) }
            }
            // back to the newest
            Rectangle {
                visible: !msgs.atYEnd && msgs.count > 0
                width: 40; height: 40; radius: 20; color: look.panel; border.width: 1; border.color: look.line
                anchors.right: parent.right; anchors.bottom: parent.bottom; anchors.margins: 16
                Label { anchors.centerIn: parent; text: "↓"; color: look.text; font.pixelSize: 20 }
                TapHandler { onTapped: msgs.positionViewAtBeginning() }
                layer.enabled: true
            }
        }
        // ---- who is typing
        Label {
            visible: core.currentTyping.length > 0 && false
            Layout.fillWidth: true; leftPadding: 16; text: core.currentTyping; color: look.muted; font.pixelSize: 12
        }
        // ---- what the box is answering or editing
        Rectangle {
            visible: pane.barText.length > 0
            Layout.fillWidth: true; implicitHeight: 38; color: look.panel2
            Rectangle { width: 3; height: parent.height; color: look.accent }
            RowLayout { anchors.fill: parent; anchors.leftMargin: 14; anchors.rightMargin: 8
                Label { Layout.fillWidth: true; text: pane.barText; color: look.muted; font.pixelSize: Math.round(13 * look.textScale); elide: Text.ElideRight }
                IconButton { symbol: "✕"; glyphSize: 16; onClicked: { pane.replyingTo = ""; pane.editing = ""; input.clear() } } }
        }
        // ---- the box you write in
        Rectangle {
            visible: core.currentRoom.length > 0
            Layout.fillWidth: true; color: look.panel; implicitHeight: Math.min(Math.max(input.implicitHeight, 40), 170) + 20
            Rectangle { width: parent.width; height: 1; color: look.line }
            RowLayout {
                anchors.fill: parent; anchors.margins: 10; spacing: 6
                ToolButton {
                    id: plus; Layout.alignment: Qt.AlignBottom; onClicked: attachMenu.popup(); ToolTip.text: "Attach"; ToolTip.visible: hovered; ToolTip.delay: 600
                    contentItem: Label { text: "＋"; color: look.muted; font.pixelSize: 24; horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter }
                    background: Rectangle { implicitWidth: 40; implicitHeight: 40; radius: 20; color: plus.hovered ? look.panel2 : "transparent" }
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
                        placeholderText: "Message"; placeholderTextColor: look.muted; color: look.text; font.pixelSize: Math.round(15 * look.textScale); selectByMouse: true
                        wrapMode: TextArea.Wrap; leftPadding: 16; rightPadding: 40; topPadding: 9; bottomPadding: 9
                        background: Rectangle { radius: 20; color: look.panel2 }
                        onTextChanged: { core.setTyping(text.length > 0 && settings.sendTyping); draftTimer.restart() }
                        Keys.onPressed: (e) => {
                            if ((e.key === Qt.Key_V) && (e.modifiers & Qt.ControlModifier) && files.clipboardHasImage()) {
                                e.accepted = true; const p = files.saveClipboardImage(); if (p.length) { const sz = files.imageSize(p); core.sendFile(p, "image/png", sz.width, sz.height) }
                                return
                            }
                            if (e.key !== Qt.Key_Return && e.key !== Qt.Key_Enter) return
                            const wantsSend = settings.enterToSend ? !(e.modifiers & Qt.ShiftModifier) : (e.modifiers & Qt.ControlModifier)
                            if (wantsSend) { e.accepted = true; pane.sendIt() }
                        }
                        Keys.onEscapePressed: { pane.replyingTo = ""; pane.editing = "" }
                        Label { text: "☺"; color: emojiHover.hovered ? look.accent : look.muted; font.pixelSize: 20; anchors.right: parent.right; anchors.rightMargin: 12; anchors.bottom: parent.bottom; anchors.bottomMargin: 8
                            HoverHandler { id: emojiHover; cursorShape: Qt.PointingHandCursor }
                            TapHandler { onTapped: inputEmoji.open() } }
                    }
                }
                Button {
                    id: sendBtn
                    Layout.alignment: Qt.AlignBottom
                    enabled: input.text.trim().length > 0
                    contentItem: Label { text: "➤"; color: look.accentInk; font.pixelSize: 18; horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter }
                    background: Rectangle { implicitWidth: 40; implicitHeight: 40; radius: 20; color: sendBtn.enabled ? look.accent : look.muted }
                    onClicked: pane.sendIt()
                }
            }
            Timer { id: draftTimer; interval: 600; onTriggered: core.setDraft(pane.roomId, input.text) }
        }
    }

    // drop files anywhere on the chat to send them
    DropArea {
        anchors.fill: parent; keys: ["text/uri-list"]
        onDropped: (d) => { if (d.hasUrls) pane.attach(d.urls) }
        Rectangle { anchors.fill: parent; visible: parent.containsDrag; color: Qt.rgba(look.accent.r, look.accent.g, look.accent.b, 0.12); border.width: 3; border.color: look.accent
            Label { anchors.centerIn: parent; text: "Drop to send"; color: look.accent; font.pixelSize: 22; font.weight: Font.Bold } }
    }

    PollDialog { id: pollDialog }
    FileDialog { id: filePicker; title: "Send a photo or file"; fileMode: FileDialog.OpenFiles; onAccepted: pane.attach(selectedFiles) }
    EmojiPicker { id: picker; onPicked: (e) => core.react(pane.target, e) }
    EmojiPicker { id: inputEmoji; onPicked: (e) => { input.insert(input.cursorPosition, e); input.forceActiveFocus() } }
    ImageViewer { id: viewer }
    FileDialog { id: saveDialog; property string event; fileMode: FileDialog.SaveFile; onAccepted: { if (!core.saveCopy(event, files.path(selectedFile))) saveError.open() } }
    Dialog { id: saveError; modal: true; anchors.centerIn: Overlay.overlay; title: "Couldn't save"; standardButtons: Dialog.Ok; background: Rectangle { color: look.panel; radius: 12; border.color: look.line }
        Label { text: "The file couldn't be saved there."; color: look.text } }
    Dialog {
        id: details; property string text_
        modal: true; anchors.centerIn: Overlay.overlay; width: Math.min(420, Overlay.overlay ? Overlay.overlay.width - 32 : 420); title: "Message details"; standardButtons: Dialog.Close
        background: Rectangle { color: look.panel; radius: 12; border.color: look.line }
        Label { text: details.text_; color: look.text; wrapMode: Text.Wrap; width: parent.width; font.pixelSize: Math.round(13 * look.textScale) }
    }
    ForwardDialog { id: forward }
    Dialog {
        id: confirmDelete
        modal: true; anchors.centerIn: Overlay.overlay; title: "Delete this message?"; standardButtons: Dialog.Cancel | Dialog.Ok
        background: Rectangle { color: look.panel; radius: 12; border.color: look.line }
        Label { text: "It is removed for everyone in the chat."; color: look.text }
        onAccepted: core.deleteMessage(pane.target)
    }

    Menu {
        id: actions
        Row {
            padding: 6; spacing: 2
            Repeater {
                model: settings.quickReactions
                delegate: Rectangle { width: 36; height: 36; radius: 8; color: h.hovered ? look.panel2 : "transparent"
                    HoverHandler { id: h }
                    Label { anchors.centerIn: parent; text: modelData; font.pixelSize: 22 }
                    TapHandler { onTapped: { core.react(pane.target, modelData); actions.close() } } }
            }
            Rectangle { width: 36; height: 36; radius: 8; color: hm.hovered ? look.panel2 : "transparent"
                HoverHandler { id: hm }
                Label { anchors.centerIn: parent; text: "＋"; font.pixelSize: 20; color: look.muted }
                TapHandler { onTapped: { actions.close(); picker.open() } } }
        }
        MenuItem { text: "Reply"; onTriggered: { pane.editing = ""; pane.replyingTo = pane.target; input.forceActiveFocus() } }
        MenuItem { text: "Copy text"; onTriggered: files.copy(core.bodyOf(pane.target)) }
        MenuItem { text: "Forward…"; onTriggered: forward.openFor(pane.target) }
        MenuItem { text: "Save file…"; visible: core.isMediaMessage(pane.target); height: visible ? implicitHeight : 0
            onTriggered: { saveDialog.event = pane.target; core.fetchFull(pane.target); saveDialog.currentFile = "file://" + files.downloadsDir() + "/" + core.fileNameOf(pane.target); saveDialog.open() } }
        MenuItem { text: "Edit"; visible: pane.targetMine && !core.isMediaMessage(pane.target); height: visible ? implicitHeight : 0; onTriggered: { pane.replyingTo = ""; pane.editing = pane.target; input.text = core.bodyOf(pane.target); input.forceActiveFocus() } }
        MenuItem { text: "Details"; onTriggered: { details.text_ = core.messageDetails(pane.target); details.open() } }
        MenuItem { text: "Delete"; visible: pane.targetMine; height: visible ? implicitHeight : 0; onTriggered: confirmDelete.open() }
    }
}
