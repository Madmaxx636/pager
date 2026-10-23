import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// Share a contact: sent as a vCard file the other person can save.
Dialog {
    id: dlg
    modal: true; anchors.centerIn: Overlay.overlay; width: Math.min(400, Overlay.overlay ? Overlay.overlay.width - 32 : 400); title: "Share a contact"
    standardButtons: Dialog.Cancel | Dialog.Ok
    onAboutToShow: { who.text = ""; num.text = ""; who.forceActiveFocus() }
    onAccepted: core.sendContact(who.text, num.text)
    Component.onCompleted: standardButton(Dialog.Ok).enabled = Qt.binding(() => who.text.trim().length > 0 && num.text.trim().length > 0)
    ColumnLayout { width: parent.width; spacing: 8
        Label { text: "Name"; color: look.muted }
        TextField { id: who; Layout.fillWidth: true }
        Label { text: "Phone number"; color: look.muted }
        TextField { id: num; Layout.fillWidth: true; placeholderText: "+1 555 010 4242"; inputMethodHints: Qt.ImhDialableCharactersOnly }
        Label { Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.muted; font.pixelSize: Math.round(12 * look.textScale); text: "Sent as a vCard file the other person can save." } }
}
