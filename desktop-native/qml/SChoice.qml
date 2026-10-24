import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// A choice among a few options: [[value, label], ...]. Drawn like the web app's: the name on the left, a drop-down on the right.
RowLayout {
    id: row
    property string key
    property string title
    property string hint: ""
    property var options: []
    signal picked(var value)
    property string valueNow: String(settings[key])      // what is chosen now (a row that keeps its choice somewhere else sets this itself)
    readonly property string current: { for (const o of options) if (valueNow === String(o[0])) return o[1]; return options.length ? options[0][1] : "" }
    Layout.fillWidth: true; Layout.leftMargin: 16; Layout.rightMargin: 16; Layout.topMargin: 12; Layout.bottomMargin: 12; spacing: 14
    ColumnLayout { Layout.fillWidth: true; spacing: 1
        Label { text: row.title; color: look.text; font.pixelSize: Math.round(15 * look.textScale); Layout.fillWidth: true; wrapMode: Text.Wrap }
        Label { visible: row.hint.length > 0; Layout.fillWidth: true; text: row.hint; wrapMode: Text.Wrap; color: look.muted; font.pixelSize: Math.round(12 * look.textScale) } }
    Rectangle {
        id: box
        Layout.alignment: Qt.AlignVCenter
        implicitHeight: 42; implicitWidth: Math.min(260, cur.implicitWidth + 12 + 8 + 18 + 12 + 4); radius: 12; color: look.panel2
        border.width: 1; border.color: menu.opened ? look.accent : "transparent"
        Row { anchors.verticalCenter: parent.verticalCenter; x: 12; spacing: 8
            Label { id: cur; text: row.current; color: look.text; font.pixelSize: Math.round(15 * look.textScale); elide: Text.ElideRight; width: Math.min(implicitWidth, 260 - 12 - 8 - 18 - 16) }
            Icon { anchors.verticalCenter: parent.verticalCenter; name: "chevron-down"; size: 18; color: look.muted } }
        HoverHandler { cursorShape: Qt.PointingHandCursor }
        TapHandler { onTapped: menu.popup(box, 0, box.height + 4) }
        Menu {
            id: menu
            implicitWidth: Math.max(box.width, 160)
            Repeater { model: row.options
                delegate: MenuItem { text: modelData[1]; checkable: true; checked: row.valueNow === String(modelData[0])
                    onTriggered: { if (row.key.length) settings.set(row.key, modelData[0]); row.picked(modelData[0]) } } }
        }
    }
}
