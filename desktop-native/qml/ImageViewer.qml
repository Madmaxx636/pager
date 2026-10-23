import QtQuick
import QtQuick.Controls
import QtQuick.Dialogs
import QtQuick.Layouts
import QtMultimedia

// Look at a picture (zoom with the wheel, drag to move) or play a video full size; arrows go to the neighbouring pictures; files just open.
Popup {
    id: viewer
    property string eventId
    property string kind: "image"
    property bool waiting: false
    readonly property string path: core.fullPath(eventId)
    parent: Overlay.overlay
    anchors.centerIn: parent
    width: parent ? parent.width : 800; height: parent ? parent.height : 600
    modal: true; padding: 0; closePolicy: Popup.CloseOnEscape
    background: Rectangle { color: "#ee000000" }

    function show(id) {
        eventId = id; kind = core.kindOf(id); waiting = true
        if (kind === "file" || kind === "audio") { core.fetchFull(id); openAfter.target = id; return }
        core.fetchFull(id); open(); zoom = 1; pic.x = 0; pic.y = 0
    }
    property real zoom: 1
    Connections { target: core
        function onMediaReady(key) {
            if (key !== "full:" + viewer.eventId) return
            viewer.waiting = false
            if (viewer.kind === "file" || viewer.kind === "audio") { files.open(core.fullPath(viewer.eventId)); return }
            if (viewer.kind === "video") player.source = "file://" + core.fullPath(viewer.eventId), player.play()
        }
    }
    QtObject { id: openAfter; property string target }
    onClosed: { player.stop(); player.source = "" }
    function go(dir) { const n = core.mediaNeighbor(eventId, dir); if (n.length) { player.stop(); show(n) } }

    contentItem: Item {
        focus: true
        Keys.onLeftPressed: viewer.go(-1)
        Keys.onRightPressed: viewer.go(1)
        Keys.onEscapePressed: viewer.close()
        MouseArea { anchors.fill: parent; onClicked: viewer.close() }
        Label { anchors.centerIn: parent; visible: viewer.waiting; text: "Loading…"; color: "white"; font.pixelSize: 16 }

        Item {   // picture
            id: stage
            anchors.fill: parent; anchors.margins: 40; visible: viewer.kind === "image"; clip: true
            Image {
                id: pic
                width: stage.width; height: stage.height; fillMode: Image.PreserveAspectFit; asynchronous: true; autoTransform: true
                source: viewer.path.length && viewer.kind === "image" ? "file://" + viewer.path : ""
                scale: viewer.zoom; transformOrigin: Item.Center
                DragHandler { enabled: viewer.zoom > 1; target: pic }
                TapHandler { onDoubleTapped: { viewer.zoom = viewer.zoom > 1 ? 1 : 2.5; pic.x = 0; pic.y = 0 } }
            }
            WheelHandler { onWheel: (e) => { viewer.zoom = Math.max(1, Math.min(8, viewer.zoom * (e.angleDelta.y > 0 ? 1.15 : 1 / 1.15))); if (viewer.zoom === 1) { pic.x = 0; pic.y = 0 } } }
        }
        Item {   // video
            anchors.fill: parent; anchors.margins: 40; visible: viewer.kind === "video"
            MediaPlayer { id: player; videoOutput: video; audioOutput: AudioOutput { } }
            VideoOutput { id: video; anchors.fill: parent; fillMode: VideoOutput.PreserveAspectFit }
            TapHandler { onTapped: player.playbackState === MediaPlayer.PlayingState ? player.pause() : player.play() }
            Rectangle { anchors.horizontalCenter: parent.horizontalCenter; anchors.bottom: parent.bottom; width: Math.min(parent.width - 40, 520); height: 36; radius: 18; color: "#aa000000"; visible: player.source != ""
                RowLayout { anchors.fill: parent; anchors.leftMargin: 14; anchors.rightMargin: 14; spacing: 10
                    Label { text: player.playbackState === MediaPlayer.PlayingState ? "❚❚" : "▶"; color: "white"; TapHandler { onTapped: player.playbackState === MediaPlayer.PlayingState ? player.pause() : player.play() } }
                    Rectangle { id: vtrack; Layout.fillWidth: true; height: 4; radius: 2; color: "#55ffffff"
                        Rectangle { width: player.duration > 0 ? parent.width * player.position / player.duration : 0; height: parent.height; radius: 2; color: "white" }
                        MouseArea { anchors.fill: parent; anchors.margins: -8; onClicked: (m) => { if (player.duration > 0) player.position = player.duration * m.x / vtrack.width } } }
                }
            }
        }
        // chrome
        Row { anchors.top: parent.top; anchors.right: parent.right; anchors.margins: 14; spacing: 8
            Rectangle { width: 40; height: 40; radius: 20; color: "#44ffffff"; visible: viewer.path.length > 0; Label { anchors.centerIn: parent; text: "⤓"; color: "white"; font.pixelSize: 20 }
                TapHandler { onTapped: { saveDialog.currentFile = "file://" + files.downloadsDir() + "/" + core.fileNameOf(viewer.eventId); saveDialog.open() } } }
            Rectangle { width: 40; height: 40; radius: 20; color: "#44ffffff"; Label { anchors.centerIn: parent; text: "✕"; color: "white"; font.pixelSize: 18 } TapHandler { onTapped: viewer.close() } }
        }
        Rectangle { visible: core.mediaNeighbor(viewer.eventId, -1).length > 0; anchors.left: parent.left; anchors.leftMargin: 14; anchors.verticalCenter: parent.verticalCenter; width: 44; height: 44; radius: 22; color: "#44ffffff"
            Label { anchors.centerIn: parent; text: "‹"; color: "white"; font.pixelSize: 28 } TapHandler { onTapped: viewer.go(-1) } }
        Rectangle { visible: core.mediaNeighbor(viewer.eventId, 1).length > 0; anchors.right: parent.right; anchors.rightMargin: 14; anchors.verticalCenter: parent.verticalCenter; width: 44; height: 44; radius: 22; color: "#44ffffff"
            Label { anchors.centerIn: parent; text: "›"; color: "white"; font.pixelSize: 28 } TapHandler { onTapped: viewer.go(1) } }
        FileDialog { id: saveDialog; fileMode: FileDialog.SaveFile; onAccepted: core.saveCopy(viewer.eventId, files.path(selectedFile)) }
    }
}
