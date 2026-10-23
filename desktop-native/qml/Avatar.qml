import QtQuick
import QtQuick.Effects
import "Networks.js" as N

// A round picture of a person or chat (or the first letter on a colour made from the name), with the chat app's badge in the corner when asked.
Item {
    id: root
    property string letter: "?"
    property string seed: ""
    property string source: ""          // a file on this computer
    property string network: ""         // shows that app's badge when set (and not plain Matrix)
    property int size: 44
    width: size; height: size

    Rectangle {
        id: face
        anchors.fill: parent; radius: width / 2
        visible: img.status !== Image.Ready
        color: Qt.hsla(((root.seed.length ? root.seed : root.letter).split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)) / 360, 0.5, look.dark ? 0.38 : 0.45, 1)
        Text { anchors.centerIn: parent; text: root.letter; color: "white"; font.pixelSize: root.size * 0.42; font.weight: Font.DemiBold }
    }
    Image {
        id: img
        anchors.fill: parent; visible: false
        source: root.source.length ? "file://" + root.source : ""
        fillMode: Image.PreserveAspectCrop; asynchronous: true; cache: true
        sourceSize.width: Math.max(96, root.size * 2); sourceSize.height: Math.max(96, root.size * 2)
    }
    MultiEffect {
        anchors.fill: parent; source: img; visible: img.status === Image.Ready
        maskEnabled: true; maskSource: mask; maskThresholdMin: 0.5; maskSpreadAtMin: 1.0
    }
    Item { id: mask; anchors.fill: parent; visible: false; layer.enabled: true; Rectangle { anchors.fill: parent; radius: width / 2; color: "black" } }
    Rectangle {   // the chat app's mark
        visible: root.network.length > 0 && root.network !== "matrix" && root.size >= 36
        width: Math.max(14, root.size * 0.36); height: width; radius: width / 2
        anchors.right: parent.right; anchors.bottom: parent.bottom; anchors.rightMargin: -2; anchors.bottomMargin: -2
        color: N.meta(root.network).color; border.width: 2; border.color: look.panel
        Text { anchors.centerIn: parent; text: N.meta(root.network).glyph; color: "white"; font.pixelSize: parent.width * 0.55; font.weight: Font.Bold }
    }
}
