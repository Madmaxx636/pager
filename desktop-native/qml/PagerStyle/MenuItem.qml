import QtQuick
import QtQuick.Controls.Basic as B
import QtQuick.Layouts

B.MenuItem {
    id: control
    implicitWidth: Math.max(implicitBackgroundWidth + leftInset + rightInset, implicitContentWidth + leftPadding + rightPadding)
    implicitHeight: visible ? 38 : 0
    leftPadding: 12; rightPadding: 12; topPadding: 0; bottomPadding: 0
    contentItem: Text {
        text: control.text; font.pixelSize: Math.round(14 * look.textScale); elide: Text.ElideRight; verticalAlignment: Text.AlignVCenter
        color: !control.enabled ? look.muted : (control.text.indexOf("Delete") === 0 || control.text.indexOf("Sign out") === 0 ? look.danger : look.text)
    }
    background: Rectangle { implicitHeight: 38; radius: 10; color: control.highlighted && control.enabled ? look.panel2 : "transparent" }
}
