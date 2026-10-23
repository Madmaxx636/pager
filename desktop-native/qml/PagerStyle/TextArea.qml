import QtQuick
import QtQuick.Controls.Basic as B

B.TextArea {
    id: control
    color: look.text; placeholderTextColor: look.muted; selectionColor: look.accent; selectedTextColor: look.accentInk
    font.pixelSize: Math.round(15 * look.textScale); selectByMouse: true; wrapMode: TextEdit.Wrap
    leftPadding: 14; rightPadding: 14; topPadding: 10; bottomPadding: 10
    background: Rectangle { radius: 12; color: look.panel2; border.width: 1; border.color: control.activeFocus ? look.accent : "transparent" }
}
