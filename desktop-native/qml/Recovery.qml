import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Dialog {
    id: dlg
    modal: true; anchors.centerIn: Overlay.overlay
    width: Math.min(460, Overlay.overlay ? Overlay.overlay.width - 32 : 460)
    property bool changed: false      // opened because another device made a new recovery key
    title: changed ? "Your recovery key was changed" : "Restore old messages"
    standardButtons: Dialog.NoButton
    onOpened: { core.resetRecovery(); keyField.text = ""; keyField.forceActiveFocus() }

    contentItem: ColumnLayout {
        spacing: 10
        Label {
            Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.muted; font.pixelSize: Math.round(13 * look.textScale)
            text: dlg.changed ? "A new recovery key was made on another device. Enter the new key so this device can read the new backup and keep saving to it." : "A new sign-in can't read messages from before it existed. Paste the recovery key you saved when you set up Pager's backup and the keys come back from your server."
        }
        TextField {
            id: keyField; objectName: "keyField"; Layout.fillWidth: true; placeholderText: "Recovery key"; enabled: !core.recovering && !core.recoveryDone
            color: look.text; font.pixelSize: Math.round(14 * look.textScale); selectByMouse: true
            background: Rectangle { color: look.bg; radius: 8; border.color: keyField.activeFocus ? look.accent : look.line }
            onAccepted: restore.clicked()
        }
        Button { text: "Paste from clipboard"; flat: true; visible: !core.recovering && !core.recoveryDone; onClicked: { keyField.clear(); keyField.paste(); keyField.forceActiveFocus() } }
        Label {
            Layout.fillWidth: true; wrapMode: Text.Wrap; visible: text.length > 0; font.pixelSize: Math.round(13 * look.textScale)
            text: core.recoveryMessage; color: core.recoveryDone ? look.accent : (core.recovering ? look.muted : "#e5484d")
        }
        RowLayout {
            Layout.fillWidth: true; Layout.topMargin: 6
            Item { Layout.fillWidth: true }
            Button { text: core.recoveryDone ? "Close" : (dlg.changed ? "Later" : "Cancel"); onClicked: dlg.close() }
            Button {
                id: restore; text: "Restore"; visible: !core.recoveryDone; enabled: !core.recovering && keyField.text.trim().length > 0
                onClicked: core.recover(keyField.text)
            }
        }
    }
}
