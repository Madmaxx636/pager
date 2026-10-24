import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// Pick an emoji: type to search names and keywords, or browse by group.
Popup {
    id: pop
    signal picked(string emoji)
    modal: true; focus: true; padding: 24
    width: Math.min(432, (Overlay.overlay ? Overlay.overlay.width : 440) - 24); height: Math.min(577, (Overlay.overlay ? Overlay.overlay.height : 600) - 24)
    anchors.centerIn: Overlay.overlay
    background: Rectangle { color: look.panel; radius: 24; border.color: look.line }
    onOpened: { search.text = ""; search.forceActiveFocus() }
    // the ones you used lately come first, then the usual groups
    readonly property var recent: settings.recentEmoji || []
    readonly property var groups: (recent.length ? [{ icon: "🕘", emoji: recent }] : []).concat(emoji.groups())
    property int group: 0
    readonly property var shown: search.text.trim().length ? emoji.search(search.text) : (groups.length ? groups[Math.min(group, groups.length - 1)].emoji : [])
    function remember(e) { const r = (settings.recentEmoji || []).filter(x => x !== e); r.unshift(e); settings.set("recentEmoji", r.slice(0, 24)) }

    contentItem: ColumnLayout {
        spacing: 8
        TextField {
            id: search; Layout.fillWidth: true; placeholderText: "Search emoji"; color: look.text; placeholderTextColor: look.muted; font.pixelSize: Math.round(14.25 * look.textScale); Layout.preferredHeight: 40
            background: Rectangle { radius: 12; color: look.panel2 }
            leftPadding: 12
        }
        Row {
            visible: search.text.trim().length === 0; Layout.fillWidth: true; spacing: 2
            Repeater {
                model: pop.groups
                delegate: Rectangle {
                    width: 41; height: 46; radius: 8; color: index === pop.group ? look.panel2 : "transparent"
                    Label { anchors.centerIn: parent; text: modelData.icon; font.pixelSize: Math.round(22.5 * look.textScale) }
                    TapHandler { onTapped: { pop.group = index; sections.positionViewAtIndex(index, ListView.Beginning) } }
                }
            }
        }
        ListView {   // browsing: every group in one scroll, a heading over each
            id: sections
            visible: search.text.trim().length === 0
            Layout.fillWidth: true; Layout.fillHeight: true; clip: true; boundsBehavior: Flickable.StopAtBounds; cacheBuffer: 4000
            ScrollBar.vertical: ScrollBar { }
            SmoothWheel { view: sections }
            model: pop.groups
            onContentYChanged: { const i = indexAt(10, contentY + 24); if (i >= 0 && i !== pop.group) pop.group = i }
            delegate: Column {
                width: sections.width
                readonly property var gx: modelData
                Label { topPadding: 10; bottomPadding: 4; text: modelData.name || "Recent"; color: look.muted; font.pixelSize: Math.round(12 * look.textScale); font.weight: Font.Bold }
                Grid {
                    columns: 7; width: parent.width
                    Repeater {
                        model: gx.emoji
                        delegate: Rectangle {
                            width: Math.floor(sections.width / 7); height: 51; radius: 10; color: sh.hovered ? look.panel2 : "transparent"
                            HoverHandler { id: sh }
                            Label { anchors.centerIn: parent; text: modelData; font.pixelSize: Math.round(30 * look.textScale) }
                            TapHandler { onTapped: { pop.remember(modelData); pop.picked(modelData); pop.close() } }
                        }
                    }
                }
            }
        }
        GridView {   // searching: the matches
            id: grid
            visible: search.text.trim().length > 0
            Layout.fillWidth: true; Layout.fillHeight: true; clip: true
            cellWidth: Math.floor(width / 7); cellHeight: 51
            model: search.text.trim().length ? pop.shown : []
            boundsBehavior: Flickable.StopAtBounds
            ScrollBar.vertical: ScrollBar { }
            delegate: Rectangle {
                width: grid.cellWidth; height: grid.cellHeight; radius: 10; color: hov.hovered ? look.panel2 : "transparent"
                HoverHandler { id: hov }
                Label { anchors.centerIn: parent; text: modelData; font.pixelSize: Math.round(30 * look.textScale) }
                TapHandler { onTapped: { pop.remember(modelData); pop.picked(modelData); pop.close() } }
            }
            Label { anchors.centerIn: parent; visible: pop.shown.length === 0; text: "Nothing found"; color: look.muted }
        }
    }
}
