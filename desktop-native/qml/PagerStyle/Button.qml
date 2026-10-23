import QtQuick
import QtQuick.Controls.Basic as B

// Pager's button: a pill. highlighted = the main action (accent), flat = a quiet text button.
B.Button {
    id: control
    implicitWidth: Math.max(implicitBackgroundWidth + leftInset + rightInset, implicitContentWidth + leftPadding + rightPadding)
    implicitHeight: Math.max(implicitBackgroundHeight + topInset + bottomInset, implicitContentHeight + topPadding + bottomPadding)
    leftPadding: 16; rightPadding: 16; topPadding: 8; bottomPadding: 8
    font.pixelSize: Math.round(14 * look.textScale); font.weight: Font.DemiBold
    contentItem: Text {
        text: control.text; font: control.font; elide: Text.ElideRight; horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter
        color: !control.enabled ? look.muted : control.highlighted ? look.accentInk : (control.flat ? look.accent : (control.hovered ? look.accentInk : look.text))
        opacity: control.enabled ? 1 : 0.55
    }
    background: Rectangle {
        implicitHeight: 36; radius: height / 2
        color: control.flat ? (control.hovered ? Qt.rgba(look.accent.r, look.accent.g, look.accent.b, 0.12) : "transparent")
             : control.highlighted ? (control.down ? Qt.darker(look.accent, 1.15) : look.accent)
             : (control.hovered && control.enabled ? look.accent : look.panel2)
        opacity: control.enabled ? 1 : 0.55
        Behavior on color { ColorAnimation { duration: 90 } }
    }
    HoverHandler { cursorShape: Qt.PointingHandCursor }
}
