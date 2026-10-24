import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// A row with a button.
RowLayout {
    id: row
    property string title
    property string hint: ""
    property string button: "Open"
    property bool danger: false
    property bool busy: false
    signal clicked()
    Layout.fillWidth: true; Layout.leftMargin: 16; Layout.rightMargin: 16; Layout.topMargin: 12; Layout.bottomMargin: 12; spacing: 12
    ColumnLayout { Layout.fillWidth: true; spacing: 1
        Label { text: row.title; color: row.danger ? look.danger : look.text; font.pixelSize: Math.round(15 * look.textScale); Layout.fillWidth: true; wrapMode: Text.Wrap }
        Label { visible: row.hint.length > 0; Layout.fillWidth: true; text: row.hint; wrapMode: Text.Wrap; color: look.muted; font.pixelSize: Math.round(12 * look.textScale) } }
    Button { text: row.button; enabled: !row.busy; onClicked: row.clicked() }
}
