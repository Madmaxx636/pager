import QtQuick
import QtQuick.Controls
import Pager.Items
import QtQuick.Layouts
import "Networks.js" as N

// One message with everything around it: day heading, "new messages" line, sender name and picture, the bubble (text, picture, video, voice, file, place, poll...),
// reactions, delivery marks. Every role of the timeline model arrives as a property of the same name.
Item {
    id: row
    required property string eventId
    required property string sender
    required property string senderName
    required property string senderAvatar
    required property string body
    required property string kind
    required property string time
    required property string fullTime
    required property bool mine
    required property bool locked
    required property bool local
    required property int status
    required property bool first
    required property bool last
    required property var reactions
    required property string day
    required property bool edited
    required property string replyTo
    required property string replyName
    required property string replyText
    required property string media
    required property string poster
    required property int imgWidth
    required property int imgHeight
    required property string fileName
    required property var poll
    required property string html
    required property string caption
    required property string captionHtml
    required property string mime
    required property real size
    required property real durationMs
    required property bool voice
    required property bool sticker
    required property bool gifLike
    required property string geo
    required property int tick
    required property bool unreadDivider
    required property bool mentioned
    required property bool bigEmoji
    property bool showName: false           // group chats: names and pictures of the other people
    signal menuRequested(string eventId, bool mine, real gx, real gy)
    signal reactionTapped(string eventId, string key)
    signal jumpTo(string eventId)
    signal openMedia(string eventId)
    signal replyRequested(string eventId)

    readonly property real maxW: Math.min(width * 0.76, 560)
    readonly property bool bare: sticker || bigEmoji || ((kind === "image" || kind === "video") && caption.length === 0 && !sticker)
    width: ListView.view ? ListView.view.width : 400
    height: col.implicitHeight + (first ? 7 : 1.5)
    readonly property color bubbleColor: settings.bubbleStyle === "outline" ? "transparent" : (mine ? look.accent : look.theirs)
    readonly property bool outlined: settings.bubbleStyle === "outline"
    readonly property color ink: outlined ? look.text : (mine ? look.accentInk : look.text)
    readonly property color softInk: outlined ? look.muted : (mine ? Qt.rgba(look.accentInk.r, look.accentInk.g, look.accentInk.b, 0.72) : look.muted)
    readonly property real tailRadius: settings.bubbleStyle === "tail" ? 3 : settings.bubbleStyle === "curved" ? 7 : 5

    Component.onCompleted: if ((kind === "image" || kind === "video") && media.length === 0 && poster.length === 0 && eventId.length && !local && settings.autoDownload === "always" && !settings.lowData) core.fetchMedia(eventId)

    Column {
        id: col
        width: parent.width
        spacing: 2
        Item {   // the day heading sits above the first message of that day
            visible: row.day.length > 0; width: parent.width; height: visible ? 44 : 0
            Rectangle { anchors.centerIn: parent; width: dayLabel.implicitWidth + 26; height: 24; radius: 12; color: look.panel
                Label { id: dayLabel; anchors.centerIn: parent; text: row.day; color: look.muted; font.pixelSize: Math.round(12 * look.textScale); font.weight: Font.Medium } }
        }
        Item {   // where the unread messages begin
            visible: row.unreadDivider; width: parent.width; height: visible ? 30 : 0
            Rectangle { anchors.verticalCenter: parent.verticalCenter; x: 16; width: parent.width - 32; height: 1; color: look.accent; opacity: 0.5 }
            Label { anchors.centerIn: parent; text: "New messages"; color: look.accent; font.pixelSize: Math.round(12 * look.textScale); font.weight: Font.Bold; leftPadding: 10; rightPadding: 10; background: Rectangle { color: look.bg } }
        }
        Label {
            visible: row.showName && !row.mine && row.first
            leftPadding: 18 + (settings.showAvatars ? 40 : 0); text: row.senderName
            color: !settings.colorSenderNames ? look.muted : Qt.hsla(((row.sender).split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)) / 360, 0.6, look.dark ? 0.68 : 0.40, 1)
            font.pixelSize: Math.round(12 * look.textScale); font.weight: Font.DemiBold
        }
        Item {
            id: line
            width: parent.width; height: Math.max(bubble.height, 1)
            HoverHandler { id: lineHover }

            Avatar {   // the other person's picture, level with the start of their run
                visible: settings.showAvatars && row.showName && !row.mine && row.first
                x: 12; y: 0; size: 32; source: row.senderAvatar; letter: row.senderName.length ? row.senderName[0].toUpperCase() : "?"; seed: row.sender
            }

            Rectangle {
                id: bubble
                x: row.mine ? row.width - width - 14 : 14 + (row.showName && !row.mine && settings.showAvatars ? 40 : 0)
                width: Math.max(contentLoader.implicitWidth + (row.bare ? 0 : 26), metaRow.visible && !row.bare ? metaRow.implicitWidth + 26 : 0)
                height: contentLoader.implicitHeight + (row.bare ? 0 : 14 + (metaRow.visible ? metaRow.implicitHeight + 1 : 0) + (quote.visible ? quote.height + 5 : 0))
                radius: row.bare ? 14 : 18
                topLeftRadius: row.bare ? 14 : (!row.mine && !row.first ? 5 : 18); bottomLeftRadius: row.bare ? 14 : (!row.mine && !row.last ? 5 : (!row.mine && row.last && settings.bubbleStyle !== "round" && settings.bubbleStyle !== "outline" ? row.tailRadius : 18))
                topRightRadius: row.bare ? 14 : (row.mine && !row.first ? 5 : 18); bottomRightRadius: row.bare ? 14 : (row.mine && !row.last ? 5 : (row.mine && row.last && settings.bubbleStyle !== "round" && settings.bubbleStyle !== "outline" ? row.tailRadius : 18))
                color: row.bare ? "transparent" : row.bubbleColor
                border.width: row.mentioned && !row.bare ? 2 : (row.status === 2 ? 1 : (row.outlined && !row.bare ? 1.5 : 0)); border.color: row.status === 2 ? look.danger : (row.outlined && !row.mentioned ? (row.mine ? look.accent : look.line) : look.accent)
                opacity: row.local && row.status !== 2 ? 0.72 : 1

                Rectangle {   // the message this one answers
                    id: quote
                    visible: row.replyTo.length > 0 && !row.bare
                    x: 9; y: 8; width: bubble.width - 18; height: visible ? qcol.implicitHeight + 10 : 0; radius: 9
                    color: Qt.rgba(0, 0, 0, row.mine ? 0.16 : 0.06)
                    Rectangle { x: 0; width: 3; height: parent.height; radius: 1.5; color: row.mine ? row.ink : look.accent }
                    Column { id: qcol; x: 11; y: 5; width: parent.width - 18
                        Label { text: row.replyName; width: parent.width; elide: Text.ElideRight; color: row.mine ? row.ink : look.accent; font.pixelSize: Math.round(12 * look.textScale); font.weight: Font.Bold; visible: text.length > 0 }
                        Label { text: row.replyText || "Message"; width: parent.width; elide: Text.ElideRight; maximumLineCount: 2; wrapMode: Text.Wrap; color: row.softInk; font.pixelSize: Math.round(12 * look.textScale) } }
                    TapHandler { onTapped: row.jumpTo(row.replyTo) }
                }

                Loader {
                    id: contentLoader
                    x: row.bare ? 0 : 13; y: row.bare ? 0 : 7 + (quote.visible ? quote.height + 5 : 0)
                    sourceComponent: row.locked ? lockedC : row.kind === "poll" ? pollC : row.kind === "image" ? (row.sticker ? stickerC : imageC) : row.kind === "video" ? videoC
                        : row.kind === "audio" ? audioC : row.kind === "file" ? fileC : row.kind === "location" ? locationC : row.bigEmoji ? bigC : textC
                }
                Row {   // time, edited, delivery marks
                    id: metaRow
                    visible: row.last && !row.bare && row.kind !== "poll"
                    anchors.right: parent.right; anchors.rightMargin: 12; anchors.bottom: parent.bottom; anchors.bottomMargin: 5; spacing: 4
                    Label { visible: row.edited; text: "edited"; color: row.softInk; font.pixelSize: Math.round(11 * look.textScale); font.italic: true }
                    Label { visible: settings.showMessageTimes; text: row.time; color: row.softInk; font.pixelSize: Math.round(11 * look.textScale)
                        ToolTip.visible: tipHover.hovered; ToolTip.text: row.fullTime; ToolTip.delay: 500; HoverHandler { id: tipHover } }
                    Icon { visible: row.mine && row.tick > 0 && settings.showReadTicks; anchors.verticalCenter: parent.verticalCenter; size: 14
                        name: row.tick === 1 ? "clock" : row.tick === 2 ? "circle-alert" : row.tick >= 4 ? "check-check" : "check"
                        color: row.tick === 5 ? (row.outlined ? look.accent : "#bff3ff") : (row.tick === 2 ? look.danger : row.softInk) }
                }
                TapHandler { acceptedButtons: Qt.RightButton; onTapped: (pt) => { const g = bubble.mapToItem(null, pt.position.x, pt.position.y); row.menuRequested(row.eventId, row.mine, g.x, g.y) } }
                TapHandler { acceptedButtons: Qt.LeftButton; enabled: row.status === 2; onTapped: core.retry(row.eventId) }
                TapHandler { acceptedDevices: PointerDevice.TouchScreen; longPressThreshold: 0.45; onLongPressed: { const g = bubble.mapToItem(null, point.position.x, point.position.y); row.menuRequested(row.eventId, row.mine, g.x, g.y) } }
                TapHandler { acceptedButtons: Qt.LeftButton; gesturePolicy: TapHandler.ReleaseWithinBounds; onDoubleTapped: if (settings.doubleTapReact) row.reactionTapped(row.eventId, settings.doubleTapEmoji) }
            }

            Row {   // hover tools
                visible: lineHover.hovered && row.status !== 2 && !row.local
                x: row.mine ? bubble.x - width - 6 : bubble.x + bubble.width + 6
                y: Math.max(0, (bubble.height - height) / 2); spacing: 2
                Repeater {
                    model: [["smile", "React"], ["reply", "Reply"], ["ellipsis", "More"]]
                    delegate: Rectangle { width: 30; height: 28; radius: 9; color: tHover.hovered ? look.panel2 : look.panel; border.width: 1; border.color: look.line
                        Icon { anchors.centerIn: parent; name: modelData[0]; size: 16; color: look.muted }
                        HoverHandler { id: tHover }
                        TapHandler { onTapped: { if (index === 1) row.replyRequested(row.eventId); else { const g = parent.mapToItem(null, 0, 26); row.menuRequested(row.eventId, row.mine, g.x, g.y) } } }
                    }
                }
            }
        }
        Label { visible: row.status === 2; x: row.mine ? row.width - width - 16 : 56; text: "Not sent · click the message to try again"; color: look.danger; font.pixelSize: Math.round(11 * look.textScale) }
        Flow {   // reactions
            visible: row.reactions.length > 0
            x: row.mine ? row.width - row.maxW - 16 : 14 + (row.showName && settings.showAvatars ? 40 : 0)
            width: row.maxW; spacing: 4; layoutDirection: row.mine ? Qt.RightToLeft : Qt.LeftToRight
            Repeater {
                model: row.reactions
                delegate: Rectangle {
                    height: 26; width: chipRow.implicitWidth + 16; radius: 13
                    color: modelData.mine ? Qt.rgba(look.accent.r, look.accent.g, look.accent.b, 0.20) : look.panel
                    border.width: 1; border.color: modelData.mine ? look.accent : look.line
                    Row { id: chipRow; anchors.centerIn: parent; spacing: 4
                        Label { text: modelData.key; font.pixelSize: Math.round(15 * look.textScale); color: look.text }
                        Label { visible: modelData.count > 1; text: modelData.count; font.pixelSize: Math.round(12 * look.textScale); color: look.muted; anchors.verticalCenter: parent.verticalCenter } }
                    TapHandler { onTapped: row.reactionTapped(row.eventId, modelData.key) }
                    HoverHandler { id: chipHover }
                    ToolTip.visible: chipHover.hovered; ToolTip.text: modelData.who; ToolTip.delay: 400
                }
            }
        }
        Item { width: 1; height: 2 }
    }

    // ---- what is inside the bubble ----------------------------------------------------------------------------------------------------------------
    Component {
        id: textC
        Column {
            spacing: 0
            Text {
                id: msgText
                width: Math.min(implicitWidth, row.maxW - 28)
                text: "<style>a { color: " + (row.mine ? row.ink : look.accent) + "; }</style>" + rich.render(row.body, row.html); textFormat: Text.RichText; wrapMode: Text.Wrap; color: row.ink; linkColor: row.mine ? row.ink : look.accent
                font.pixelSize: Math.round(15 * look.textScale); font.italic: row.kind === "emote" || row.kind === "notice"
                onLinkActivated: (link) => files.openUrl(link)
                HoverHandler { cursorShape: msgText.hoveredLink ? Qt.PointingHandCursor : Qt.ArrowCursor }
            }
            Loader {   // a web address in the message: show what it is
                readonly property string link: settings.linkPreviews && !settings.lowData && row.kind === "text" ? rich.firstUrl(row.body) : ""
                active: link.length > 0; width: Math.min(300, row.maxW - 28); height: item ? item.height : 0
                sourceComponent: LinkCard { url: parent.link; ink: row.ink; softInk: row.softInk; width: parent.width }
            }
            Item { width: 1; height: metaRow.visible ? 13 : 0 }
        }
    }
    Component {
        id: bigC
        Text { text: row.body; font.pixelSize: Math.round(46 * look.textScale); color: row.ink }
    }
    Component {
        id: lockedC
        Column { Text { text: "🔒 " + row.body; color: row.softInk; font.italic: true; font.pixelSize: Math.round(14 * look.textScale); width: Math.min(implicitWidth, row.maxW - 28); wrapMode: Text.Wrap }
                 Item { width: 1; height: metaRow.visible ? 13 : 0 } }
    }
    Component {
        id: imageC
        Column {
            spacing: 4
            Item {
                id: frame
                readonly property real ratio: row.imgWidth > 0 && row.imgHeight > 0 ? Math.min(2.2, Math.max(0.4, row.imgHeight / row.imgWidth)) : 0.75
                width: Math.min(row.maxW, 340); height: Math.max(90, Math.min(width * ratio, 420))
                Rectangle { id: ph; anchors.fill: parent; radius: 14; color: Qt.darker(look.panel2, look.dark ? 0.85 : 1.07); visible: pic.status !== 2
                    Label { anchors.centerIn: parent; text: row.media.length ? "" : (settings.autoDownload === "always" && !settings.lowData ? "Loading…" : "Tap to load"); color: row.softInk; font.pixelSize: 13 } }
                RoundedImage { id: pic; anchors.fill: parent; source: row.media; radius: 14; maxSide: 900 }
                Label { visible: row.gifLike || row.mime === "image/gif"; text: "GIF"; color: "white"; font.bold: true; font.pixelSize: 11; leftPadding: 6; rightPadding: 6; topPadding: 2; bottomPadding: 2; x: 8; y: 8
                    background: Rectangle { radius: 6; color: "#99000000" } }
                Row {   // time over the picture when there are no words with it
                    visible: row.caption.length === 0; anchors.right: parent.right; anchors.bottom: parent.bottom; anchors.margins: 6
                    Label { text: row.time + (row.mine ? (row.tick === 5 ? "  ✓✓" : "  ✓") : ""); color: "white"; font.pixelSize: 11; leftPadding: 7; rightPadding: 7; topPadding: 2; bottomPadding: 2; background: Rectangle { radius: 9; color: "#99000000" } } }
                TapHandler { acceptedButtons: Qt.LeftButton; onTapped: { if (row.media.length === 0) core.fetchMedia(row.eventId); row.openMedia(row.eventId) } }
                HoverHandler { cursorShape: Qt.PointingHandCursor }
            }
            Text { visible: row.caption.length > 0; width: Math.min(implicitWidth, frame.width); text: "<style>a { color: " + (row.mine ? row.ink : look.accent) + "; }</style>" + rich.render(row.caption, row.captionHtml); textFormat: Text.RichText; wrapMode: Text.Wrap; color: row.ink; linkColor: row.mine ? row.ink : look.accent
                font.pixelSize: Math.round(15 * look.textScale); onLinkActivated: (link) => files.openUrl(link) }
            Item { width: 1; height: row.caption.length > 0 && metaRow.visible ? 13 : 0 }
        }
    }
    Component {
        id: stickerC
        Item {
            width: 150; height: 150
            Image { anchors.fill: parent; source: row.media.length ? "file://" + row.media : ""; fillMode: Image.PreserveAspectFit; asynchronous: true; cache: false; sourceSize.width: 300 }
        }
    }
    Component {
        id: videoC
        Column {
            spacing: 4
            Item {
                id: vframe
                readonly property real ratio: row.imgWidth > 0 && row.imgHeight > 0 ? Math.min(2.0, Math.max(0.45, row.imgHeight / row.imgWidth)) : 0.56
                width: Math.min(row.maxW, 340); height: Math.max(100, Math.min(width * ratio, 420))
                Rectangle { anchors.fill: parent; radius: 14; color: "#222"; }
                RoundedImage { id: vpic; anchors.fill: parent; source: row.poster; radius: 14; maxSide: 900 }
                Rectangle { anchors.centerIn: parent; width: 54; height: 54; radius: 27; color: "#aa000000"; Label { anchors.centerIn: parent; text: "▶"; color: "white"; font.pixelSize: 22; leftPadding: 3 } }
                Label { visible: row.durationMs > 0; x: 8; y: 8; text: Math.floor(row.durationMs / 60000) + ":" + ("0" + Math.floor(row.durationMs / 1000) % 60).slice(-2); color: "white"; font.pixelSize: 11; leftPadding: 6; rightPadding: 6; topPadding: 2; bottomPadding: 2; background: Rectangle { radius: 6; color: "#99000000" } }
                Row { visible: row.caption.length === 0; anchors.right: parent.right; anchors.bottom: parent.bottom; anchors.margins: 6
                    Label { text: row.time; color: "white"; font.pixelSize: 11; leftPadding: 7; rightPadding: 7; topPadding: 2; bottomPadding: 2; background: Rectangle { radius: 9; color: "#99000000" } } }
                TapHandler { onTapped: row.openMedia(row.eventId) }
                HoverHandler { cursorShape: Qt.PointingHandCursor }
            }
            Text { visible: row.caption.length > 0; width: Math.min(implicitWidth, vframe.width); text: "<style>a { color: " + (row.mine ? row.ink : look.accent) + "; }</style>" + rich.render(row.caption, row.captionHtml); textFormat: Text.RichText; wrapMode: Text.Wrap; color: row.ink; linkColor: row.mine ? row.ink : look.accent
                font.pixelSize: Math.round(15 * look.textScale); onLinkActivated: (link) => files.openUrl(link) }
            Item { width: 1; height: row.caption.length > 0 && metaRow.visible ? 13 : 0 }
        }
    }
    Component {
        id: audioC
        Column {
            Loader {   // the sound player (and the multimedia libraries behind it) is only loaded when a chat has a sound
                width: Math.min(row.maxW - 28, 280); height: 40
                source: "AudioBubble.qml"
                onLoaded: { item.eventId = row.eventId; item.voice = row.voice; item.durationMs = row.durationMs; item.fileName = row.fileName; item.ink = row.ink; item.softInk = row.softInk; item.accentColor = row.mine ? row.ink : look.accent; item.width = width }
            }
            Item { width: 1; height: metaRow.visible ? 13 : 0 }
        }
    }
    Component {
        id: fileC
        Column {
            Row {
                spacing: 10
                Rectangle { width: 40; height: 40; radius: 10; color: Qt.rgba(row.ink.r, row.ink.g, row.ink.b, 0.14); Label { anchors.centerIn: parent; text: "📄"; font.pixelSize: 20 } }
                Column { anchors.verticalCenter: parent.verticalCenter; spacing: 1
                    Label { text: row.fileName || row.body; color: row.ink; font.pixelSize: Math.round(14 * look.textScale); elide: Text.ElideMiddle; width: Math.min(implicitWidth, row.maxW - 100) }
                    Label { text: (row.size > 0 ? (row.size > 1048576 ? (row.size / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(row.size / 1024)) + " KB") + " · " : "") + (row.media.length ? "Downloaded" : "Click to download"); color: row.softInk; font.pixelSize: Math.round(12 * look.textScale) } }
            }
            Item { width: 1; height: metaRow.visible ? 13 : 0 }
            TapHandler { onTapped: row.openMedia(row.eventId) }
            HoverHandler { cursorShape: Qt.PointingHandCursor }
        }
    }
    Component {
        id: locationC
        Column {
            spacing: 4
            Row { spacing: 8; Label { text: "📍"; font.pixelSize: 20 }
                Label { text: "Shared location"; color: row.ink; font.pixelSize: Math.round(14 * look.textScale); anchors.verticalCenter: parent.verticalCenter } }
            Label { text: "Open in maps"; color: row.mine ? row.ink : look.accent; font.underline: true; font.pixelSize: Math.round(13 * look.textScale)
                TapHandler { onTapped: { const c = row.geo.replace("geo:", "").split(";")[0].split(","); files.openUrl("https://www.openstreetmap.org/?mlat=" + c[0] + "&mlon=" + c[1] + "#map=16/" + c[0] + "/" + c[1]) } } }
            Item { width: 1; height: metaRow.visible ? 13 : 0 }
        }
    }
    Component {
        id: pollC
        PollCard { poll: row.poll ? row.poll : ({ question: "", answers: [], ended: false, voters: 0, max: 1 }); mine: row.mine; eventId: row.eventId; local: row.local; width: Math.min(340, row.maxW - 4); color: "transparent" }
    }
}
