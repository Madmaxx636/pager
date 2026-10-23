import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// The building blocks of the settings pages, drawn like the web app's: a small heading in the accent colour over a rounded card whose rows are divided by thin lines.
// [key] is a setting's name; it is read and written through the settings object. A [plain] group is only a wrapper for other groups.
ColumnLayout {
    id: root
    spacing: 0; Layout.fillWidth: true
    default property alias content: inner.data
    property string title: ""
    property string footer: ""
    property bool plain: false
    Label { visible: root.title.length > 0; text: root.title; color: look.accent; font.pixelSize: Math.round(12 * look.textScale); font.weight: Font.Bold; font.capitalization: Font.AllUppercase; font.letterSpacing: 0.7; Layout.topMargin: 18; Layout.bottomMargin: 6; Layout.leftMargin: 4 }
    Rectangle {
        Layout.fillWidth: true; implicitHeight: inner.implicitHeight; radius: 16; color: root.plain ? "transparent" : look.panel; clip: true
        ColumnLayout {
            id: inner; width: parent.width; spacing: root.plain ? 10 : 0
            // loose content (a label, a list of things) gets the same padding as the ready-made rows
            function pad() {
                if (root.plain) return
                for (let i = 0; i < children.length; i++) { const c = children[i], l = c.Layout
                    if (c.Layout && l.leftMargin === 0 && l.topMargin === 0 && !c.hasOwnProperty("padded")) { l.leftMargin = 16; l.rightMargin = 16; l.topMargin = 10; l.bottomMargin = 10 } }
            }
            onChildrenChanged: Qt.callLater(pad)
            Component.onCompleted: Qt.callLater(pad)
        }
        Repeater {   // thin lines between the rows
            model: root.plain ? [] : inner.children
            delegate: Rectangle { visible: modelData && modelData.visible && modelData.y - (modelData.Layout.topMargin || 0) > 4; x: 0; width: inner.width; height: 1; color: look.line; y: modelData ? modelData.y - (modelData.Layout.topMargin || 0) - 0.5 : 0 }
        }
    }
    Label { visible: root.footer.length > 0; Layout.fillWidth: true; wrapMode: Text.Wrap; text: root.footer; color: look.muted; font.pixelSize: Math.round(12 * look.textScale); Layout.topMargin: 6; Layout.leftMargin: 4 }
}
