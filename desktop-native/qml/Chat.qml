import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Rectangle {
    id: pane
    color: look.bg
    property bool showBack: false
    signal back()

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
                    contentItem: Label { text: backBtn.text; color: look.text; font.pixelSize: 22; horizontalAlignment: Text.AlignHCenter }
                    background: Rectangle { color: "transparent" }
                    onClicked: pane.back()
                }
                Avatar { visible: core.currentRoom.length > 0; letter: core.currentName.length ? core.currentName[0].toUpperCase() : "?"; seed: core.currentName; size: 40 }
                ColumnLayout {
                    spacing: 0
                    Label { text: core.currentName; color: look.text; font.pixelSize: 16; font.weight: Font.DemiBold }
                    Label { text: core.currentSub; color: look.muted; font.pixelSize: 12 }
                }
                Item { Layout.fillWidth: true }
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
                reactions: model.reactions; day: model.day
                showName: !core.currentIsDirect
            }
            // reaching the oldest message asks for older ones
            onAtYEndChanged: if (atYEnd && count > 0) core.loadOlder()
            Label { anchors.centerIn: parent; visible: core.currentRoom.length === 0; text: "Pick a chat"; color: look.muted; font.pixelSize: 16 }
        }
        // composer
        Rectangle {
            visible: core.currentRoom.length > 0
            Layout.fillWidth: true; color: look.panel; implicitHeight: Math.min(input.implicitHeight, 160) + 24
            Rectangle { width: parent.width; height: 1; color: look.line }
            RowLayout {
                anchors.fill: parent; anchors.margins: 12; spacing: 10
                ScrollView {
                    Layout.fillWidth: true; Layout.fillHeight: true
                    TextArea {
                        id: input
                        placeholderText: "Message"
                        placeholderTextColor: look.muted; color: look.text; font.pixelSize: 15
                        wrapMode: TextArea.Wrap; leftPadding: 16; rightPadding: 16; topPadding: 9; bottomPadding: 9
                        background: Rectangle { radius: 20; color: look.panel2 }
                        Keys.onPressed: (e) => { if ((e.key === Qt.Key_Return || e.key === Qt.Key_Enter) && !(e.modifiers & Qt.ShiftModifier)) { e.accepted = true; sendIt() } }
                    }
                }
                Button {
                    id: sendBtn
                    Layout.alignment: Qt.AlignBottom
                    enabled: input.text.trim().length > 0
                    contentItem: Label { text: "➤"; color: look.accentInk; font.pixelSize: 18; horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter }
                    background: Rectangle { implicitWidth: 40; implicitHeight: 40; radius: 20; color: sendBtn.enabled ? look.accent : look.muted }
                    onClicked: sendIt()
                }
            }
        }
    }
    function sendIt() { if (input.text.trim().length) { core.send(input.text); input.clear() } }
}
