import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// Search messages: in every chat, or just one. Words are looked for on this device first and on the server too (which can see older history).
Dialog {
    id: dlg
    property string room: ""            // empty: every chat
    property string roomName: ""
    property string kind: "all"
    property var hits: []
    property var remoteHits: []
    property bool busy: false
    // a page beside the list of chats, like the web app's search
    property real sideW: 0
    modal: false; dim: false; closePolicy: Popup.CloseOnEscape
    x: sideW; y: 0
    width: (Overlay.overlay ? Overlay.overlay.width : 520) - sideW; height: Overlay.overlay ? Overlay.overlay.height : 680
    padding: 0
    background: Rectangle { color: look.bg }
    signal chosen(string roomId, string eventId)
    readonly property string openRoom: core.currentRoom
    onOpenRoomChanged: if (visible) close()   // opening a chat leaves the search, as on the web

    function openFor(roomId, name, text) { room = roomId || ""; roomName = name || ""; kind = "all"; hits = []; remoteHits = []; field.text = text || ""; open(); field.forceActiveFocus(); run() }
    function run() {
        const t = field.text.trim()
        if (t.length < 2 && kind === "all") { hits = []; remoteHits = []; busy = false; return }
        hits = core.searchLocal(t, room, kind)
        remoteHits = []
        if (kind === "all" && t.length >= 2) { busy = true; remoteTimer.restart() } else busy = false
    }
    Timer { id: remoteTimer; interval: 350; onTriggered: {
        const t = field.text.trim(), g = dlg.hits
        core.searchRemote(t, dlg.room, function (list) { dlg.busy = false; if (field.text.trim() === t) dlg.remoteHits = list })
    } }
    readonly property var all: {
        const seen = {}; const out = []
        for (const h of hits.concat(remoteHits)) { const k = h.eventId || (h.roomId + h.ts); if (seen[k]) continue; seen[k] = true; out.push(h) }
        return out.sort((a, b) => b.ts - a.ts)
    }

    header: Rectangle {
        color: look.panel; implicitHeight: 64
        RowLayout { anchors.fill: parent; anchors.leftMargin: 16; anchors.rightMargin: 16; spacing: 8
            IconButton { ico: "chevron-left"; onClicked: dlg.close(); ToolTip.text: "Back"; ToolTip.visible: hovered }
            Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 44; radius: 22; color: look.panel2
                Icon { x: 16; anchors.verticalCenter: parent.verticalCenter; name: "search"; size: 18; color: look.muted }
                TextField { id: field; anchors.fill: parent; anchors.leftMargin: 44; anchors.rightMargin: 12; background: null; placeholderText: dlg.room.length ? "Search this page" : "Search all messages"; placeholderTextColor: look.muted; color: look.text; selectByMouse: true
                    font.pixelSize: Math.round(15 * look.textScale); onTextChanged: dlg.run() } } }
        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: look.line }
    }
    contentItem: ColumnLayout {
        spacing: 0
        Row {
            Layout.topMargin: 8; Layout.leftMargin: 14; Layout.bottomMargin: 8; spacing: 6
            Repeater {
                model: [["all", "All", "search"], ["images", "Photos", "image"], ["videos", "Videos", "video"], ["links", "Links", "link"], ["files", "Files", "file"]]
                delegate: Rectangle { height: 33; width: tr.implicitWidth + 26; radius: 17; color: dlg.kind === modelData[0] ? look.accent : look.panel2
                    Row { id: tr; anchors.centerIn: parent; spacing: 6
                        Icon { anchors.verticalCenter: parent.verticalCenter; name: modelData[2]; size: 15; color: dlg.kind === modelData[0] ? look.accentInk : look.muted }
                        Label { anchors.verticalCenter: parent.verticalCenter; text: modelData[1]; color: dlg.kind === modelData[0] ? look.accentInk : look.muted; font.pixelSize: Math.round(13.05 * look.textScale); font.weight: Font.Medium } }
                    TapHandler { onTapped: { dlg.kind = modelData[0]; dlg.run() } } HoverHandler { cursorShape: Qt.PointingHandCursor } }
            }
        }
        ListView {
            id: results
            Layout.fillWidth: true; Layout.fillHeight: true; clip: true; model: dlg.all; boundsBehavior: Flickable.StopAtBounds
            ScrollBar.vertical: ScrollBar { }
            SmoothWheel { view: results }
            delegate: Rectangle {
                width: results.width; height: 70; color: hv.hovered ? look.panel2 : "transparent"
                HoverHandler { id: hv }
                RowLayout { anchors.fill: parent; anchors.leftMargin: 14; anchors.rightMargin: 14; spacing: 12
                    Avatar { size: 42; source: modelData.avatar; letter: modelData.chat.length ? modelData.chat[0].toUpperCase() : "?"; seed: modelData.chat; network: modelData.network }
                    ColumnLayout { Layout.fillWidth: true; spacing: 1
                        Label { text: modelData.senderName + (dlg.room.length ? "" : " · " + modelData.chat); color: look.accent; font.pixelSize: Math.round(12 * look.textScale); elide: Text.ElideRight; Layout.fillWidth: true }
                        Label { text: modelData.text; color: look.text; font.pixelSize: Math.round(14 * look.textScale); elide: Text.ElideRight; maximumLineCount: 2; wrapMode: Text.Wrap; Layout.fillWidth: true }
                        Label { text: modelData.time; color: look.muted; font.pixelSize: Math.round(11 * look.textScale) } } }
                TapHandler { onTapped: { dlg.chosen(modelData.roomId, modelData.eventId); dlg.close() } }
            }
            EmptyState { anchors.horizontalCenter: parent.horizontalCenter; y: -30; width: parent.width - 56; visible: results.count === 0; icon: "search"
                title: field.text.trim().length < 2 && dlg.kind === "all" ? "Search your pages" : (dlg.busy ? "Searching…" : "No matches")
                body: field.text.trim().length < 2 && dlg.kind === "all" ? "Find messages, photos, links and files across every network." : "" }
        }
    }
}
