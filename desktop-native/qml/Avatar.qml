import QtQuick

// A round picture stand-in: the first letter on a colour made from the name.
Rectangle {
    id: root
    property string letter: "?"
    property string seed: ""
    property int size: 44
    width: size; height: size; radius: size / 2
    color: Qt.hsla(((seed.length ? seed : letter).split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)) / 360, 0.5, look.dark ? 0.38 : 0.45, 1)
    Text { anchors.centerIn: parent; text: root.letter; color: "white"; font.pixelSize: root.size * 0.42; font.weight: Font.DemiBold }
}
