import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Rectangle {
    id: page
    color: look.bg
    function go() { if (!core.working) core.login(hs.text, user.text, pw.text) }

    component Field: TextField {
        id: f
        Layout.fillWidth: true
        color: look.text; placeholderTextColor: look.muted; font.pixelSize: Math.round(15 * look.textScale)
        leftPadding: 14; rightPadding: 14; topPadding: 12; bottomPadding: 12
        background: Rectangle { radius: 12; color: look.panel2; border.width: f.activeFocus ? 2 : 0; border.color: look.accent }
        Keys.onReturnPressed: page.go()
    }

    ColumnLayout {
        anchors.centerIn: parent
        width: Math.min(parent.width - 48, 380)
        spacing: 12
        Label { text: "Pager"; font.pixelSize: Math.round(34 * look.textScale); font.weight: Font.Bold; color: look.text; Layout.alignment: Qt.AlignHCenter }
        Label { text: "Sign in to your server"; color: look.muted; Layout.alignment: Qt.AlignHCenter; Layout.bottomMargin: 12 }
        Field { id: hs; placeholderText: "Server (for example chat.example.com)"; Component.onCompleted: forceActiveFocus() }
        Field { id: user; placeholderText: "Username" }
        Field { id: pw; placeholderText: "Password"; echoMode: TextInput.Password }
        Label { visible: core.error.length > 0; text: core.error; color: look.danger; wrapMode: Text.Wrap; Layout.fillWidth: true }
        Button {
            id: signIn
            Layout.fillWidth: true; Layout.topMargin: 6
            enabled: !core.working
            text: core.working ? "Signing in…" : "Sign in"
            contentItem: Label { text: signIn.text; color: look.accentInk; horizontalAlignment: Text.AlignHCenter; font.pixelSize: Math.round(15 * look.textScale); font.weight: Font.DemiBold }
            background: Rectangle { radius: 12; color: signIn.enabled ? look.accent : look.muted; implicitHeight: 46 }
            onClicked: page.go()
        }
    }
}
