import QtQuick
import QtQuick.Controls.Basic as B

// A pop-up menu like the web app's: rounded, soft shadow, roomy rows.
B.Menu {
    id: control
    implicitWidth: Math.max(210, contentItem.implicitWidth + leftPadding + rightPadding)
    padding: 6; margins: 8
    delegate: MenuItem { }
    enter: Transition { NumberAnimation { property: "opacity"; from: 0; to: 1; duration: 90 } }
    exit: Transition { NumberAnimation { property: "opacity"; from: 1; to: 0; duration: 70 } }
    contentItem: ListView {
        implicitHeight: contentHeight; model: control.contentModel; interactive: Window.window ? contentHeight + control.topPadding + control.bottomPadding > Window.window.height : false
        clip: true; currentIndex: control.currentIndex; boundsBehavior: Flickable.StopAtBounds
    }
    background: Item {
        implicitWidth: 210; implicitHeight: 40
        Rectangle { anchors.fill: parent; anchors.margins: 0; radius: 16; color: look.panel; border.width: 1; border.color: look.line }
    }
}
