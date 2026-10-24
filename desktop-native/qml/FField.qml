import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// A form field like the web app's: a small grey name over a rounded box.
ColumnLayout {
    id: root
    property string label
    property alias text: input.text
    property alias placeholder: input.placeholderText
    property alias inputMethodHints: input.inputMethodHints
    property alias echoMode: input.echoMode
    signal accepted()
    function focusField() { input.forceActiveFocus() }
    Layout.fillWidth: true; spacing: 6
    Label { visible: root.label.length > 0; text: root.label; color: look.muted; font.pixelSize: Math.round(13 * look.textScale); font.weight: Font.DemiBold }
    Rectangle { Layout.fillWidth: true; implicitHeight: 42; radius: 12; color: look.panel2; border.width: 1; border.color: input.activeFocus ? look.accent : "transparent"
        TextField { id: input; anchors.fill: parent; leftPadding: 12; rightPadding: 12; background: null; color: look.text; placeholderTextColor: look.muted; selectByMouse: true; font.pixelSize: Math.round(15 * look.textScale); verticalAlignment: TextInput.AlignVCenter
            onAccepted: root.accepted() } }
}
