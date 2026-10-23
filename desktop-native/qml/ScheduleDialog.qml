import QtQuick
import QtQuick.Controls

// Send the text you wrote later: pick when, and the server sends it even if Pager is closed.
Item {
    id: root
    property string text: ""
    property string room: ""
    signal scheduled()
    property string error: ""
    function openFor(roomId, body) { room = roomId; text = body; error = ""; when.open() }
    WhenDialog { id: when; heading: "Send later"; onPicked: (ms) => core.scheduleSend(root.room, root.text, ms - Date.now(), function (err) { if (err.length) { root.error = err; failed.open() } else root.scheduled() }) }
    Dialog { id: failed; modal: true; anchors.centerIn: Overlay.overlay; width: Math.min(380, Overlay.overlay ? Overlay.overlay.width - 32 : 380); title: "Couldn't schedule"; standardButtons: Dialog.Ok
        Label { text: root.error; width: parent.width; wrapMode: Text.Wrap; color: look.text } }
}
