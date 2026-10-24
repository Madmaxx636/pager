import QtQuick
import QtQuick.Controls.Basic as B
import QtQuick.Effects

// A rounded card in front of a dimmed window; the title sits in a header like the web app's modals.
B.Dialog {
    id: control
    padding: 24; topPadding: 0
    enter: Transition { ParallelAnimation { NumberAnimation { property: "opacity"; from: 0; to: 1; duration: 110 } NumberAnimation { property: "scale"; from: 0.97; to: 1; duration: 110; easing.type: Easing.OutQuad } } }
    exit: Transition { NumberAnimation { property: "opacity"; from: 1; to: 0; duration: 80 } }
    header: Label { visible: control.title.length > 0; text: control.title; color: look.text; font.pixelSize: Math.round(20 * look.textScale); font.weight: Font.Bold; font.letterSpacing: -0.4; padding: 24; bottomPadding: 10 }
    footer: DialogButtonBox { visible: count > 0 }
    background: Rectangle { radius: 24; color: look.panel; border.width: 1; border.color: look.line
        layer.enabled: GraphicsInfo.api !== GraphicsInfo.Software
        layer.effect: MultiEffect { shadowEnabled: true; shadowColor: "#66000000"; shadowBlur: 0.9; shadowVerticalOffset: 8; shadowOpacity: 0.7 } }
    B.Overlay.modal: Rectangle { color: "#80050810" }      // the same dimming as the web app (5, 8, 12 at half strength)
}
