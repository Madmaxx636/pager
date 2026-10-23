import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// Pick a chat to send a message on to.
Dialog {
    id: dlg
    property string event
    function openFor(id) { event = id; search.text = ""; open(); search.forceActiveFocus() }
    modal: true; anchors.centerIn: Overlay.overlay
    width: Math.min(400, Overlay.overlay ? Overlay.overlay.width - 32 : 400); height: Math.min(520, Overlay.overlay ? Overlay.overlay.height - 40 : 520)
    title: "Forward to…"; standardButtons: Dialog.Cancel
    background: Rectangle { color: look.panel; radius: 14; border.color: look.line }
    contentItem: ColumnLayout {
        spacing: 8
        TextField { id: search; Layout.fillWidth: true; placeholderText: "Search chats"; color: look.text; placeholderTextColor: look.muted; background: Rectangle { radius: 18; color: look.panel2 }
            leftPadding: 14 }
        ListView {
            Layout.fillWidth: true; Layout.fillHeight: true; clip: true; model: core.chatChoices(search.text); boundsBehavior: Flickable.StopAtBounds
            ScrollBar.vertical: ScrollBar { }
            delegate: Rectangle { width: ListView.view.width; height: 54; color: hov.hovered ? look.panel2 : "transparent"; radius: 8
                HoverHandler { id: hov }
                RowLayout { anchors.fill: parent; anchors.leftMargin: 8; spacing: 10
                    Avatar { source: modelData.avatar; letter: modelData.name.length ? modelData.name[0].toUpperCase() : "?"; seed: modelData.name; size: 38; network: modelData.network }
                    Label { Layout.fillWidth: true; text: modelData.name; color: look.text; elide: Text.ElideRight } }
                TapHandler { onTapped: { core.forward(dlg.event, modelData.id); dlg.close() } } }
        }
    }
}
