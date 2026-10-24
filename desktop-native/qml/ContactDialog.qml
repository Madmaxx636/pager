import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// Share a contact: sent as a vCard file the other person can save.
Dialog {
    id: dlg
    modal: true; anchors.centerIn: Overlay.overlay; width: Math.min(440, Overlay.overlay ? Overlay.overlay.width - 32 : 440); title: "Share a contact"
    onAboutToShow: { who.text = ""; num.text = ""; Qt.callLater(who.focusField) }
    function send() { if (who.text.trim().length && num.text.trim().length) { core.sendContact(who.text.trim(), num.text.trim()); dlg.close() } }
    ColumnLayout { width: parent.width; spacing: 10
        FField { id: who; label: "Name"; onAccepted: num.focusField() }
        FField { id: num; label: "Phone number"; placeholder: "+1 555 010 4242"; inputMethodHints: Qt.ImhDialableCharactersOnly; onAccepted: dlg.send() }
        Button { Layout.fillWidth: true; text: "Send contact card"; highlighted: true; enabled: who.text.trim().length > 0 && num.text.trim().length > 0; onClicked: dlg.send() }
        Label { Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.muted; font.pixelSize: Math.round(12 * look.textScale); text: "Sent as a vCard file the other person can save." } }
}
