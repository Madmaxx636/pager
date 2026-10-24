import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// A list of words (keywords, emoji...) with a box to add more.
ColumnLayout {
    id: col
    property string key
    property string title
    property string hint: ""
    property string placeholder: "Add"
    property bool emojiPicker: false
    readonly property var items: settings[key] || []
    function add(v) { const t = String(v).trim(); if (!t.length || items.indexOf(t) >= 0) return; settings.set(key, items.concat([t])) }
    function remove(i) { const a = items.slice(); a.splice(i, 1); settings.set(key, a) }
    Layout.fillWidth: true; Layout.leftMargin: 16; Layout.rightMargin: 16; Layout.topMargin: 12; Layout.bottomMargin: 12; spacing: 6
    Label { text: col.title; color: look.text; font.pixelSize: Math.round(15 * look.textScale) }
    Label { visible: col.hint.length > 0; Layout.fillWidth: true; text: col.hint; wrapMode: Text.Wrap; color: look.muted; font.pixelSize: Math.round(12 * look.textScale) }
    Flow { Layout.fillWidth: true; spacing: 6
        Repeater { model: col.items
            delegate: Rectangle { height: 32; width: cl.implicitWidth + 40; radius: 16; color: look.panel2
                Label { id: cl; x: 14; anchors.verticalCenter: parent.verticalCenter; text: modelData; color: look.text; font.pixelSize: Math.round((col.emojiPicker ? 18 : 13) * look.textScale) }
                Label { anchors.right: parent.right; anchors.rightMargin: 10; anchors.verticalCenter: parent.verticalCenter; text: "✕"; color: look.muted; font.pixelSize: 11; TapHandler { onTapped: col.remove(index) } } } } }
    RowLayout { Layout.fillWidth: true; spacing: 6
        TextField { id: field; visible: !col.emojiPicker; Layout.fillWidth: true; placeholderText: col.placeholder; color: look.text; placeholderTextColor: look.muted; onAccepted: { col.add(text); text = "" }
            background: Rectangle { radius: 16; color: look.panel2 }
            leftPadding: 14 }
        Button { visible: !col.emojiPicker; text: "Add"; enabled: field.text.trim().length > 0; onClicked: { col.add(field.text); field.text = "" } }
        Button { visible: col.emojiPicker; text: "Add emoji…"; onClicked: pick.open() }
    }
    EmojiPicker { id: pick; onPicked: (e) => col.add(e) }
}
