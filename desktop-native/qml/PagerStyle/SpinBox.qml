import QtQuick
import QtQuick.Controls.Basic as B

B.SpinBox {
    id: control
    editable: true
    contentItem: TextInput { text: control.displayText; font.pixelSize: 14; color: look.text; horizontalAlignment: Qt.AlignHCenter; verticalAlignment: Qt.AlignVCenter; readOnly: !control.editable; validator: control.validator; inputMethodHints: Qt.ImhFormattedNumbersOnly }
    background: Rectangle { implicitWidth: 110; implicitHeight: 36; radius: 10; color: look.panel2 }
    up.indicator: Rectangle { x: control.mirrored ? 0 : parent.width - width; height: parent.height; width: 28; color: "transparent"; Text { anchors.centerIn: parent; text: "＋"; color: look.muted } }
    down.indicator: Rectangle { x: control.mirrored ? parent.width - width : 0; height: parent.height; width: 28; color: "transparent"; Text { anchors.centerIn: parent; text: "－"; color: look.muted } }
}
