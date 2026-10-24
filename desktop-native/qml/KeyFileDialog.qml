import QtQuick
import QtQuick.Controls
import QtQuick.Dialogs
import QtQuick.Layouts

// Save every message key of this device to a file protected by a passphrase you choose, or read such a file (made here, on another Pager, or by Element).
Dialog {
    id: dlg
    property bool saving: true
    property string note: ""; property bool bad: false; property bool busy: false
    function openFor(save) { saving = save; note = ""; bad = false; busy = false; pass.text = ""; open() }
    modal: true; anchors.centerIn: Overlay.overlay; width: Math.min(440, Overlay.overlay ? Overlay.overlay.width - 32 : 440)
    title: saving ? "Save keys to a file" : "Restore keys from a file"; standardButtons: Dialog.Close

    Connections { target: core
        function onKeysExported(ok, e) { dlg.busy = false; dlg.bad = !ok; dlg.note = ok ? "Saved. Keep the file and its passphrase safe." : e }
        function onKeysImported(ok, imported, total, e) { dlg.busy = false; dlg.bad = !ok; dlg.note = ok ? (imported + " of " + total + " keys were new to this device.") : "Couldn't read that file. Check the passphrase. " + e } }
    FileDialog { id: saveTo; fileMode: FileDialog.SaveFile; currentFile: "file://" + files.downloadsDir() + "/pager-keys.txt"; nameFilters: ["Key file (*.txt)"]
        onAccepted: { dlg.busy = true; core.exportKeys(files.path(selectedFile), pass.text) } }
    FileDialog { id: openFrom; nameFilters: ["Key file (*.txt)", "All files (*)"]; onAccepted: { dlg.busy = true; core.importKeys(files.path(selectedFile), pass.text) } }
    ColumnLayout { width: parent.width; spacing: 8
        Label { Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.muted; text: dlg.saving ? "This is not your recovery key. It is a separate file, protected by a passphrase you choose now. You will need the passphrase to open it." : "Only for a file made with “Save keys to a file” (or exported from Element). It asks for that file's passphrase." }
        TextField { id: pass; Layout.fillWidth: true; echoMode: TextInput.Password; placeholderText: "Passphrase" }
        Button { text: dlg.busy ? "Working…" : (dlg.saving ? "Choose where to save…" : "Choose the file…"); highlighted: true; enabled: pass.text.length >= 4 && !dlg.busy; onClicked: dlg.saving ? saveTo.open() : openFrom.open() }
        Label { visible: dlg.note.length > 0; Layout.fillWidth: true; wrapMode: Text.Wrap; color: dlg.bad ? look.danger : look.accent; text: dlg.note } }
}
