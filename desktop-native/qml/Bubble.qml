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
    required property bool fresh
    property bool showName: false           // group chats: names and pictures of the other people
    signal menuRequested(string eventId, bool mine, real gx, real gy)
    signal reactionTapped(string eventId, string key)
    signal jumpTo(string eventId)
    signal openMedia(string eventId)
    signal replyRequested(string eventId)

    readonly property real maxW: Math.min(width * (settings.bubbleWidth >= 40 ? Math.min(95, settings.bubbleWidth) / 100 : 0.76), settings.bubbleWidth >= 40 ? 1200 : 560)
    readonly property bool bare: sticker || bigEmoji
    readonly property bool framed: !bare && (kind === "image" || kind === "video")   // a picture sits in its bubble with a thin edge, like the web
    width: ListView.view ? ListView.view.width : 400
    height: col.implicitHeight + (first ? 7 : 1.5)
    // ---- how this side's bubbles look: BubbleLook holds the rules, these are just short names for them
    property var lk
    readonly property string shape: lk.shape
    readonly property int baseRadius: lk.baseRadius
    readonly property int tight: lk.tight
    readonly property string borderStyle: lk.borderStyle
    readonly property string fill: lk.fill
    readonly property string customBg: lk.customBg
    readonly property color base: lk.base
    readonly property bool outlined: lk.outlined
    readonly property color bubbleColor: lk.bubbleColor
    readonly property color ink: lk.ink
    readonly property color softInk: lk.softInk
    readonly property color borderColorOf: lk.borderColorOf
    readonly property real tailRadius: lk.tailRadius

    function loadMedia() { if ((kind === "image" || kind === "video") && media.length === 0 && poster.length === 0 && eventId.length && !local && settings.autoDownload === "always" && !settings.lowData) core.fetchMedia(eventId) }
    Component.onCompleted: loadMedia()
    ListView.onReused: { loadMedia(); line.rewind() }

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
            // a new message arrives with the animation you chose (Settings > Appearance > Message animation)
            readonly property bool animate: row.fresh && look.motion && settings.messageAnimation !== "none"
            opacity: animate && settings.messageAnimation === "fade" ? 0 : 1
            transform: [ Scale { id: popScale; origin.x: row.mine ? line.width : 0; origin.y: line.height; xScale: 1; yScale: 1 }, Translate { id: slideShift; y: 0 } ]
            function rewind() { popScale.xScale = 1; popScale.yScale = 1; slideShift.y = 0; opacity = animate && settings.messageAnimation === "fade" ? 0 : 1; play() }
            function play() {
                if (!animate) return
                if (settings.messageAnimation === "pop") { popScale.xScale = 0.85; popScale.yScale = 0.85; popIn.start() }
                else if (settings.messageAnimation === "slide") { slideShift.y = 16; slideIn.start() }
                else fadeIn.start()
            }
            Component.onCompleted: play()
            NumberAnimation { id: popIn; target: popScale; properties: "xScale,yScale"; to: 1; duration: 280; easing.type: Easing.OutBack; easing.overshoot: 2 }
            NumberAnimation { id: slideIn; target: slideShift; property: "y"; to: 0; duration: 260; easing.type: Easing.OutCubic }
            NumberAnimation { id: fadeIn; target: line; property: "opacity"; to: 1; duration: 350 }
            HoverHandler { id: lineHover }

            Avatar {   // the other person's picture, level with the start of their run
                visible: settings.showAvatars && row.showName && !row.mine && row.first
                x: 12; y: 0; size: 32; source: row.senderAvatar; letter: row.senderName.length ? row.senderName[0].toUpperCase() : "?"; seed: row.sender
            }

            Rectangle {
                id: bubble
                x: row.mine ? row.width - width - 14 : 14 + (row.showName && !row.mine && settings.showAvatars ? 40 : 0)
                width: Math.max(contentLoader.implicitWidth + (row.bare ? 0 : row.framed ? 8 : 26), metaRow.visible && !row.bare ? metaRow.implicitWidth + 26 : 0, quote.visible ? 180 : 0)
                height: contentLoader.implicitHeight + (row.bare ? 0 : (row.framed ? 8 : 14) + (quote.visible ? quote.height + 6 : 0))
                radius: row.bare ? 14 : row.baseRadius
                readonly property bool tailed: row.shape === "curved" || row.shape === "tail"
                topLeftRadius: row.bare ? 14 : (!row.mine && !row.first ? row.tight : row.baseRadius)
                bottomLeftRadius: row.bare ? 14 : (!row.mine && !row.last ? row.tight : (!row.mine && tailed ? row.tailRadius : row.baseRadius))
                topRightRadius: row.bare ? 14 : (row.mine && !row.first ? row.tight : row.baseRadius)
                bottomRightRadius: row.bare ? 14 : (row.mine && !row.last ? row.tight : (row.mine && tailed ? row.tailRadius : row.baseRadius))
                color: row.bare ? "transparent" : row.bubbleColor
                gradient: !row.bare && row.fill === "gradient" && row.mine && row.customBg === "" ? mineGradient : null
                Gradient { id: mineGradient; orientation: Gradient.Vertical
                    GradientStop { position: 0; color: row.base }
                    GradientStop { position: 1; color: Qt.tint(row.base, Qt.rgba(0.486, 0.227, 0.929, 0.38)) } }
                border.width: row.mentioned && !row.bare ? 2 : (row.status === 2 ? 1 : (!row.bare && (row.borderStyle !== "none" || row.shape === "outline" || row.fill === "glass") ? (row.borderStyle === "thick" ? 3 : 1.5) : 0))
                border.color: row.status === 2 ? look.danger : (row.mentioned ? look.accent : row.borderColorOf)
                Rectangle {   // depth: a soft or raised shadow under the bubble (drawn as a shifted copy so it works without graphics effects)
                    z: -1; visible: !row.bare && !row.outlined && (settings.bubbleDepth === "soft" || settings.bubbleDepth === "raised"); anchors.fill: parent
                    anchors.topMargin: settings.bubbleDepth === "raised" ? 3 : 1; anchors.leftMargin: -0.5; anchors.rightMargin: -0.5; anchors.bottomMargin: settings.bubbleDepth === "raised" ? -3 : -1
                    topLeftRadius: parent.topLeftRadius; topRightRadius: parent.topRightRadius; bottomLeftRadius: parent.bottomLeftRadius; bottomRightRadius: parent.bottomRightRadius
                    color: Qt.rgba(0, 0, 0, settings.bubbleDepth === "raised" ? 0.2 : 0.06) }
                opacity: row.local && row.status !== 2 ? 0.72 : 1

                Item {   // the message this one answers: a bar and two lines, no box
                    id: quote
                    visible: row.replyTo.length > 0 && !row.bare
                    x: row.framed ? 8 : 13; y: row.framed ? 8 : 8; width: bubble.width - (row.framed ? 16 : 26); height: visible ? qcol.implicitHeight : 0
                    Rectangle { x: 0; width: 3; height: parent.height; radius: 1.5; color: Qt.rgba(row.ink.r, row.ink.g, row.ink.b, 0.5) }
                    Column { id: qcol; x: 12; width: parent.width - 12
                        Label { text: row.replyName; width: parent.width; elide: Text.ElideRight; color: row.ink; opacity: 0.85; font.pixelSize: Math.round(13 * look.textScale); font.weight: Font.Bold; visible: text.length > 0 }
                        Label { text: row.replyText || "Message"; width: parent.width; elide: Text.ElideRight; maximumLineCount: 2; wrapMode: Text.Wrap; color: row.ink; opacity: 0.85; font.pixelSize: Math.round(13 * look.textScale) } }
                    TapHandler { onTapped: row.jumpTo(row.replyTo) }
                }

                Loader {
                    id: contentLoader
                    x: row.bare ? 0 : row.framed ? 4 : 13; y: row.bare ? 0 : (row.framed ? 4 : 7) + (quote.visible ? quote.height + 14 - (row.framed ? 6 : 6) : 0)
                    sourceComponent: row.locked ? lockedC : row.kind === "poll" ? pollC : row.kind === "image" ? (row.sticker ? stickerC : imageC) : row.kind === "video" ? videoC
                        : row.kind === "audio" ? audioC : row.kind === "file" ? (row.mime.indexOf("vcard") >= 0 || /\.vcf$/i.test(row.fileName || row.body) ? contactC : fileC) : row.kind === "location" ? locationC : row.bigEmoji ? bigC : textC
                }
                Row {   // time, edited, delivery marks
                    id: metaRow
                    visible: row.last && !row.bare && row.kind !== "poll"
                    anchors.right: parent.right; anchors.rightMargin: row.framed ? 10 : 12; anchors.bottom: parent.bottom; anchors.bottomMargin: row.framed ? 4 : 5; spacing: 4
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
                TapHandler { acceptedButtons: Qt.LeftButton; onDoubleTapped: if (settings.doubleTapReact) row.reactionTapped(row.eventId, settings.doubleTapEmoji) }
            }

            DragHandler {   // swipe a message to the right to reply (touch screens)
                id: swipe
                enabled: settings.swipeToReply && row.status !== 2 && !row.local; acceptedDevices: PointerDevice.TouchScreen; target: null; xAxis.enabled: true; yAxis.enabled: false
                onActiveChanged: { if (!active && swipe.translation.x > 70) row.replyRequested(row.eventId) }
            }
            Icon { visible: swipe.active && swipe.translation.x > 10; x: 16; anchors.verticalCenter: parent.verticalCenter; name: "reply"; size: 22; color: look.accent; opacity: Math.min(1, swipe.translation.x / 70) }
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
                    color: settings.reactionStyle === "outline" ? "transparent" : (modelData.mine ? Qt.rgba(look.accent.r, look.accent.g, look.accent.b, 0.20) : look.panel)
                    border.width: settings.reactionStyle === "outline" ? (modelData.mine ? 3 : 1.5) : 1; border.color: settings.reactionStyle === "outline" ? look.text : (modelData.mine ? look.accent : look.line)
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
                readonly property real fit: Math.min(row.imgWidth > 0 ? row.imgWidth : 270, 320, row.maxW - 8)
                height: Math.min(fit * ratio, 380); width: height / ratio
                Rectangle { id: ph; anchors.fill: parent; radius: 14; color: Qt.darker(look.panel2, look.dark ? 0.85 : 1.07); visible: pic.status !== 2
                    Label { anchors.centerIn: parent; text: row.media.length ? "" : (settings.autoDownload === "always" && !settings.lowData ? "Loading…" : "Tap to load"); color: row.softInk; font.pixelSize: 13 } }
                readonly property bool playGif: (row.gifLike || row.mime === "image/gif") && settings.autoPlayGifs && !settings.lowData && row.media.length > 0
                RoundedImage { id: pic; anchors.fill: parent; source: row.media; radius: 14; maxSide: 900; visible: !frame.playGif }
                AnimatedImage { anchors.fill: parent; visible: frame.playGif; source: frame.playGif ? "file://" + row.media : ""; fillMode: Image.PreserveAspectCrop; playing: frame.playGif; cache: false }
                Label { visible: row.gifLike || row.mime === "image/gif"; text: "GIF"; color: "white"; font.bold: true; font.pixelSize: 11; leftPadding: 6; rightPadding: 6; topPadding: 2; bottomPadding: 2; x: 8; y: 8
                    background: Rectangle { radius: 6; color: "#99000000" } }
                TapHandler { acceptedButtons: Qt.LeftButton; onTapped: { if (row.media.length === 0) core.fetchMedia(row.eventId); row.openMedia(row.eventId) } }
                HoverHandler { cursorShape: Qt.PointingHandCursor }
            }
            Text { visible: row.caption.length > 0; leftPadding: 8; rightPadding: 8; topPadding: 2; width: Math.min(implicitWidth, frame.width); text: "<style>a { color: " + (row.mine ? row.ink : look.accent) + "; }</style>" + rich.render(row.caption, row.captionHtml); textFormat: Text.RichText; wrapMode: Text.Wrap; color: row.ink; linkColor: row.mine ? row.ink : look.accent
                font.pixelSize: Math.round(15 * look.textScale); onLinkActivated: (link) => files.openUrl(link) }
            Item { width: 1; height: metaRow.visible ? 15 : 0 }
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
                readonly property real fit: Math.min(row.imgWidth > 0 ? row.imgWidth : 320, 320, row.maxW - 8)
                height: Math.min(fit * ratio, 380); width: height / ratio
                Rectangle { anchors.fill: parent; radius: 14; color: "#222"; }
                RoundedImage { id: vpic; anchors.fill: parent; source: row.poster; radius: 14; maxSide: 900 }
                Rectangle { anchors.centerIn: parent; width: 54; height: 54; radius: 27; color: "#aa000000"; Label { anchors.centerIn: parent; text: "▶"; color: "white"; font.pixelSize: 22; leftPadding: 3 } }
                Label { visible: row.durationMs > 0; x: 8; y: 8; text: Math.floor(row.durationMs / 60000) + ":" + ("0" + Math.floor(row.durationMs / 1000) % 60).slice(-2); color: "white"; font.pixelSize: 11; leftPadding: 6; rightPadding: 6; topPadding: 2; bottomPadding: 2; background: Rectangle { radius: 6; color: "#99000000" } }
                TapHandler { onTapped: row.openMedia(row.eventId) }
                HoverHandler { cursorShape: Qt.PointingHandCursor }
            }
            Text { visible: row.caption.length > 0; leftPadding: 8; rightPadding: 8; topPadding: 2; width: Math.min(implicitWidth, vframe.width); text: "<style>a { color: " + (row.mine ? row.ink : look.accent) + "; }</style>" + rich.render(row.caption, row.captionHtml); textFormat: Text.RichText; wrapMode: Text.Wrap; color: row.ink; linkColor: row.mine ? row.ink : look.accent
                font.pixelSize: Math.round(15 * look.textScale); onLinkActivated: (link) => files.openUrl(link) }
            Item { width: 1; height: metaRow.visible ? 15 : 0 }
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
                spacing: 12
                Rectangle { width: 40; height: 40; radius: 12; color: Qt.rgba(row.ink.r, row.ink.g, row.ink.b, 0.13); Icon { anchors.centerIn: parent; name: "file-text"; size: 20; color: row.ink } }
                Column { anchors.verticalCenter: parent.verticalCenter; spacing: 1
                    Label { text: row.fileName || row.body; color: row.ink; font.pixelSize: Math.round(14 * look.textScale); elide: Text.ElideMiddle; width: Math.min(implicitWidth, row.maxW - 100) }
                    Label { text: row.size > 0 ? files.humanSize(row.size) : ""; visible: text.length > 0; color: row.softInk; font.pixelSize: Math.round(12 * look.textScale) } }
            }
            Item { width: 1; height: metaRow.visible ? 13 : 0 }
            TapHandler { onTapped: row.openMedia(row.eventId) }
            HoverHandler { cursorShape: Qt.PointingHandCursor }
        }
    }
    Component {
        id: contactC
        Column {
            id: card
            property string name: row.fileName.replace(/\.vcf$/i, "") || row.body.replace(/\.vcf$/i, "")
            property string tel: ""
            Component.onCompleted: core.fetchFull(row.eventId)
            Connections { target: core; function onMediaReady(key) { if (key === "full:" + row.eventId) card.read() } }
            function read() {
                const p = core.fullPath(row.eventId); if (!p.length) return
                const t = files.readText(p), n = /^FN[^:]*:(.*)$/m.exec(t), v = /^TEL[^:]*:(.*)$/m.exec(t)
                if (n && n[1].trim().length) name = n[1].trim(); if (v) tel = v[1].trim()
            }
            Row {
                spacing: 12
                Avatar { size: 42; letter: card.name.length ? card.name[0].toUpperCase() : "?"; seed: card.name }
                Column { anchors.verticalCenter: parent.verticalCenter; spacing: 1
                    Label { text: card.name; color: row.ink; font.weight: Font.DemiBold; font.pixelSize: Math.round(14 * look.textScale) }
                    Label { visible: card.tel.length > 0; text: card.tel; color: row.softInk; font.pixelSize: Math.round(12 * look.textScale) }
                    Label { text: "Click to save contact"; color: row.softInk; font.pixelSize: Math.round(12 * look.textScale) } }
            }
            Item { width: 1; height: metaRow.visible ? 13 : 0 }
            TapHandler { onTapped: row.openMedia(row.eventId) }
            HoverHandler { cursorShape: Qt.PointingHandCursor }
        }
    }
    Component {
        id: locationC
        Column {
            Row { spacing: 12
                Rectangle { width: 40; height: 40; radius: 12; color: "#ef4444"; Icon { anchors.centerIn: parent; name: "map-pin"; size: 20; color: "white" } }
                Column { anchors.verticalCenter: parent.verticalCenter; spacing: 1
                    Label { text: "Shared location"; color: row.ink; font.pixelSize: Math.round(14 * look.textScale) }
                    Label { text: row.geo.replace("geo:", "").split(";")[0] + " · open map"; color: row.softInk; font.pixelSize: Math.round(12 * look.textScale) } }
                TapHandler { onTapped: { const c = row.geo.replace("geo:", "").split(";")[0].split(","); files.openUrl("https://www.openstreetmap.org/?mlat=" + c[0] + "&mlon=" + c[1] + "#map=16/" + c[0] + "/" + c[1]) } }
                HoverHandler { cursorShape: Qt.PointingHandCursor } }
            Item { width: 1; height: metaRow.visible ? 13 : 0 }
        }
    }
    Component {
        id: pollC
        PollCard { poll: row.poll ? row.poll : ({ question: "", answers: [], ended: false, voters: 0, max: 1 }); mine: row.mine; eventId: row.eventId; local: row.local; width: Math.min(340, row.maxW - 4); color: "transparent" }
    }
}
