import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "Networks.js" as N

// Connect and disconnect your chat accounts (WhatsApp, Signal, ...). The sign-in itself happens on the Pager server's bridges.
Dialog {
    id: dlg
    modal: true; anchors.centerIn: Overlay.overlay
    width: Math.min(520, Overlay.overlay ? Overlay.overlay.width - 24 : 520)
    height: Math.min(640, Overlay.overlay ? Overlay.overlay.height - 24 : 640)
    padding: 0
    background: Rectangle { color: look.panel; radius: 14; border.color: look.line }

    property var networks: []
    property bool loading: false
    property string error: ""
    // the sign-in in progress, if any
    property string net: ""; property var flows: null; property var step: null; property string flowError: ""; property bool busy: false
    property var fields: ({}); property string pasted: ""
    property int generation: 0        // bumps when a sign-in is abandoned, so late answers are ignored

    onOpened: { cancelFlow(); load() }
    onClosed: cancelFlow()

    function load() {
        loading = true; error = ""
        core.api("GET", "/api/bridges", null, function (status, body) {
            loading = false
            if (status === 200) { networks = (body.networks || []).map(n => { n.logins = (n.logins || []).map(l => { l.__net = n.id; return l }); return n }) } else error = (body && body.error) || "Couldn't reach the server"
        })
    }
    function cancelFlow() { generation++; net = ""; flows = null; step = null; flowError = ""; busy = false; fields = ({}); pasted = "" }
    function begin(id) {
        cancelFlow(); const g = generation; net = id; busy = true
        core.api("GET", "/api/bridges/" + id + "/login/flows", null, function (status, body) {
            if (g !== generation) return
            busy = false
            if (status !== 200) { flowError = (body && body.error) || "Couldn't start"; return }
            if (body.flows.length === 1) start(body.flows[0].id); else flows = body.flows
        })
    }
    function start(flowId) {
        const g = generation; busy = true; flowError = ""
        core.api("POST", "/api/bridges/" + net + "/login/start/" + flowId, {}, function (status, body) { if (g === generation) answered(status, body) })
    }
    function send(body) {
        const g = generation, s = step; busy = true; flowError = ""
        core.api("POST", "/api/bridges/" + net + "/login/step/" + s.login_id + "/" + s.step_id + "/" + s.type, body || {}, function (status, b) { if (g === generation) answered(status, b) })
    }
    function answered(status, body) {
        busy = false
        if (status !== 200) { flowError = (body && body.error) || "That didn't work"; return }
        fields = ({}); pasted = ""; step = body
        if (body.type === "complete") doneTimer.start()
        else if (body.type === "display_and_wait") send({})       // waits on the server until you act on your phone
    }
    Timer { id: doneTimer; interval: 900; onTriggered: { dlg.cancelFlow(); dlg.load() } }
    function missingCookies() {
        const need = ((step && step.cookies && step.cookies.fields) || []).filter(f => f.required).map(f => f.id)
        const have = N.parseCookies(pasted); return need.filter(id => !have[id])
    }

    header: Rectangle {
        color: "transparent"; implicitHeight: 56
        ToolButton { visible: dlg.net.length > 0; x: 6; anchors.verticalCenter: parent.verticalCenter; text: "←"; onClicked: dlg.cancelFlow() }
        Label { x: dlg.net.length ? 52 : 20; anchors.verticalCenter: parent.verticalCenter; text: dlg.net.length ? "Connect " + N.meta(dlg.net).label : "Chat accounts"; color: look.text; font.pixelSize: Math.round(20 * look.textScale); font.weight: Font.Bold }
        IconButton { anchors.right: parent.right; anchors.rightMargin: 8; anchors.verticalCenter: parent.verticalCenter; symbol: "✕"; glyphSize: 16; onClicked: dlg.close() }
        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: look.line }
    }

    contentItem: Item {
        // ---- the list
        ScrollView {
            anchors.fill: parent; visible: dlg.net.length === 0; clip: true; contentWidth: availableWidth
            ColumnLayout {
                width: parent.width - 40; x: 20; spacing: 10
                Item { height: 6 }
                Label { visible: dlg.loading; text: "Loading…"; color: look.muted }
                Label { visible: dlg.error.length > 0; Layout.fillWidth: true; text: dlg.error; color: look.danger; wrapMode: Text.Wrap }
                Repeater {
                    model: dlg.networks
                    delegate: Rectangle {
                        Layout.fillWidth: true; radius: 12; color: look.panel2; implicitHeight: card.implicitHeight + 24
                        ColumnLayout {
                            id: card; x: 14; y: 12; width: parent.width - 28; spacing: 8
                            RowLayout { Layout.fillWidth: true; spacing: 10
                                Rectangle { width: 34; height: 34; radius: 17; color: N.meta(modelData.id).color; Label { anchors.centerIn: parent; text: N.meta(modelData.id).glyph; color: "white"; font.weight: Font.Bold } }
                                Label { Layout.fillWidth: true; text: N.meta(modelData.id).label; color: look.text; font.pixelSize: Math.round(16 * look.textScale); font.weight: Font.DemiBold }
                                Button { text: modelData.logins.length ? "Add another" : "Connect"; onClicked: dlg.begin(modelData.id) }
                            }
                            Label { visible: !!modelData.error; Layout.fillWidth: true; text: modelData.error || ""; color: look.muted; wrapMode: Text.Wrap; font.pixelSize: Math.round(12 * look.textScale) }
                            Repeater {
                                model: modelData.logins
                                delegate: RowLayout { Layout.fillWidth: true
                                    Rectangle { width: 9; height: 9; radius: 5; color: N.stateLabel(modelData.state_event)[1] }
                                    Label { Layout.fillWidth: true; text: (modelData.name || (modelData.profile && modelData.profile.name) || modelData.id) + " · " + N.stateLabel(modelData.state_event)[0]; color: look.text; elide: Text.ElideRight; font.pixelSize: Math.round(13 * look.textScale) }
                                    Label { text: "Sign out"; color: look.danger; font.pixelSize: Math.round(13 * look.textScale)
                                        TapHandler { onTapped: { confirm.netId = modelData.__net; confirm.loginId = modelData.id; confirm.open() } } }
                                }
                            }
                        }
                    }
                }
                Item { height: 12 }
            }
        }
        // ---- a sign-in in progress
        ScrollView {
            anchors.fill: parent; visible: dlg.net.length > 0; clip: true; contentWidth: availableWidth
            ColumnLayout {
                width: parent.width - 40; x: 20; spacing: 12
                Item { height: 6 }
                Label { Layout.fillWidth: true; visible: dlg.flowError.length > 0; text: dlg.flowError; color: look.danger; wrapMode: Text.Wrap }
                Label { visible: dlg.busy && !dlg.step; text: "Starting…"; color: look.muted }
                // choose how to sign in
                Label { visible: !!dlg.flows && !dlg.step; text: "How would you like to sign in?"; color: look.muted }
                Repeater {
                    model: dlg.step ? [] : (dlg.flows || [])
                    delegate: Button { Layout.fillWidth: true; text: modelData.name + (modelData.description ? "  ·  " + modelData.description : ""); onClicked: dlg.start(modelData.id) }
                }
                // steps
                Label { Layout.fillWidth: true; visible: !!dlg.step && !!dlg.step.instructions; text: dlg.step && dlg.step.instructions ? dlg.step.instructions : ""; wrapMode: Text.Wrap; color: look.text; font.pixelSize: Math.round(14 * look.textScale) }
                QrView { visible: !!dlg.step && dlg.step.type === "display_and_wait" && dlg.step.display_and_wait.type === "qr"; Layout.alignment: Qt.AlignHCenter; payload: visible ? dlg.step.display_and_wait.data : "" }
                Label {
                    visible: !!dlg.step && dlg.step.type === "display_and_wait" && (dlg.step.display_and_wait.type === "code" || dlg.step.display_and_wait.type === "emoji")
                    Layout.alignment: Qt.AlignHCenter; text: visible ? dlg.step.display_and_wait.data : ""; color: look.text; font.pixelSize: 28; font.letterSpacing: 3
                }
                Label { visible: !!dlg.step && dlg.step.type === "display_and_wait"; Layout.alignment: Qt.AlignHCenter; text: "Waiting for you…"; color: look.muted }
                Repeater {
                    model: dlg.step && dlg.step.type === "user_input" ? dlg.step.user_input.fields : []
                    delegate: ColumnLayout { Layout.fillWidth: true; spacing: 4
                        Label { text: modelData.name; color: look.muted; font.pixelSize: Math.round(12 * look.textScale) }
                        TextField { Layout.fillWidth: true; placeholderText: modelData.description || ""; echoMode: modelData.type === "password" || modelData.type === "2fa_code" ? TextInput.Password : TextInput.Normal
                            color: look.text; placeholderTextColor: look.muted; background: Rectangle { color: look.bg; radius: 8; border.color: look.line }
                            onTextEdited: { const f = dlg.fields; f[modelData.id] = text; dlg.fields = f } }
                    }
                }
                Button { visible: !!dlg.step && dlg.step.type === "user_input"; text: dlg.busy ? "Checking…" : "Continue"; enabled: !dlg.busy; onClicked: dlg.send(dlg.fields) }
                // cookies: sign in with your own browser, paste what it sent
                ColumnLayout {
                    visible: !!dlg.step && dlg.step.type === "cookies"; Layout.fillWidth: true; spacing: 8
                    Label { Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.text; text: "This network needs you to sign in with your normal browser, then copy your sign-in details here:" }
                    Button { text: "Open the sign-in page"; onClicked: files.openUrl(dlg.step.cookies.url) }
                    Label { Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.muted; font.pixelSize: Math.round(13 * look.textScale)
                        text: "1. Sign in until you see your messages.\n2. Press F12, open the Network tab, then press F5.\n3. Right-click the first request → Copy → Copy as cURL.\n4. Paste it below." }
                    TextArea { id: paste; Layout.fillWidth: true; Layout.preferredHeight: 110; wrapMode: TextArea.Wrap; placeholderText: "Paste a cURL command, a Cookie header, or a JSON object"; color: look.text; placeholderTextColor: look.muted
                        background: Rectangle { color: look.bg; radius: 8; border.color: look.line }
                        onTextChanged: dlg.pasted = text }
                    Label { visible: dlg.pasted.length > 0 && dlg.missingCookies().length > 0; text: "Still missing: " + dlg.missingCookies().join(", "); color: look.muted }
                    Button { text: dlg.busy ? "Connecting…" : "Connect"; enabled: !dlg.busy && dlg.pasted.length > 0 && dlg.missingCookies().length === 0; onClicked: dlg.send(N.parseCookies(dlg.pasted)) }
                }
                Label { visible: !!dlg.step && dlg.step.type === "complete"; text: "✓ Connected"; color: look.accent; font.pixelSize: Math.round(18 * look.textScale); font.weight: Font.Bold; Layout.alignment: Qt.AlignHCenter }
                Item { height: 12 }
            }
        }
    }

    Dialog {
        id: confirm
        property string netId; property string loginId
        modal: true; anchors.centerIn: Overlay.overlay; title: "Sign out of this account?"; standardButtons: Dialog.Cancel | Dialog.Ok
        background: Rectangle { color: look.panel; radius: 12; border.color: look.line }
        Label { text: "Pager stops bringing in its chats until you connect it again."; color: look.text; wrapMode: Text.Wrap; width: 320 }
        onAccepted: core.api("POST", "/api/bridges/" + netId + "/logout/" + encodeURIComponent(loginId), {}, function () { dlg.load() })
    }
}
