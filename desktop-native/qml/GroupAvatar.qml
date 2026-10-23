import QtQuick

// A group's round picture when it has none of its own: its people's faces, one big and the rest smaller, like iMessage (same layout as the web app).
Item {
    id: root
    property var faces: []
    property int size: 44
    width: size; height: size
    readonly property var spots: faces.length <= 2 ? [[0.02, 0.1, 0.58], [0.4, 0.38, 0.58]]
        : faces.length === 3 ? [[0.05, 0.08, 0.56], [0.5, 0.1, 0.42], [0.3, 0.52, 0.46]]
        : [[0.04, 0.1, 0.54], [0.56, 0.04, 0.38], [0.58, 0.46, 0.38], [0.22, 0.6, 0.34]]
    Rectangle { anchors.fill: parent; radius: width / 2; color: Qt.darker(look.panel2, look.dark ? 1 : 1.05) }
    Repeater {
        model: root.faces
        delegate: Item {
            x: root.spots[index][0] * root.size; y: root.spots[index][1] * root.size; width: root.spots[index][2] * root.size; height: width
            Rectangle { anchors.fill: parent; anchors.margins: -2; radius: width / 2; color: look.panel }
            Avatar { size: parent.width; source: modelData.avatar; letter: modelData.name.length ? modelData.name[0].toUpperCase() : "?"; seed: modelData.name }
        }
    }
}
