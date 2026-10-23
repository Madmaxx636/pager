import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// One message: the bubble, the little time under the last of a run, and reaction chips.
Item {
    id: row
    // roles from the timeline model
    property string body; property string kind; property string time; property string senderName
    property bool mine; property bool locked; property bool local; property bool first; property bool last; property bool edited; property bool showName
    property var reactions: []
    property string day; property string eventId; property string replyTo
    property string media; property int imgWidth; property int imgHeight; property string fileName; property var poll
    property bool wantOpen: false
    onMediaChanged: if (wantOpen && media.length) { wantOpen = false; files.open(media) }
    Component.onCompleted: if (kind === "image" && media.length === 0 && eventId.length) core.fetchMedia(eventId)
    signal menuRequested(string eventId, bool mine, real gx, real gy)
    signal reactionTapped(string eventId, string key)

    width: ListView.view ? ListView.view.width : 400
    implicitHeight: col.implicitHeight + (first ? 8 : 2)

    Column {
        id: col
        width: parent.width
        spacing: 2
        Label { // the day heading sits above the first message of that day
            visible: row.day.length > 0
            anchors.horizontalCenter: parent.horizontalCenter
            topPadding: 10; bottomPadding: 6
            text: row.day; color: look.muted; font.pixelSize: 12; font.weight: Font.DemiBold
        }
        Label { visible: row.showName && !row.mine && row.first; leftPadding: 18; text: row.senderName; color: look.muted; font.pixelSize: 12; font.weight: Font.DemiBold }
        Item {   // a picture
            visible: row.kind === "image"
            width: parent.width; height: visible ? pic.height : 0
            Rectangle {
                id: pic
                anchors.right: row.mine ? parent.right : undefined; anchors.left: row.mine ? undefined : parent.left
                anchors.rightMargin: 14; anchors.leftMargin: 14
                readonly property real ratio: row.imgWidth > 0 && row.imgHeight > 0 ? row.imgHeight / row.imgWidth : 0.75
                width: Math.min(300, row.width * 0.7); height: Math.max(80, Math.min(width * ratio, 380))
                radius: 14; color: row.mine ? look.accent : look.theirs; clip: true; opacity: row.local ? 0.7 : 1
                Image { anchors.fill: parent; source: row.media.length ? "file://" + row.media : ""; fillMode: Image.PreserveAspectCrop; asynchronous: true; cache: true; sourceSize.width: 640 }
                Label { anchors.centerIn: parent; visible: row.media.length === 0; text: "Loading picture…"; color: row.mine ? look.accentInk : look.muted; font.pixelSize: 13 }
                TapHandler { acceptedButtons: Qt.LeftButton; onTapped: if (row.media.length) files.open(row.media) }
                TapHandler { acceptedButtons: Qt.RightButton; onTapped: (pt) => { const g = pic.mapToItem(null, pt.position.x, pt.position.y); row.menuRequested(row.eventId, row.mine, g.x, g.y) } }
            }
        }
        Item {   // a file
            visible: row.kind === "file"
            width: parent.width; height: visible ? fileBox.height : 0
            Rectangle {
                id: fileBox
                anchors.right: row.mine ? parent.right : undefined; anchors.left: row.mine ? undefined : parent.left
                anchors.rightMargin: 14; anchors.leftMargin: 14
                width: Math.min(300, row.width * 0.74); height: 54; radius: 14; color: row.mine ? look.accent : look.theirs; opacity: row.local ? 0.7 : 1
                RowLayout {
                    anchors.fill: parent; anchors.leftMargin: 14; anchors.rightMargin: 14; spacing: 10
                    Label { text: "📎"; font.pixelSize: 22 }
                    Label { Layout.fillWidth: true; text: row.fileName || row.body; elide: Text.ElideMiddle; color: row.mine ? look.accentInk : look.text; font.pixelSize: 14 }
                    Label { text: row.media.length ? "Open" : (row.wantOpen ? "…" : "Download"); color: row.mine ? look.accentInk : look.accent; font.pixelSize: 13; font.weight: Font.DemiBold }
                }
                TapHandler { acceptedButtons: Qt.LeftButton; onTapped: { if (row.media.length) files.open(row.media); else { row.wantOpen = true; core.fetchMedia(row.eventId) } } }
                TapHandler { acceptedButtons: Qt.RightButton; onTapped: (pt) => { const g = fileBox.mapToItem(null, pt.position.x, pt.position.y); row.menuRequested(row.eventId, row.mine, g.x, g.y) } }
            }
        }
        Item {   // a poll
            visible: row.kind === "poll"
            width: parent.width; height: visible ? pollCard.height : 0
            PollCard {
                id: pollCard
                anchors.right: row.mine ? parent.right : undefined; anchors.left: row.mine ? undefined : parent.left
                anchors.rightMargin: 14; anchors.leftMargin: 14
                width: Math.min(340, row.width * 0.8); height: implicitHeight
                poll: row.poll ? row.poll : ({ question: "", answers: [], ended: false, voters: 0, max: 1 }); mine: row.mine; eventId: row.eventId; local: row.local
                TapHandler { acceptedButtons: Qt.RightButton; onTapped: (pt) => { const g = pollCard.mapToItem(null, pt.position.x, pt.position.y); row.menuRequested(row.eventId, row.mine, g.x, g.y) } }
            }
        }
        Item {
            visible: row.kind !== "image" && row.kind !== "file" && row.kind !== "poll"
            width: parent.width; height: visible ? bubble.height : 0
            Rectangle {
                id: bubble
                anchors.right: row.mine ? parent.right : undefined
                anchors.left: row.mine ? undefined : parent.left
                anchors.rightMargin: 14; anchors.leftMargin: 14
                width: Math.min(Math.max(text.implicitWidth, quote.visible ? 160 : 0) + 28, row.width * 0.74)
                height: text.implicitHeight + 16 + (quote.visible ? quote.height + 4 : 0) + (meta.visible ? meta.implicitHeight + 2 : 0)
                radius: 18
                topLeftRadius: !row.mine && !row.first ? 5 : 18; bottomLeftRadius: !row.mine && !row.last ? 5 : 18
                topRightRadius: row.mine && !row.first ? 5 : 18; bottomRightRadius: row.mine && !row.last ? 5 : 18
                color: row.mine ? look.accent : look.theirs
                opacity: row.local ? 0.7 : 1
                TapHandler { acceptedButtons: Qt.RightButton; onTapped: (pt) => { const g = bubble.mapToItem(null, pt.position.x, pt.position.y); row.menuRequested(row.eventId, row.mine, g.x, g.y) } }
                TapHandler { acceptedButtons: Qt.LeftButton; acceptedDevices: PointerDevice.TouchScreen; longPressThreshold: 0.5; onLongPressed: { const g = bubble.mapToItem(null, point.position.x, point.position.y); row.menuRequested(row.eventId, row.mine, g.x, g.y) } }
                Rectangle {   // the message this one answers
                    id: quote
                    visible: row.replyTo.length > 0
                    x: 10; y: 8; width: bubble.width - 20; height: visible ? quoteText.implicitHeight + 8 : 0; radius: 8
                    color: Qt.rgba(0, 0, 0, row.mine ? 0.18 : 0.07)
                    Text { id: quoteText; x: 8; y: 4; width: parent.width - 16; text: core.bodyOf(row.replyTo) || "Message"; elide: Text.ElideRight; maximumLineCount: 2; wrapMode: Text.Wrap
                           color: row.mine ? look.accentInk : look.muted; font.pixelSize: 12; textFormat: Text.PlainText }
                }
                Text {
                    id: text
                    x: 14; y: 8 + (quote.visible ? quote.height + 4 : 0)
                    width: Math.min(implicitWidth, row.width * 0.74 - 28)
                    text: row.body
                    textFormat: Text.PlainText
                    wrapMode: Text.Wrap
                    color: row.locked ? look.muted : (row.mine ? look.accentInk : look.text)
                    font.pixelSize: 15; font.italic: row.locked || row.kind === "emote"
                }
                Label {
                    id: meta
                    visible: row.last
                    anchors.right: parent.right; anchors.rightMargin: 12; anchors.bottom: parent.bottom; anchors.bottomMargin: 5
                    text: (row.edited ? "edited · " : "") + row.time + (row.local ? " · sending" : "")
                    color: row.mine ? Qt.rgba(look.accentInk.r, look.accentInk.g, look.accentInk.b, 0.75) : look.muted; font.pixelSize: 11
                }
            }
        }
        Flow {
            visible: row.reactions.length > 0
            anchors.right: row.mine ? parent.right : undefined
            anchors.left: row.mine ? undefined : parent.left
            anchors.rightMargin: 18; anchors.leftMargin: 18
            spacing: 4
            Repeater {
                model: row.reactions
                delegate: Rectangle {
                    height: 26; width: chip.implicitWidth + 16; radius: 13
                    color: modelData.mine ? Qt.rgba(look.accent.r, look.accent.g, look.accent.b, 0.22) : look.panel2
                    border.width: modelData.mine ? 1 : 0; border.color: look.accent
                    TapHandler { onTapped: row.reactionTapped(row.eventId, modelData.key) }
                    Label { id: chip; anchors.centerIn: parent; text: modelData.key + (modelData.count > 1 ? " " + modelData.count : ""); font.pixelSize: 15; color: look.text }
                }
            }
        }
    }
}
