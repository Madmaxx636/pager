import QtQuick
import QtTest

Item {
    width: 600; height: 500
    Loader { id: cam; source: "../qml/CameraDialog.qml" }
    TestCase {
        name: "Camera"; when: windowShown
        function test_the_camera_dialog_opens_even_without_a_camera() {      // (named to run last: it loads the multimedia libraries)
            tryVerify(function () { return cam.status === Loader.Ready }, 3000); cam.item.allowStart = false; cam.item.openNow(); wait(200); verify(cam.item.visible); cam.item.close()
        }
    }
}
