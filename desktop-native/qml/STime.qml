import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// A time of day setting stored as minutes after midnight.
RowLayout {
    id: row
    property string key
    property string title
    Layout.fillWidth: true; Layout.leftMargin: 16; Layout.rightMargin: 16; Layout.topMargin: 10; Layout.bottomMargin: 10; spacing: 8
    readonly property int minutes: Number(settings[key]) || 0
    Label { Layout.fillWidth: true; text: row.title; color: look.text; font.pixelSize: Math.round(14 * look.textScale) }
    SpinBox { from: 0; to: 23; value: Math.floor(row.minutes / 60); editable: true; textFromValue: (v) => ("0" + v).slice(-2); onValueModified: settings.set(row.key, value * 60 + row.minutes % 60) }
    Label { text: ":"; color: look.muted }
    SpinBox { from: 0; to: 59; stepSize: 5; value: row.minutes % 60; editable: true; textFromValue: (v) => ("0" + v).slice(-2); onValueModified: settings.set(row.key, Math.floor(row.minutes / 60) * 60 + value) }
}
