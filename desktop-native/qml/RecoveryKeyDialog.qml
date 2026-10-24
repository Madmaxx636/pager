import QtQuick
import QtQuick.Controls
import QtQuick.Dialogs
import QtQuick.Layouts

// Make a new recovery key. It is shown once: it is what lets a new device read your history, and nobody (not even Pager) can recover it for you.
Dialog {
    id: dlg
    property string key: ""; property string err: ""; property bool busy: false; property bool reset: false   // reset: wipe the old backup and make one new key for every device
    modal: true; anchors.centerIn: Overlay.overlay; width: Math.min(460, Overlay.overlay ? Overlay.overlay.width - 32 : 460)
    title: key.length ? (reset ? "Your new recovery key" : "Your recovery key") : (reset ? "Reset your recovery key everywhere?" : "Make a new recovery key?")
    standardButtons: key.length ? Dialog.NoButton : Dialog.Cancel
    background: Rectangle { color: look.panel; radius: 14; border.color: look.line }
    closePolicy: key.length ? Popup.NoAutoClose : (Popup.CloseOnEscape | Popup.CloseOnPressOutside)
    onAboutToShow: { key = ""; err = ""; busy = false }
    Connections { target: core; function onRecoveryKeyCreated(ok, k, e) { dlg.busy = false; if (ok) dlg.key = k; else dlg.err = e } }
    FileDialog { id: saver; fileMode: FileDialog.SaveFile; currentFile: "file://" + files.downloadsDir() + "/pager-recovery-key.txt"; nameFilters: ["Text (*.txt)"]
        onAccepted: files.writeText(files.path(selectedFile), "Pager recovery key\n\n" + dlg.key + "\n\nKeep this somewhere safe. Anyone with it and your password can read your encrypted messages.\n") }
    ColumnLayout { width: parent.width; spacing: 10
        Label { visible: !dlg.key.length; Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.text; text: "This starts a new backup of your message keys. The old recovery key stops working, so anywhere you used it you will need the new one." }
        Label { visible: dlg.err.length > 0; Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.danger; text: dlg.err }
        Button { visible: !dlg.key.length; text: dlg.busy ? "Making it…" : (dlg.reset ? "Wipe and make a new key" : "Make recovery key"); highlighted: true; enabled: !dlg.busy; onClicked: { dlg.busy = true; dlg.err = ""; core.createRecoveryKey() } }
        Label { visible: dlg.key.length > 0; Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.muted; text: "Write it down or save it now. It is shown only once." }
        Rectangle { visible: dlg.key.length > 0; Layout.fillWidth: true; implicitHeight: kt.implicitHeight + 24; radius: 10; color: look.bg; border.color: look.line
            Text { id: kt; anchors.centerIn: parent; width: parent.width - 24; text: dlg.key; wrapMode: Text.WordWrap; horizontalAlignment: Text.AlignHCenter; color: look.text; font.family: "monospace"; font.pixelSize: 16; font.weight: Font.DemiBold } }
        RowLayout { visible: dlg.key.length > 0; Layout.fillWidth: true; spacing: 8
            Button { text: "Copy"; onClicked: files.copy(dlg.key) }
            Button { text: "Save to a file…"; onClicked: saver.open() }
            Item { Layout.fillWidth: true }
            Button { text: "I've saved it"; highlighted: true; onClicked: { dlg.key = ""; dlg.close() } } }
    }
}
