import QtQuick
import QtQuick.Controls.Basic as B
import QtQuick.Layouts

B.MenuItem {
    id: control
    implicitWidth: Math.max(implicitBackgroundWidth + leftInset + rightInset, implicitContentWidth + leftPadding + rightPadding)
    implicitHeight: visible ? (control.menu && control.menu.rowHeight ? control.menu.rowHeight : 37) : 0
    leftPadding: 12; rightPadding: 12; topPadding: 0; bottomPadding: 0
    readonly property color ink: !control.enabled ? look.muted : (control.text.indexOf("Delete") === 0 || control.text.indexOf("Sign out") === 0 ? look.danger : look.text)
    contentItem: Row {
        spacing: 12
        Image {   // an icon in the same set the web app uses, when the item names one
            visible: control.icon.name.length > 0; width: visible ? 18 : 0; height: 18; anchors.verticalCenter: parent.verticalCenter
            source: control.icon.name.length ? "image://icon/" + control.icon.name + "/" + String(control.ink).substring(1, 7) : ""
            sourceSize.width: 36; sourceSize.height: 36; smooth: true
        }
        Text {
            width: control.availableWidth - (control.icon.name.length ? 30 : 0); height: parent.height
            text: control.text; font.pixelSize: Math.round(15 * look.textScale); elide: Text.ElideRight; verticalAlignment: Text.AlignVCenter; color: control.ink
        }
    }
    background: Rectangle { implicitHeight: control.implicitHeight; radius: 10; color: control.highlighted && control.enabled ? look.panel2 : "transparent" }
}
