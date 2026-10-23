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
                anchors.fill: parent; anchors.leftMargin: 14; anchors.rightMargin: 10; spacing: 6
                IconButton { visible: pane.showBack; ico: "arrow-left"; onClicked: pane.back() }
                Item {
                    Layout.fillWidth: true; Layout.fillHeight: true; visible: core.currentRoom.length > 0
                    RowLayout {
                        anchors.verticalCenter: parent.verticalCenter; spacing: 12
                        Avatar { source: core.currentAvatar; letter: core.currentName.length ? core.currentName[0].toUpperCase() : "?"; seed: core.currentName; size: 40; network: core.currentNetwork }
                        ColumnLayout {
                            spacing: 0
                            RowLayout { spacing: 4
                                Label { text: core.currentName; color: look.text; font.pixelSize: Math.round(16 * look.textScale); font.weight: Font.DemiBold; elide: Text.ElideRight; Layout.maximumWidth: pane.width - 330 }
                                Icon { name: "chevron-down"; size: 15; color: look.muted } }
                            Label { visible: text.length > 0; text: core.currentTyping.length ? core.currentTyping : core.currentSub; color: core.currentTyping.length ? look.accent : look.muted; font.pixelSize: Math.round(12 * look.textScale); font.italic: core.currentTyping.length > 0 }
                        }
                    }
                    TapHandler { onTapped: pane.toggleInfo() }
                    HoverHandler { cursorShape: Qt.PointingHandCursor }
                }
                Item { Layout.fillWidth: true; visible: core.currentRoom.length === 0 }
                IconButton { visible: core.currentRoom.length > 0; ico: "search"; onClicked: pane.searchRequested(); ToolTip.text: "Search in page (Ctrl+F)"; ToolTip.visible: hovered }
                IconButton { visible: core.currentRoom.length > 0; ico: "info"; tint: pane.infoOpen ? look.accent : look.muted; onClicked: pane.toggleInfo(); ToolTip.text: "Page info"; ToolTip.visible: hovered }
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
                Icon { anchors.centerIn: parent; name: "arrow-down"; size: 20; color: look.text }
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
                IconButton { ico: "x"; iconSize: 16; implicitWidth: 30; implicitHeight: 30; onClicked: { pane.replyingTo = ""; pane.editing = ""; input.clear() } } }
        }
        // ---- the box you write in
        Rectangle {
            visible: core.currentRoom.length > 0
            Layout.fillWidth: true; color: look.panel; implicitHeight: Math.min(Math.max(input.implicitHeight, 44), 170) + 20
            Rectangle { width: parent.width; height: 1; color: look.line }
            RowLayout {
                anchors.fill: parent; anchors.leftMargin: 12; anchors.rightMargin: 12; anchors.topMargin: 10; anchors.bottomMargin: 10; spacing: 8
                IconButton {
                    id: plus; Layout.alignment: Qt.AlignBottom; ico: "plus"; iconSize: 22; implicitWidth: 44; implicitHeight: 44; tint: look.accent
                    onClicked: attachMenu.popup(); ToolTip.text: "Attach"; ToolTip.visible: hovered; ToolTip.delay: 600
                    Menu {
                        id: attachMenu
                        MenuItem { icon.name: "image-plus"; text: "Photo or file…"; onTriggered: filePicker.open() }
                        MenuItem { icon.name: "chart-column"; text: "Poll…"; onTriggered: pollDialog.open() }
                    }
                }
                Rectangle {
                    Layout.fillWidth: true; Layout.fillHeight: true; radius: 24; color: look.panel2
                    ScrollView {
                        anchors.fill: parent; anchors.leftMargin: 4; anchors.rightMargin: 44
                        TextArea {
                            id: input
                            placeholderText: "Message " + core.currentName.split(" ")[0] + (core.currentNetworkLabel.length ? " · " + core.currentNetworkLabel : "")
                            leftPadding: 12; rightPadding: 4; topPadding: 12; bottomPadding: 12
                            background: Item { }
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
                        }
                    }
                    IconButton { anchors.right: parent.right; anchors.rightMargin: 4; anchors.bottom: parent.bottom; anchors.bottomMargin: 3; ico: "smile"; iconSize: 21; onClicked: inputEmoji.open(); ToolTip.text: "Emoji"; ToolTip.visible: hovered; ToolTip.delay: 600 }
                }
                Rectangle {
                    id: sendBtn
                    Layout.alignment: Qt.AlignBottom; implicitWidth: 46; implicitHeight: 46; radius: 23; color: look.accent
                    readonly property bool hasText: input.text.trim().length > 0
                    Icon { anchors.centerIn: parent; name: sendBtn.hasText ? "send" : "mic"; size: 21; color: look.accentInk }
                    TapHandler { onTapped: { if (sendBtn.hasText) pane.sendIt(); else voiceDialog.start() } }
                    TapHandler { acceptedButtons: Qt.RightButton; enabled: sendBtn.hasText; onTapped: scheduleDialog.openFor(pane.roomId, input.text) }
                    HoverHandler { cursorShape: Qt.PointingHandCursor }
                    ToolTip.visible: sendHover.hovered; ToolTip.text: sendBtn.hasText ? "Send (right-click to schedule)" : "Record a voice message"; ToolTip.delay: 600
                    HoverHandler { id: sendHover }
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
    // recording (and the multimedia libraries behind it) is loaded the first time you press the microphone
    Loader { id: voiceLoader; active: false; source: "VoiceDialog.qml"; onLoaded: item.start() }
    QtObject { id: voiceDialog; function start() { if (voiceLoader.active) voiceLoader.item.start(); else voiceLoader.active = true } }
    ScheduleDialog { id: scheduleDialog; onScheduled: { input.clear() } }
    FileDialog { id: filePicker; title: "Send a photo or file"; fileMode: FileDialog.OpenFiles; onAccepted: pane.attach(selectedFiles) }
    EmojiPicker { id: picker; onPicked: (e) => core.react(pane.target, e) }
    EmojiPicker { id: inputEmoji; onPicked: (e) => { input.insert(input.cursorPosition, e); input.forceActiveFocus() } }
    // the viewer (pictures and video, with the multimedia libraries) is loaded the first time something is opened
    Loader { id: viewerLoader; property string pendingId; active: false; source: "ImageViewer.qml"; onLoaded: item.show(viewerLoader.pendingId) }
    QtObject { id: viewer; function show(id) { viewerLoader.pendingId = id; if (viewerLoader.active) viewerLoader.item.show(id); else viewerLoader.active = true } }
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
        MenuItem { icon.name: "reply"; text: "Reply"; onTriggered: { pane.editing = ""; pane.replyingTo = pane.target; input.forceActiveFocus() } }
        MenuItem { icon.name: "forward"; text: "Forward"; onTriggered: forward.openFor(pane.target) }
        MenuItem { icon.name: "copy"; text: "Copy text"; visible: !core.isMediaMessage(pane.target); height: visible ? implicitHeight : 0; onTriggered: files.copy(core.bodyOf(pane.target)) }
        MenuItem { icon.name: "star"; text: core.isStarred(pane.target) ? "Remove star" : "Star"; onTriggered: core.toggleStar(pane.target) }
        MenuItem { icon.name: "download"; text: "Save"; visible: core.isMediaMessage(pane.target); height: visible ? implicitHeight : 0
            onTriggered: { saveDialog.event = pane.target; core.fetchFull(pane.target); saveDialog.currentFile = "file://" + files.downloadsDir() + "/" + core.fileNameOf(pane.target); saveDialog.open() } }
        MenuItem { icon.name: "pencil"; text: "Edit"; visible: pane.targetMine && !core.isMediaMessage(pane.target); height: visible ? implicitHeight : 0; onTriggered: { pane.replyingTo = ""; pane.editing = pane.target; input.text = core.bodyOf(pane.target); input.forceActiveFocus() } }
        MenuItem { icon.name: "info"; text: "Details"; onTriggered: { details.text_ = core.messageDetails(pane.target); details.open() } }
        MenuItem { icon.name: "trash-2"; text: "Delete"; visible: pane.targetMine; height: visible ? implicitHeight : 0; onTriggered: confirmDelete.open() }
    }
}
