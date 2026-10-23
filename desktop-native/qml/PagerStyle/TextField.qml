import QtQuick
import QtQuick.Controls.Basic as B

B.TextField {
    id: control
    color: look.text; placeholderTextColor: look.muted; selectionColor: look.accent; selectedTextColor: look.accentInk
    font.pixelSize: Math.round(15 * look.textScale); selectByMouse: true
    leftPadding: 14; rightPadding: 14; topPadding: 10; bottomPadding: 10
    background: Rectangle { implicitHeight: 42; radius: 12; color: look.panel2; border.width: 1; border.color: control.activeFocus ? look.accent : "transparent" }
}
