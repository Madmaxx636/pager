import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// A choice among a few options: [[value, label], ...].
ColumnLayout {
    id: col
    property string key
    property string title
    property string hint: ""
    property var options: []
    signal picked(var value)
    Layout.fillWidth: true; Layout.leftMargin: 16; Layout.rightMargin: 16; Layout.topMargin: 12; Layout.bottomMargin: 12; spacing: 6
    Label { text: col.title; color: look.text; font.pixelSize: Math.round(14 * look.textScale) }
    Label { visible: col.hint.length > 0; Layout.fillWidth: true; text: col.hint; wrapMode: Text.Wrap; color: look.muted; font.pixelSize: Math.round(12 * look.textScale) }
    Flow {
        Layout.fillWidth: true; spacing: 6
        Repeater {
            model: col.options
            delegate: Rectangle {
                readonly property bool on: String(settings[col.key]) === String(modelData[0])
                height: 32; width: lbl.implicitWidth + 24; radius: 16; color: on ? look.accent : look.panel2
                Label { id: lbl; anchors.centerIn: parent; text: modelData[1]; color: parent.on ? look.accentInk : look.text; font.pixelSize: Math.round(13 * look.textScale) }
                TapHandler { onTapped: { settings.set(col.key, modelData[0]); col.picked(modelData[0]) } }
                HoverHandler { cursorShape: Qt.PointingHandCursor }
            }
        }
    }
}
