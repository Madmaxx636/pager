import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// A setting that is one emoji: shows it, and a click opens the emoji picker to change it.
RowLayout {
    id: row
    property string key
    property string title
    property string hint: ""
    Layout.fillWidth: true; Layout.leftMargin: 16; Layout.rightMargin: 16; Layout.topMargin: 10; Layout.bottomMargin: 10; spacing: 12
    ColumnLayout { Layout.fillWidth: true; Layout.preferredWidth: 1; spacing: 1
        Label { text: row.title; color: look.text; font.pixelSize: Math.round(14 * look.textScale); Layout.fillWidth: true; wrapMode: Text.Wrap }
        Label { visible: row.hint.length > 0; Layout.fillWidth: true; text: row.hint; wrapMode: Text.Wrap; color: look.muted; font.pixelSize: Math.round(12 * look.textScale) } }
    Rectangle { width: 48; height: 40; radius: 12; color: look.panel2
        Label { anchors.centerIn: parent; text: settings[row.key] || "👍"; font.pixelSize: 24 }
        TapHandler { onTapped: pick.open() } HoverHandler { cursorShape: Qt.PointingHandCursor } }
    EmojiPicker { id: pick; onPicked: (e) => settings.set(row.key, e) }
}
