import QtQuick
import QtQuick.Controls.Basic as B

B.ToolTip {
    id: control
    delay: 500; padding: 8; leftPadding: 10; rightPadding: 10
    contentItem: Text { text: control.text; font.pixelSize: Math.round(12 * look.textScale); color: look.text; wrapMode: Text.Wrap }
    background: Rectangle { radius: 8; color: look.panel; border.width: 1; border.color: look.line }
}
