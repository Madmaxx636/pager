import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// Pick days of the week (0 = Sunday), stored as a list of numbers.
ColumnLayout {
    id: col
    property string key
    property string title
    readonly property var days: settings[key] || []
    Layout.fillWidth: true; Layout.leftMargin: 16; Layout.rightMargin: 16; Layout.topMargin: 12; Layout.bottomMargin: 12; spacing: 6
    Label { text: col.title; color: look.text; font.pixelSize: Math.round(15 * look.textScale) }
    Flow { Layout.fillWidth: true; spacing: 6
        Repeater { model: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
            delegate: Rectangle { readonly property bool on: col.days.indexOf(index) >= 0
                height: 32; width: 52; radius: 16; color: on ? look.accent : look.panel2
                Label { anchors.centerIn: parent; text: modelData; color: parent.on ? look.accentInk : look.text; font.pixelSize: Math.round(13 * look.textScale) }
                TapHandler { onTapped: { const a = col.days.slice(); const i = a.indexOf(index); if (i >= 0) a.splice(i, 1); else a.push(index); settings.set(col.key, a) } }
                HoverHandler { cursorShape: Qt.PointingHandCursor } } } }
}
