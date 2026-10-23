import QtQuick

// A line icon (the same set the web app uses), drawn in any colour.
Item {
    id: root
    property string name: ""
    property int size: 20
    property color color: look.text
    implicitWidth: size; implicitHeight: size; width: size; height: size
    Image {
        anchors.fill: parent
        source: root.name.length ? "image://icon/" + root.name + "/" + String(root.color).substring(1, 7) : ""
        sourceSize.width: Math.round(root.size * Screen.devicePixelRatio + 0.5); sourceSize.height: Math.round(root.size * Screen.devicePixelRatio + 0.5)
        smooth: true; asynchronous: false; cache: true
    }
}
