import QtQuick
import QtQuick.Controls
import QtQuick.Dialogs
import QtQuick.Layouts

// A colour setting: the name, a swatch that opens the colour picker, and "Default" to clear it.
RowLayout {
    id: row
    property string key
    property string title
    readonly property string value: String(settings[key] || "")
    Layout.fillWidth: true; Layout.leftMargin: 16; Layout.rightMargin: 16; Layout.topMargin: 12; Layout.bottomMargin: 12; spacing: 10
    Label { Layout.fillWidth: true; text: row.title; color: look.text; font.pixelSize: Math.round(15 * look.textScale) }
    Button { visible: row.value.length > 0; text: "Default"; flat: true; onClicked: settings.set(row.key, "") }
    Rectangle { width: 34; height: 24; radius: 8; color: row.value.length ? row.value : look.panel2; border.width: 1; border.color: look.line
        TapHandler { onTapped: dlg.open() } HoverHandler { cursorShape: Qt.PointingHandCursor } }
    ColorDialog { id: dlg; selectedColor: row.value.length ? row.value : "#8b7cf6"; onAccepted: settings.set(row.key, String(selectedColor).substring(0, 7)) }
}
