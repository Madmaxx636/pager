import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// The building blocks of the settings pages. [key] is a setting's name; it is read and written through the settings object.
ColumnLayout {
    id: root
    spacing: 0
    default property alias content: inner.data
    property string title: ""
    property string footer: ""
    Label { visible: root.title.length > 0; text: root.title; color: look.accent; font.pixelSize: Math.round(12 * look.textScale); font.weight: Font.Bold; font.capitalization: Font.AllUppercase; Layout.topMargin: 18; Layout.bottomMargin: 6 }
    ColumnLayout { id: inner; Layout.fillWidth: true; spacing: 10 }
    Label { visible: root.footer.length > 0; Layout.fillWidth: true; wrapMode: Text.Wrap; text: root.footer; color: look.muted; font.pixelSize: Math.round(12 * look.textScale); Layout.topMargin: 6 }
}
