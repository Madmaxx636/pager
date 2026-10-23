import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Dialog {
    id: dlg
    modal: true; anchors.centerIn: Overlay.overlay
    width: Math.min(420, Overlay.overlay ? Overlay.overlay.width - 32 : 420)
    title: "New poll"
    property var answers: ["", ""]
    onOpened: { question.text = ""; answers = ["", ""]; multi.checked = false; hidden.checked = false; question.forceActiveFocus() }
    background: Rectangle { color: look.panel; radius: 14; border.color: look.line }
    header: Label { text: dlg.title; color: look.text; font.pixelSize: 18; font.weight: Font.Bold; padding: 18; bottomPadding: 4 }
    function filled() { let n = 0; for (const a of answers) if (a.trim().length) n++; return n }
    contentItem: ColumnLayout {
        spacing: 8
        TextField { id: question; Layout.fillWidth: true; placeholderText: "Ask a question"; color: look.text; placeholderTextColor: look.muted; background: Rectangle { color: look.bg; radius: 8; border.color: look.line } }
        Repeater {
            model: dlg.answers.length
            delegate: TextField {
                Layout.fillWidth: true; placeholderText: "Answer " + (index + 1); color: look.text; placeholderTextColor: look.muted
                background: Rectangle { color: look.bg; radius: 8; border.color: look.line }
                onTextEdited: { const a = dlg.answers.slice(); a[index] = text; dlg.answers = a }
            }
        }
        Button { text: "Add answer"; visible: dlg.answers.length < 10; flat: true; onClicked: dlg.answers = dlg.answers.concat([""]) }
        CheckBox { id: multi; text: "Allow several answers"; palette.windowText: look.text }
        CheckBox { id: hidden; text: "Hide results until the poll ends"; palette.windowText: look.text }
        RowLayout {
            Layout.fillWidth: true
            Item { Layout.fillWidth: true }
            Button { text: "Cancel"; onClicked: dlg.close() }
            Button {
                text: "Send poll"; enabled: question.text.trim().length > 0 && dlg.filled() >= 2
                onClicked: { core.createPoll(question.text, dlg.answers, multi.checked ? dlg.filled() : 1, !hidden.checked); dlg.close() }
            }
        }
    }
}
