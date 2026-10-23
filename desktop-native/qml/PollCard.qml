import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// A poll inside a message: the question, each answer with its bar, and who can still vote.
Rectangle {
    id: card
    property var poll; property bool mine; property string eventId; property bool local
    implicitWidth: 300; implicitHeight: col.implicitHeight + 24
    radius: 14; color: mine ? look.accent : look.theirs
    readonly property color ink: mine ? look.accentInk : look.text
    readonly property color soft: mine ? Qt.rgba(look.accentInk.r, look.accentInk.g, look.accentInk.b, 0.75) : look.muted
    ColumnLayout {
        id: col
        x: 14; y: 12; width: parent.width - 28; spacing: 8
        Label { Layout.fillWidth: true; text: "📊 " + card.poll.question; wrapMode: Text.Wrap; color: card.ink; font.pixelSize: 15; font.weight: Font.DemiBold }
        Label { text: card.poll.ended ? "Final results" : (card.poll.max > 1 ? "Choose up to " + card.poll.max : "Choose one"); color: card.soft; font.pixelSize: 12 }
        Repeater {
            model: card.poll.answers
            delegate: Rectangle {
                Layout.fillWidth: true; implicitHeight: 38; radius: 10
                color: Qt.rgba(card.ink.r, card.ink.g, card.ink.b, 0.10); clip: true
                border.width: modelData.mine ? 2 : 0; border.color: card.ink
                Rectangle {   // the bar
                    visible: modelData.votes >= 0 && card.poll.voters > 0
                    height: parent.height; width: parent.width * (card.poll.voters > 0 ? Math.max(0, modelData.votes) / card.poll.voters : 0)
                    color: Qt.rgba(card.ink.r, card.ink.g, card.ink.b, modelData.winner ? 0.30 : 0.16)
                }
                RowLayout {
                    anchors.fill: parent; anchors.leftMargin: 12; anchors.rightMargin: 12
                    Label { Layout.fillWidth: true; text: (modelData.mine ? "✓ " : "") + modelData.text; color: card.ink; font.pixelSize: 14; elide: Text.ElideRight; font.weight: modelData.winner ? Font.Bold : Font.Normal }
                    Label { visible: modelData.votes >= 0; text: modelData.votes; color: card.soft; font.pixelSize: 13 }
                }
                TapHandler { enabled: !card.poll.ended && !card.local; onTapped: core.vote(card.eventId, modelData.id) }
            }
        }
        RowLayout {
            Layout.fillWidth: true
            Label { Layout.fillWidth: true; color: card.soft; font.pixelSize: 12
                text: card.poll.voters < 0 ? "Results show when the poll ends" : (card.poll.voters + (card.poll.voters === 1 ? " vote" : " votes")) }
            Label { visible: card.mine && !card.poll.ended && !card.local; text: "End poll"; color: card.ink; font.pixelSize: 12; font.underline: true
                TapHandler { onTapped: core.endPoll(card.eventId) } }
        }
    }
}
