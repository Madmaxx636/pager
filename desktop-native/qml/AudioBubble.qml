import QtQuick
import QtQuick.Controls
import QtMultimedia

// A voice message or sound file: play or pause, how far along, and how long it is. The file is fetched the first time you press play.
Item {
    id: root
    property string eventId
    property bool voice: false
    property real durationMs: 0
    property string fileName
    property color ink: look.text
    property color softInk: look.muted
    property color accentColor: look.accent
    property bool wantPlay: false
    readonly property string path: core.fullPath(eventId)
    implicitHeight: 40
    height: implicitHeight

    MediaPlayer { id: player; source: root.path.length ? "file://" + root.path : ""; audioOutput: AudioOutput { } }
    Connections { target: core; function onMediaReady(key) { if (key === "full:" + root.eventId && root.wantPlay) { root.wantPlay = false; player.source = "file://" + core.fullPath(root.eventId); player.play() } } }
    function toggle() {
        if (player.playbackState === MediaPlayer.PlayingState) { player.pause(); return }
        if (root.path.length) player.play(); else { wantPlay = true; core.fetchFull(eventId) }
    }
    function clock(ms) { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2) }

    Rectangle {
        id: btn; width: 36; height: 36; radius: 18; color: root.accentColor; anchors.verticalCenter: parent.verticalCenter
        Label { anchors.centerIn: parent; text: root.wantPlay ? "…" : (player.playbackState === MediaPlayer.PlayingState ? "❚❚" : "▶"); color: root.ink === look.accentInk ? look.accent : look.accentInk; font.pixelSize: 14; leftPadding: player.playbackState === MediaPlayer.PlayingState ? 0 : 2 }
        TapHandler { onTapped: root.toggle() }
    }
    Column {
        anchors.left: btn.right; anchors.leftMargin: 10; anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter; spacing: 4
        Rectangle {
            id: track; width: parent.width; height: 4; radius: 2; color: Qt.rgba(root.ink.r, root.ink.g, root.ink.b, 0.22)
            Rectangle { width: player.duration > 0 ? parent.width * player.position / player.duration : 0; height: parent.height; radius: 2; color: root.accentColor }
            MouseArea { anchors.fill: parent; anchors.margins: -8; onClicked: (m) => { if (player.duration > 0 && root.path.length) player.position = player.duration * Math.max(0, Math.min(1, m.x / track.width)) } }
        }
        Label { text: (root.voice ? "Voice message  " : (root.fileName.length ? root.fileName + "  " : "")) + root.clock(player.playbackState !== MediaPlayer.StoppedState ? player.position : (player.duration > 0 ? player.duration : root.durationMs)); color: root.softInk; font.pixelSize: Math.round(12 * look.textScale); elide: Text.ElideRight; width: parent.width }
    }
}
