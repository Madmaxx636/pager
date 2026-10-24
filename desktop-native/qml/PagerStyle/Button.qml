import QtQuick
import QtQuick.Controls.Basic as B

// Pager's button: a pill. highlighted = the main action (accent), flat = a quiet text button.
B.Button {
    id: control
    implicitWidth: Math.max(implicitBackgroundWidth + leftInset + rightInset, implicitContentWidth + leftPadding + rightPadding)
    implicitHeight: Math.max(implicitBackgroundHeight + topInset + bottomInset, implicitContentHeight + topPadding + bottomPadding)
    // the web app's three kinds: the main action (.primary), a quiet text button (.link) and the pill (.pill)
    readonly property bool danger: /^(Delete|Wipe|Replace my key|Sign out|Disconnect)/.test(text)      // the main button of a dialog that destroys something is red, like the web app's
    leftPadding: highlighted ? 18 : (flat ? 8 : 15); rightPadding: leftPadding; topPadding: highlighted ? 12 : (flat ? 6 : 7); bottomPadding: topPadding
    font.pixelSize: Math.round((highlighted ? 15 : 14) * look.textScale); font.weight: flat ? Font.Normal : Font.DemiBold
    contentItem: Text {
        text: control.text; font: control.font; elide: Text.ElideRight; horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter
        color: !control.enabled ? look.muted : control.highlighted ? (control.danger ? "#ffffff" : look.accentInk) : (control.flat ? look.accent : (control.hovered ? look.accentInk : look.text))
        opacity: control.enabled ? 1 : 0.55
    }
    background: Rectangle {
        implicitHeight: 20; radius: control.highlighted ? 14 : (control.flat ? 8 : height / 2)
        color: control.flat ? (control.hovered ? Qt.rgba(look.accent.r, look.accent.g, look.accent.b, 0.12) : "transparent")
             : control.highlighted ? (control.danger ? look.danger : (control.down ? Qt.darker(look.accent, 1.15) : look.accent))
             : (control.hovered && control.enabled ? look.accent : look.panel2)
        opacity: control.enabled ? 1 : 0.55
        Behavior on color { ColorAnimation { duration: 90 } }
    }
    HoverHandler { cursorShape: Qt.PointingHandCursor }
}
