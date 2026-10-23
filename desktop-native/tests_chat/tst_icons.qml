import QtQuick
import QtTest
import "../qml"

Item {
    width: 300; height: 120
    Rectangle { anchors.fill: parent; color: "#222222" }
    Image { id: raw; x: 10; y: 10; source: Qt.resolvedUrl("../icons/search.svg"); sourceSize.width: 64; sourceSize.height: 64 }
    TestCase {
        name: "Icons"; when: windowShown
        function test_the_svg_itself_renders() {
            wait(300); console.log("status", raw.status, raw.implicitWidth)
            const img = grabImage(raw); let seen = 0
            for (let x = 0; x < 64; x++) for (let y = 0; y < 64; y++) { const c = img.pixel(x, y); if (c.r > 0.5) seen++ }
            console.log("white pixels", seen); verify(seen > 30)
        }
    }
}
