import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "Networks.js" as N

// About the open chat: who is in it, and what you can do with it.
Rectangle {
    id: panel
    color: look.panel
    property var info: core.roomInfo(core.currentRoom)
    property var people: core.members()
    Connections { target: core; function onCurrentChanged() { panel.info = core.roomInfo(core.currentRoom); panel.people = core.members() } function onListChanged() { panel.info = core.roomInfo(core.currentRoom) } }
    signal closeRequested()

    Rectangle { anchors.left: parent.left; width: 1; height: parent.height; color: look.line }
    Flickable {
        id: scroller
        anchors.fill: parent; contentHeight: col.implicitHeight + 30; clip: true; boundsBehavior: Flickable.StopAtBounds
        ScrollBar.vertical: ScrollBar { }
        SmoothWheel { view: scroller }
        ColumnLayout {
            id: col; width: parent.width - 32; x: 16; y: 16; spacing: 12
            RowLayout { Layout.fillWidth: true
                Label { text: "Chat info"; color: look.text; font.pixelSize: Math.round(18 * look.textScale); font.weight: Font.Bold; Layout.fillWidth: true }
                ToolButton { text: "✕"; onClicked: panel.closeRequested() } }
            Avatar { Layout.alignment: Qt.AlignHCenter; size: 96; source: core.currentAvatar; letter: core.currentName.length ? core.currentName[0].toUpperCase() : "?"; seed: core.currentName; network: core.currentNetwork }
            Label { Layout.alignment: Qt.AlignHCenter; Layout.fillWidth: true; horizontalAlignment: Text.AlignHCenter; text: core.currentName; color: look.text; font.pixelSize: Math.round(20 * look.textScale); font.weight: Font.DemiBold; wrapMode: Text.Wrap }
            Label { Layout.alignment: Qt.AlignHCenter; text: core.currentSub; color: look.muted; font.pixelSize: Math.round(12 * look.textScale) }

            component Row2: RowLayout {
                property string label; property string hint: ""; property alias checked: sw.checked; signal toggled(bool on)
                Layout.fillWidth: true
                ColumnLayout { Layout.fillWidth: true; spacing: 0
                    Label { text: parent.parent.label; color: look.text; font.pixelSize: Math.round(14 * look.textScale) }
                    Label { visible: parent.parent.hint.length > 0; text: parent.parent.hint; color: look.muted; font.pixelSize: Math.round(11 * look.textScale); wrapMode: Text.Wrap; Layout.fillWidth: true } }
                Switch { id: sw; onToggled: parent.toggled(checked) }
            }
            Row2 { label: "Pinned"; checked: !!panel.info.pinned; onToggled: (on) => core.pin(core.currentRoom, on) }
            Row2 { label: "Muted"; hint: "No alerts from this chat"; checked: !!panel.info.muted; onToggled: (on) => core.setMuted(core.currentRoom, on) }
            Row2 { label: "Archived"; checked: !!panel.info.archived; onToggled: (on) => core.archive(core.currentRoom, on) }
            Row2 { label: "Low priority"; hint: "Quiet except for mentions"; checked: !!panel.info.lowPriority; onToggled: (on) => core.setLowPriority(core.currentRoom, on) }
            Row2 { label: "Mark as unread"; checked: !!panel.info.markedUnread; onToggled: (on) => { if (on) core.markUnread(core.currentRoom, true); else core.markRead(core.currentRoom) } }

            Label { visible: !!panel.info.labels && panel.info.labels.length > 0; text: "Labels: " + (panel.info.labels ? panel.info.labels.join(", ") : ""); color: look.muted; font.pixelSize: Math.round(12 * look.textScale); Layout.fillWidth: true; wrapMode: Text.Wrap }

            Label { visible: panel.people.length > 0; text: panel.people.length + (panel.people.length === 1 ? " person" : " people"); color: look.accent; font.pixelSize: Math.round(12 * look.textScale); font.weight: Font.Bold; font.capitalization: Font.AllUppercase; Layout.topMargin: 6 }
            Repeater {
                model: panel.people
                delegate: RowLayout { Layout.fillWidth: true; spacing: 10
                    Avatar { size: 36; source: modelData.avatar; letter: modelData.name.length ? modelData.name[0].toUpperCase() : "?"; seed: modelData.id }
                    Label { Layout.fillWidth: true; text: modelData.name + (modelData.you ? " (you)" : ""); color: look.text; elide: Text.ElideRight; font.pixelSize: Math.round(14 * look.textScale) } }
            }
            Button { text: "Rename chat…"; visible: !!panel.info.isGroup; Layout.fillWidth: true; onClicked: renameDlg.open() }
            Button { text: "Delete chat…"; Layout.fillWidth: true; onClicked: panel.closeRequested() ; enabled: false; visible: false }
        }
    }
    Dialog {
        id: renameDlg
        modal: true; anchors.centerIn: Overlay.overlay; title: "Rename chat"; standardButtons: Dialog.Cancel | Dialog.Ok; width: Math.min(380, Overlay.overlay ? Overlay.overlay.width - 32 : 380)
        background: Rectangle { color: look.panel; radius: 14; border.color: look.line }
        onAboutToShow: nameField.text = core.currentName
        TextField { id: nameField; width: parent.width; color: look.text; onAccepted: renameDlg.accept(); background: Rectangle { color: look.bg; radius: 8; border.color: look.line } }
        onAccepted: core.renameRoom(core.currentRoom, nameField.text)
    }
}
