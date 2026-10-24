import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// "Nothing here yet": a round tinted icon, a title and a line of help, like the web app's empty pages.
ColumnLayout {
    id: root
    property string icon: "inbox"
    property string title
    property string body: ""
    default property alias extra: slot.data
    spacing: 6
    Layout.alignment: Qt.AlignHCenter
    Layout.topMargin: 44; Layout.bottomMargin: 44; Layout.leftMargin: 28; Layout.rightMargin: 28
    Rectangle { Layout.alignment: Qt.AlignHCenter; Layout.preferredWidth: 78; Layout.preferredHeight: 78; radius: 39; Layout.bottomMargin: 8
        color: Qt.rgba(look.accent.r, look.accent.g, look.accent.b, 0.12)
        Icon { anchors.centerIn: parent; name: root.icon; size: 34; color: look.accent } }
    Label { Layout.alignment: Qt.AlignHCenter; text: root.title; color: look.text; font.pixelSize: Math.round(15.75 * look.textScale); font.weight: Font.Bold }
    Label { visible: root.body.length > 0; Layout.alignment: Qt.AlignHCenter; Layout.maximumWidth: 320; Layout.preferredWidth: 320; horizontalAlignment: Text.AlignHCenter; wrapMode: Text.Wrap; text: root.body; color: look.muted; font.pixelSize: Math.round(15 * look.textScale) }
    ColumnLayout { id: slot; Layout.alignment: Qt.AlignHCenter }
}
