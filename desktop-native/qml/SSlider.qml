import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// A number setting on a slider.
ColumnLayout {
    id: col
    property string key
    property string title
    property string hint: ""
    property real from: 0
    property real to: 1
    property real step: 0.1
    property string suffix: ""
    property int decimals: 0
    Layout.fillWidth: true; Layout.leftMargin: 16; Layout.rightMargin: 16; Layout.topMargin: 12; Layout.bottomMargin: 12; spacing: 2
    RowLayout { Layout.fillWidth: true
        Label { text: col.title; color: look.text; font.pixelSize: Math.round(15 * look.textScale); Layout.fillWidth: true }
        Label { text: Number(settings[col.key]).toFixed(col.decimals) + col.suffix; color: look.muted; font.pixelSize: Math.round(13 * look.textScale) } }
    Label { visible: col.hint.length > 0; Layout.fillWidth: true; text: col.hint; wrapMode: Text.Wrap; color: look.muted; font.pixelSize: Math.round(12 * look.textScale) }
    Slider {
        Layout.fillWidth: true; from: col.from; to: col.to; stepSize: col.step; value: Number(settings[col.key])
        onMoved: settings.set(col.key, value)
        background: Rectangle { x: parent.leftPadding; y: parent.topPadding + parent.availableHeight / 2 - 2; width: parent.availableWidth; height: 4; radius: 2; color: look.line
            Rectangle { width: parent.parent.visualPosition * parent.width; height: parent.height; radius: 2; color: look.accent } }
        handle: Rectangle { x: parent.leftPadding + parent.visualPosition * (parent.availableWidth - width); y: parent.topPadding + parent.availableHeight / 2 - height / 2; width: 18; height: 18; radius: 9; color: look.accent; border.width: 2; border.color: look.panel }
    }
}
