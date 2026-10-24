import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Dialog {
    id: dlg
    modal: true; anchors.centerIn: Overlay.overlay
    width: Math.min(440, Overlay.overlay ? Overlay.overlay.width - 32 : 440)
    title: "Create poll"
    property var answers: ["", ""]
    onOpened: { question.text = ""; answers = ["", ""]; multi.checked = false; hidden.checked = false; question.focusField() }
    function filled() { let n = 0; for (const a of answers) if (a.trim().length) n++; return n }
    function send() { if (question.text.trim().length && filled() >= 2) { core.createPoll(question.text.trim(), answers.map(a => a.trim()).filter(a => a.length), multi.checked ? filled() : 1, !hidden.checked); dlg.close() } }
    contentItem: ColumnLayout {
        spacing: 10
        FField { id: question; label: "Question" }
        Repeater {
            model: dlg.answers.length
            delegate: RowLayout { Layout.fillWidth: true; spacing: 8
                FField { Layout.fillWidth: true; placeholder: "Option " + (index + 1); text: dlg.answers[index]; onTextChanged: { if (text !== dlg.answers[index]) { const a = dlg.answers.slice(); a[index] = text; dlg.answers = a } } }
                IconButton { visible: dlg.answers.length > 2; ico: "x"; onClicked: dlg.answers = dlg.answers.filter((_, j) => j !== index); ToolTip.text: "Remove option"; ToolTip.visible: hovered } }
        }
        Button { visible: dlg.answers.length < 10; text: "+ Add option"; flat: true; Layout.alignment: Qt.AlignLeft; onClicked: dlg.answers = dlg.answers.concat([""]) }
        FCheck { id: multi; text: "Allow multiple answers" }
        FCheck { id: hidden; text: "Hide results until the poll ends" }
        Button { Layout.fillWidth: true; text: "Send poll"; highlighted: true; enabled: question.text.trim().length > 0 && dlg.filled() >= 2; onClicked: dlg.send() }
        Label { Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.muted; font.pixelSize: Math.round(12 * look.textScale); text: "Polls work in Matrix and on networks whose bridge supports them (WhatsApp does)." }
    }
}
