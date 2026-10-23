import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// An on/off setting.
RowLayout {
    id: row
    property string key
    property string title
    property string hint: ""
    property bool inverted: false
    Layout.fillWidth: true; spacing: 12
    ColumnLayout { Layout.fillWidth: true; spacing: 1
        Label { text: row.title; color: look.text; font.pixelSize: Math.round(14 * look.textScale); Layout.fillWidth: true; wrapMode: Text.Wrap }
        Label { visible: row.hint.length > 0; Layout.fillWidth: true; text: row.hint; wrapMode: Text.Wrap; color: look.muted; font.pixelSize: Math.round(12 * look.textScale) } }
    PSwitch { checked: row.inverted ? !settings[row.key] : !!settings[row.key]; onToggled: settings.set(row.key, row.inverted ? !checked : checked) }
}
