import QtQuick
import QtQuick.Shapes
import Pager.Items
import "Networks.js" as N

// A person's or chat's picture: their photo, or their first letter on the same colour gradient the web app makes from the name. The chat app's badge sits in a corner.
Item {
    id: root
    property string letter: "?"
    property string seed: ""
    property string source: ""          // a file on this computer
    property string network: ""         // shows that app's badge when set (and not plain Matrix)
    property bool ring: false           // a ring around it: something unread
    property int size: 44
    readonly property bool squircle: settings.avatarShape === "squircle"
    readonly property real hue: ((seed.length ? seed : letter).split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7))
    width: size; height: size

    Rectangle {   // the same without the graphics chip: one colour instead of a blend
        anchors.fill: parent; visible: img.status !== 2 && GraphicsInfo.api === GraphicsInfo.Software; radius: root.squircle ? width * 0.3 : width / 2; color: Qt.hsla(root.hue / 360, 0.55, 0.45, 1)
        Text { anchors.centerIn: parent; text: root.letter; color: "white"; font.pixelSize: root.size * 0.4; font.weight: Font.DemiBold }
    }
    Shape {
        id: face
        anchors.fill: parent; visible: img.status !== 2 && GraphicsInfo.api !== GraphicsInfo.Software; preferredRendererType: Shape.CurveRenderer
        ShapePath {
            strokeColor: "transparent"
            fillGradient: LinearGradient {
                x1: 0; y1: 0; x2: root.size; y2: root.size
                GradientStop { position: 0; color: Qt.hsla(root.hue / 360, 0.55, 0.52, 1) }
                GradientStop { position: 1; color: Qt.hsla(((root.hue + 28) % 360) / 360, 0.62, 0.38, 1) }
            }
            PathRectangle { x: 0; y: 0; width: root.size; height: root.size; radius: root.squircle ? root.size * 0.3 : root.size / 2 }
        }
        Text { anchors.centerIn: parent; text: root.letter; color: "white"; font.pixelSize: root.size * 0.4; font.weight: Font.DemiBold }
    }
    RoundedImage {
        id: img
        anchors.fill: parent; source: root.source; radius: root.squircle ? width * 0.3 : width / 2; maxSide: Math.max(128, root.size * 3)
    }
    Rectangle {   // the ring of an unread chat
        visible: root.ring; anchors.fill: parent; anchors.margins: -4; radius: root.squircle ? width * 0.3 : width / 2; color: "transparent"; border.width: 2; border.color: look.accent
    }
    Rectangle {   // the chat app's mark
        visible: root.network.length > 0 && root.network !== "matrix" && root.size >= 32
        width: Math.max(14, root.size * 0.4); height: width; radius: width / 2
        anchors.right: parent.right; anchors.bottom: parent.bottom; anchors.rightMargin: -3; anchors.bottomMargin: -3
        color: N.meta(root.network).color; border.width: 2; border.color: look.panel
        Text { anchors.centerIn: parent; text: N.meta(root.network).glyph; color: "white"; font.pixelSize: parent.width * 0.5; font.weight: Font.Bold }
    }
}
