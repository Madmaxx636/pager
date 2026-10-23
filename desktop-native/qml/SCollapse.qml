import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// A row that opens and closes a part of a page ("Incoming", "Outgoing").
ColumnLayout {
    id: root
    property string title
    property bool open: false
    default property alias content: inner.data
    Layout.fillWidth: true; spacing: 0
    Rectangle { Layout.fillWidth: true; implicitHeight: 50; color: hh.hovered ? look.panel2 : "transparent"
        HoverHandler { id: hh; cursorShape: Qt.PointingHandCursor }
        Label { x: 16; anchors.verticalCenter: parent.verticalCenter; text: root.title; color: look.text; font.weight: Font.DemiBold }
        Icon { anchors.right: parent.right; anchors.rightMargin: 16; anchors.verticalCenter: parent.verticalCenter; name: root.open ? "chevron-down" : "chevron-right"; size: 18; color: look.muted }
        TapHandler { onTapped: root.open = !root.open } }
    ColumnLayout { id: inner; visible: root.open; Layout.fillWidth: true; spacing: 0 }
}
