import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// Someone nudged or rang you: a full-window alert with sound until you answer, dismiss it or it times out.
Popup {
    id: pop
    signal openChat(string roomId)
    property string roomId: ""; property string chat: ""; property string sender: ""; property string kind: "nudge"
    readonly property bool calling: kind === "ring" || kind === "video"
    parent: Overlay.overlay; x: 0; y: 0; width: parent ? parent.width : 400; height: parent ? parent.height : 300
    modal: true; closePolicy: Popup.CloseOnEscape; padding: 0
    property string eventId: ""
    readonly property string picture: { picRev; return eventId.length ? core.fullPath(eventId) : "" }
    property int picRev: 0
    Connections { target: core; function onMediaReady(key) { if (key === "full:" + pop.eventId) pop.picRev++ } }
    function raise(room, chatName, from, k, ev) { roomId = room; chat = chatName; sender = from; kind = k; eventId = ev || ""; open() }
    onOpened: { ring(); beat.restart(); giveUp.interval = calling ? 45000 : 12000; giveUp.restart(); shake.restart() }
    onClosed: { beat.stop(); giveUp.stop(); shake.stop() }
    function ring() { sound.source = "file://" + files.tone(calling ? "ring" : "nudge"); sound.play() }
    Loader { id: soundLoader; active: false; source: "AttentionSound.qml"; onLoaded: soundProxy.play() }
    property alias sound: soundProxy
    QtObject { id: soundProxy
        property string source: ""
        function play() { if (!soundLoader.active) { soundLoader.active = true; return } if (soundLoader.item) { soundLoader.item.source = source; soundLoader.item.play() } } }
    Timer { id: beat; interval: pop.calling ? 2600 : 1800; repeat: true; onTriggered: pop.ring() }
    Timer { id: giveUp; onTriggered: pop.close() }
    background: Rectangle { color: Qt.rgba(0, 0, 0, 0.78) }
    contentItem: Item {
        Column {
            id: card; anchors.centerIn: parent; spacing: 18; width: Math.min(360, parent.width - 48)
            SequentialAnimation on rotation { id: shake; running: false; loops: pop.calling ? Animation.Infinite : 6
                NumberAnimation { to: 3; duration: 70 } NumberAnimation { to: -3; duration: 70 } NumberAnimation { to: 0; duration: 70 } PauseAnimation { duration: pop.calling ? 500 : 60 } }
            Image { visible: pop.kind === "image" && pop.picture.length > 0; anchors.horizontalCenter: parent.horizontalCenter; width: Math.min(parent.width, 360); height: 300; source: pop.picture.length ? "file://" + pop.picture : ""; fillMode: Image.PreserveAspectFit; asynchronous: true }
            Rectangle { visible: !(pop.kind === "image" && pop.picture.length > 0); anchors.horizontalCenter: parent.horizontalCenter; width: 96; height: 96; radius: 48; color: look.accent
                Icon { anchors.centerIn: parent; name: pop.calling ? "phone" : "bell"; size: 44; color: look.accentInk } }
            Label { width: parent.width; horizontalAlignment: Text.AlignHCenter; text: pop.sender; color: "white"; font.pixelSize: 26; font.weight: Font.Bold; elide: Text.ElideRight }
            Label { width: parent.width; horizontalAlignment: Text.AlignHCenter; wrapMode: Text.Wrap; color: "#ccffffff"; font.pixelSize: 15
                text: (pop.kind === "video" ? "Video-ringing you" : pop.kind === "ring" ? "Ringing you" : pop.kind === "image" ? "Wants you to look at this" : "Wants your attention") + (pop.chat !== pop.sender ? " in " + pop.chat : "") }
            Row { anchors.horizontalCenter: parent.horizontalCenter; spacing: 14
                Button { text: pop.calling ? "Answer" : "Open chat"; highlighted: true; onClicked: { pop.close(); pop.openChat(pop.roomId) } }
                Button { text: "Dismiss"; onClicked: pop.close() } }
        }
    }
}
