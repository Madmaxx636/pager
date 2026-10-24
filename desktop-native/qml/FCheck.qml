import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// A "name on the left, tick on the right" row of a dialog, like the web app's .toggle.
RowLayout {
    id: root
    property string text
    property alias checked: box.checked
    Layout.fillWidth: true; spacing: 12
    Label { Layout.fillWidth: true; text: root.text; color: look.text; font.pixelSize: Math.round(15 * look.textScale); wrapMode: Text.Wrap }
    CheckBox { id: box; Layout.alignment: Qt.AlignVCenter }
    TapHandler { onTapped: box.toggle() }
}
