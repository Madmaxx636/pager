import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtMultimedia

// Take a photo with the computer's camera and send it. Loaded only when you pick Camera (so the multimedia libraries stay out of memory until then).
Dialog {
    id: dlg
    modal: true; anchors.centerIn: Overlay.overlay; padding: 0
    width: Math.min(640, Overlay.overlay ? Overlay.overlay.width - 24 : 640); height: Math.min(560, Overlay.overlay ? Overlay.overlay.height - 24 : 560)
    title: "Camera"
    property string shot: ""
    function openNow() { shot = ""; open() }
    property bool allowStart: true   // tests turn this off so they never switch a real camera on
    onOpened: { if (allowStart && devices.videoInputs.length) camera.start() }
    onClosed: camera.stop()
    background: Rectangle { color: "#101418"; radius: 14 }
    header: Item { height: 48
        Label { x: 18; anchors.verticalCenter: parent.verticalCenter; text: "Camera"; color: "white"; font.pixelSize: 18; font.weight: Font.DemiBold }
        IconButton { anchors.right: parent.right; anchors.rightMargin: 8; anchors.verticalCenter: parent.verticalCenter; ico: "x"; tint: "white"; onClicked: dlg.close() } }
    MediaDevices { id: devices }
    CaptureSession {
        id: session
        camera: Camera { id: camera }
        imageCapture: ImageCapture { id: capture; onImageSaved: (id, path) => { dlg.shot = path } }
        videoOutput: view
    }
    contentItem: Item {
        VideoOutput { id: view; anchors.fill: parent; visible: dlg.shot.length === 0 && devices.videoInputs.length > 0; fillMode: VideoOutput.PreserveAspectFit }
        Image { anchors.fill: parent; visible: dlg.shot.length > 0; source: dlg.shot.length ? "file://" + dlg.shot : ""; fillMode: Image.PreserveAspectFit }
        Label { visible: devices.videoInputs.length === 0; anchors.centerIn: parent; text: "No camera found on this computer."; color: "#aab2bd" }
        Row { anchors.bottom: parent.bottom; anchors.bottomMargin: 16; anchors.horizontalCenter: parent.horizontalCenter; spacing: 12
            Button { visible: dlg.shot.length === 0 && devices.videoInputs.length > 0; text: "Take photo"; highlighted: true; onClicked: capture.captureToFile(files.tempPath("pager-photo")) }
            Button { visible: dlg.shot.length > 0; text: "Retake"; onClicked: dlg.shot = "" }
            Button { visible: dlg.shot.length > 0; text: "Send"; highlighted: true; onClicked: { const sz = files.imageSize(dlg.shot); core.sendFile(dlg.shot, files.mime(dlg.shot), sz.width, sz.height); dlg.close() } } }
    }
}
