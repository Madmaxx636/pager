import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtMultimedia

// Record a voice message: speak, then send it (or throw it away).
Dialog {
    id: dlg
    property string error: ""
    property bool done: false
    property string replyTo: ""          // a voice message sent while replying answers that message
    signal sent()
    modal: true; anchors.centerIn: Overlay.overlay; width: Math.min(340, Overlay.overlay ? Overlay.overlay.width - 32 : 340)
    title: "Voice message"; closePolicy: Popup.NoAutoClose
    function start() { error = ""; done = false; open(); Qt.callLater(function () { rec.record() }) }
    function clock(ms) { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2) }
    CaptureSession {
        audioInput: AudioInput { }
        recorder: MediaRecorder {
            id: rec
            mediaFormat { fileFormat: MediaFormat.Ogg; audioCodec: MediaFormat.AudioCodec.Opus }
            quality: MediaRecorder.NormalQuality
            onErrorOccurred: (e, msg) => { dlg.error = msg.length ? msg : "Couldn't use the microphone"; }
            onRecorderStateChanged: if (recorderState === MediaRecorder.StoppedState && dlg.done && actualLocation.toString().length) {
                const path = files.path(actualLocation); const ms = rec.duration
                dlg.close(); core.sendFile(path, "audio/ogg", 0, 0, "", true, ms, dlg.replyTo); dlg.sent()
            }
        }
    }
    contentItem: ColumnLayout {
        spacing: 14
        RowLayout { Layout.alignment: Qt.AlignHCenter; spacing: 10
            Rectangle { width: 14; height: 14; radius: 7; color: look.danger; opacity: rec.recorderState === MediaRecorder.RecordingState ? 1 : 0.3
                SequentialAnimation on opacity { running: rec.recorderState === MediaRecorder.RecordingState; loops: Animation.Infinite; NumberAnimation { to: 0.25; duration: 600 } NumberAnimation { to: 1; duration: 600 } } }
            Label { text: dlg.clock(rec.duration); font.pixelSize: 28; font.weight: Font.DemiBold; color: look.text } }
        Label { Layout.fillWidth: true; visible: dlg.error.length > 0; text: dlg.error; wrapMode: Text.Wrap; color: look.danger; horizontalAlignment: Text.AlignHCenter }
        Label { Layout.fillWidth: true; visible: dlg.error.length === 0; text: "Recording… press Send when you're done"; color: look.muted; horizontalAlignment: Text.AlignHCenter }
        RowLayout { Layout.alignment: Qt.AlignHCenter; spacing: 10
            Button { text: "Cancel"; flat: true; onClicked: { dlg.done = false; rec.stop(); dlg.close() } }
            Button { text: "Send"; highlighted: true; enabled: dlg.error.length === 0 && rec.duration > 500; onClicked: { dlg.done = true; rec.stop() } } }
    }
}
