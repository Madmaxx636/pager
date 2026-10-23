import QtQuick
import QtQuick.Controls
import Pager.Items

// What a web address in a message looks like: picture, site, title and a few words. The server fetches it for you.
Item {
    id: card
    property string url
    property color ink: look.text
    property color softInk: look.muted
    property var info: null
    property string imagePath: ""
    visible: info !== null
    implicitWidth: 300; implicitHeight: info ? col.implicitHeight + 8 : 0
    width: implicitWidth; height: implicitHeight
    Component.onCompleted: core.linkPreview(url, function (p) { card.info = p ? p : null; if (p && p.imageMxc) card.imagePath = core.thumbPath(p.imageMxc, 480) })
    Connections { target: core; function onMediaReady(key) { if (card.info && card.info.imageMxc && key === "th480:" + card.info.imageMxc) card.imagePath = core.thumbPath(card.info.imageMxc, 480) } }

    Rectangle {
        anchors.fill: parent; anchors.topMargin: 6; radius: 10; color: Qt.rgba(card.ink.r, card.ink.g, card.ink.b, 0.10)
        Rectangle { width: 3; height: parent.height - 12; y: 6; x: 6; radius: 1.5; color: look.accent }
        Column {
            id: col; x: 16; y: 6; width: parent.width - 26; spacing: 3
            Label { visible: !!card.info && card.info.site.length > 0; text: card.info ? card.info.site : ""; color: card.softInk; font.pixelSize: Math.round(11 * look.textScale); elide: Text.ElideRight; width: parent.width }
            Label { visible: !!card.info && card.info.title.length > 0; text: card.info ? card.info.title : ""; color: card.ink; font.weight: Font.DemiBold; font.pixelSize: Math.round(13 * look.textScale); wrapMode: Text.Wrap; maximumLineCount: 2; elide: Text.ElideRight; width: parent.width }
            Label { visible: !!card.info && card.info.description.length > 0; text: card.info ? card.info.description : ""; color: card.softInk; font.pixelSize: Math.round(12 * look.textScale); wrapMode: Text.Wrap; maximumLineCount: 3; elide: Text.ElideRight; width: parent.width }
            Item { visible: card.imagePath.length > 0; width: parent.width; height: visible ? Math.min(160, width * 0.5) : 0
                RoundedImage { anchors.fill: parent; source: card.imagePath; radius: 8; maxSide: 700 } }
            Item { width: 1; height: 4 }
        }
        TapHandler { onTapped: files.openUrl(card.url) }
        HoverHandler { cursorShape: Qt.PointingHandCursor }
    }
}
