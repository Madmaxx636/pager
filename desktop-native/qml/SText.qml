import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// A text setting. For a table setting (like the GIF keys) give [table] and the key inside it.
ColumnLayout {
    id: col
    property string key
    property string table: ""
    property string title
    property string hint: ""
    property string placeholder: ""
    property bool secret: false
    Layout.fillWidth: true; Layout.leftMargin: 16; Layout.rightMargin: 16; Layout.topMargin: 12; Layout.bottomMargin: 12; spacing: 4
    function current() { return table.length ? ((settings[table] || {})[key] || "") : (settings[key] || "") }
    function store(v) { if (table.length) { const t = Object.assign({}, settings[table] || {}); if (v.length) t[key] = v; else delete t[key]; settings.set(table, t) } else settings.set(key, v) }
    Label { text: col.title; color: look.text; font.pixelSize: Math.round(15 * look.textScale) }
    Label { visible: col.hint.length > 0; Layout.fillWidth: true; text: col.hint; wrapMode: Text.Wrap; color: look.muted; font.pixelSize: Math.round(12 * look.textScale) }
    TextField { Layout.fillWidth: true; text: col.current(); placeholderText: col.placeholder; echoMode: col.secret ? TextInput.Password : TextInput.Normal; color: look.text; placeholderTextColor: look.muted; selectByMouse: true
        background: Rectangle { radius: 8; color: look.panel2 }
        onEditingFinished: col.store(text) }
}
