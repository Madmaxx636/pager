import QtQuick
import QtQuick.Controls
import QtQuick.Dialogs
import QtQuick.Layouts

// Pick how to get their attention. Only Pager apps ring or shake; other apps just show the words.
Dialog {
    id: dlg
    modal: true; anchors.centerIn: Overlay.overlay; width: Math.min(420, Overlay.overlay ? Overlay.overlay.width - 32 : 420); title: "Get their attention"
    standardButtons: Dialog.Close
    FileDialog { id: picPick; title: "Pick a picture to fill their screen"; nameFilters: ["Pictures (*.png *.jpg *.jpeg *.gif *.webp)"]
        onAccepted: { const p = files.path(selectedFile); if (p.length) { const sz = files.imageSize(p); core.sendMedia(p, files.mime(p), sz.width, sz.height, "\uD83D\uDD14 Look at this!", { "app.pager.attention": { kind: "image" } }) } } }
    ColumnLayout { width: parent.width; spacing: 8
        Repeater { model: [["nudge", "Nudge", "A loud alert that shakes their screen"], ["ring", "Ring", "Rings like a phone call until they answer"], ["video", "Video ring", "Rings like a video call; opens the chat when answered"], ["image", "Full-screen picture", "Fills their screen with a picture you pick"]]
            delegate: Rectangle { Layout.fillWidth: true; height: 58; radius: 12; color: ah.hovered ? Qt.rgba(look.accent.r, look.accent.g, look.accent.b, 0.18) : look.panel2
                HoverHandler { id: ah; cursorShape: Qt.PointingHandCursor }
                Column { x: 14; anchors.verticalCenter: parent.verticalCenter; spacing: 1
                    Label { text: modelData[1]; color: look.text; font.weight: Font.DemiBold }
                    Label { text: modelData[2]; color: look.muted; font.pixelSize: Math.round(12 * look.textScale) } }
                TapHandler { onTapped: { if (modelData[0] === "image") { dlg.close(); picPick.open() } else { core.sendAttention(modelData[0]); dlg.close() } } } } }
        Label { Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.muted; font.pixelSize: Math.round(12 * look.textScale)
            text: "Rings and nudges only alert people using Pager; on other apps they just see a short message. This is an alert, not a real voice or video call." } }
}
