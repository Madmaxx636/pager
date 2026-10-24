import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// The pager's first-start tour: a few speech bubbles, shown once per account (the account remembers, so a second computer does not repeat it).
Popup {
    id: tour
    signal go(string page)
    property int i: 0
    property real typed: 0
    parent: Overlay.overlay; x: 0; y: 0; width: parent ? parent.width : 400; height: parent ? parent.height : 300
    modal: true; padding: 0; closePolicy: Popup.CloseOnEscape
    readonly property var steps: {
        const out = [
            { text: "Hi! I'm Pager. I'll show you around. It takes about a minute!" },
            { text: "Every chat from every app lands here as a Page. One inbox for everything. Beep!" },
            { text: "First, let's plug in an app. WhatsApp, Signal, Messenger, Google Messages and more are ready to go.", label: "Connect an app", page: "bridges" },
            core.encryption.backup_here
                ? { text: "Your messages are locked so only your own devices can read them. Keep your recovery key safe. It's the only way back in on a new phone!" }
                : { text: "Your messages are locked so only your own devices can read them. Make a recovery key now, so a lost phone never means lost history!", label: "Make my key", page: "privacy" }]
        if (core.isAdmin) out.push({ text: "You're the boss here! Invite your family and friends from Admin. Share the invite code, never your password.", label: "Open Admin", page: "admin" })
        out.push({ text: "Make me yours! Pick colours, bubbles and a wallpaper. Beep!", label: "Make it yours", page: "appearance" })
        out.push({ text: "Take me with you! On your phone, open " + core.server.replace(/^https?:\/\//, "") + " to get the app." })
        out.push({ text: "That's everything! Click “Page someone” whenever you want to start a chat. I'll be right here!" })
        return out
    }
    readonly property var step: steps[Math.min(i, steps.length - 1)]
    readonly property bool last: i >= steps.length - 1
    readonly property string shown: step.text.slice(0, Math.floor(typed))
    function start() { i = 0; typed = 0; open() }
    onOpened: typer.restart()
    onIChanged: { typed = 0; typer.restart() }
    FrameAnimation { id: typer; running: false; onTriggered: { if (!tour.visible) { running = false; return } tour.typed = look.motion ? tour.typed + frameTime * 45 : 1e9; if (tour.typed >= tour.step.text.length) running = false } }
    function finish(page) {
        close()
        core.api("PUT", "/_matrix/client/v3/user/" + encodeURIComponent(core.user) + "/account_data/app.pager.tour", { done: true, at: Date.now() }, function () {})
        if (page) go(page)
    }
    background: Rectangle { color: Qt.rgba(0, 0, 0, 0.62) }
    contentItem: Item {
        Column {
            anchors.centerIn: parent; spacing: 18; width: Math.min(420, parent.width - 40)
            Rectangle {   // the speech bubble
                width: parent.width; implicitHeight: words.implicitHeight + 36; height: implicitHeight; radius: 18; color: look.panel; border.width: 2; border.color: look.line
                Text { id: words; x: 18; y: 18; width: parent.width - 36; text: tour.shown; wrapMode: Text.Wrap; color: look.text; font.pixelSize: 17; font.weight: Font.Medium }
                Text { visible: false; id: ghost; width: words.width; text: tour.step.text; wrapMode: Text.Wrap; font.pixelSize: 17 }
                Rectangle { width: 18; height: 18; rotation: 45; color: look.panel; border.width: 2; border.color: look.line; x: parent.width / 2 - 9; y: parent.height - 10; z: -1 }
            }
            Image { anchors.horizontalCenter: parent.horizontalCenter; source: "qrc:/pager.svg"; sourceSize.width: 340; sourceSize.height: 340; width: 160; height: 160; smooth: true }
            Row { anchors.horizontalCenter: parent.horizontalCenter; spacing: 8
                Button { visible: tour.step.label !== undefined; text: tour.step.label || ""; highlighted: true; onClicked: tour.finish(tour.step.page) }
                Button { visible: tour.i > 0; text: "Back"; flat: true; onClicked: tour.i-- }
                Button { text: tour.last ? "Done" : "Next"; highlighted: tour.step.label === undefined; onClicked: { if (tour.typed < tour.step.text.length) tour.typed = 1e9; else if (tour.last) tour.finish(); else tour.i++ } }
                Button { visible: !tour.last; text: "Skip"; flat: true; onClicked: tour.finish() } }
            Row { anchors.horizontalCenter: parent.horizontalCenter; spacing: 6
                Repeater { model: tour.steps.length; delegate: Rectangle { width: 8; height: 8; radius: 4; color: index === tour.i ? look.accent : Qt.rgba(1, 1, 1, 0.35) } } }
        }
    }
}
