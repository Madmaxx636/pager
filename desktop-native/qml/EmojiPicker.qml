import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// Pick an emoji: type to search names and keywords, or browse by group.
Popup {
    id: pop
    signal picked(string emoji)
    modal: true; focus: true; padding: 10
    width: Math.min(360, (Overlay.overlay ? Overlay.overlay.width : 400) - 24); height: 380
    anchors.centerIn: Overlay.overlay
    background: Rectangle { color: look.panel; radius: 14; border.color: look.line }
    onOpened: { search.text = ""; search.forceActiveFocus() }
    readonly property var groups: emoji.groups()
    property int group: 0
    readonly property var shown: search.text.trim().length ? emoji.search(search.text) : (groups.length ? groups[group].emoji : [])

    contentItem: ColumnLayout {
        spacing: 8
        TextField {
            id: search; Layout.fillWidth: true; placeholderText: "Search emoji"; color: look.text; placeholderTextColor: look.muted; font.pixelSize: 14
            background: Rectangle { radius: 18; color: look.panel2 }
            leftPadding: 14
        }
        Row {
            visible: search.text.trim().length === 0; Layout.fillWidth: true; spacing: 2
            Repeater {
                model: pop.groups
                delegate: Rectangle {
                    width: 34; height: 32; radius: 8; color: index === pop.group ? look.panel2 : "transparent"
                    Label { anchors.centerIn: parent; text: modelData.icon; font.pixelSize: 18 }
                    TapHandler { onTapped: pop.group = index }
                }
            }
        }
        GridView {
            Layout.fillWidth: true; Layout.fillHeight: true; clip: true
            cellWidth: 40; cellHeight: 40
            model: pop.shown
            boundsBehavior: Flickable.StopAtBounds
            ScrollBar.vertical: ScrollBar { }
            delegate: Rectangle {
                width: 40; height: 40; radius: 8; color: hov.hovered ? look.panel2 : "transparent"
                HoverHandler { id: hov }
                Label { anchors.centerIn: parent; text: modelData; font.pixelSize: 24 }
                TapHandler { onTapped: { pop.picked(modelData); pop.close() } }
            }
            Label { anchors.centerIn: parent; visible: pop.shown.length === 0; text: "Nothing found"; color: look.muted }
        }
    }
}
