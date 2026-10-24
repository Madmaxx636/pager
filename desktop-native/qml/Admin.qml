import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "Networks.js" as N

// Server administration: people, bridges, signups. Only shown to admins; the server checks that again on every call.
Dialog {
    id: dlg
    modal: true; anchors.centerIn: Overlay.overlay
    width: Math.min(620, Overlay.overlay ? Overlay.overlay.width - 24 : 620)
    height: Math.min(700, Overlay.overlay ? Overlay.overlay.height - 24 : 700)
    padding: 0


    property int tab: 0
    property string error: ""
    property string notice: ""
    property var people: null
    property var bridges: null
    property var control: ({ "docker": false, "settings": false })
    property var schedules: ({})
    property bool canSave: false
    property var server: null
    property string openUser: ""
    property var info: null
    property string busyBridge: ""

    readonly property var utcToLocal: function (hhmm) { const p = (hhmm || "04:00").split(":"); const d = new Date(); d.setUTCHours(+p[0], +p[1], 0, 0); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2) }
    readonly property var localToUtc: function (hhmm) { const p = hhmm.split(":"); const d = new Date(); d.setHours(+p[0], +p[1], 0, 0); return ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2) }
    function nameOf(u) { return u.displayname || u.id.replace(/^@/, "").split(":")[0] }
    function fail(status, body) { error = (body && body.error) || ("Request failed (" + status + ")") }

    function call(method, path, body, done, keepNotice) {
        error = ""; if (!keepNotice) notice = ""
        core.api(method, path, body, function (status, b) { if (status >= 200 && status < 300) { if (done) done(b) } else dlg.fail(status, b) })
    }
    function loadPeople() { call("GET", "/api/admin/overview", null, function (b) { people = b.users }, true) }
    function loadBridges() {
        call("GET", "/api/admin/bridges", null, function (b) { bridges = b.bridges })
        core.api("GET", "/api/admin/control", null, function (s, b) { if (s === 200) control = b })
        core.api("GET", "/api/admin/schedules", null, function (s, b) { if (s === 200) { schedules = b.schedules || ({}); canSave = !!b.canSave } })
    }
    function loadServer() { call("GET", "/api/admin/server", null, function (b) { server = b }) }
    function loadInfo(id) { info = null; core.api("GET", "/api/admin/users/" + encodeURIComponent(id) + "/info", null, function (s, b) { if (s === 200) info = b }) }
    function toggleUser(id) { openUser = openUser === id ? "" : id; if (openUser) loadInfo(id) }
    function userAction(id, action, body, after) {
        call("POST", "/api/admin/users/" + encodeURIComponent(id) + "/" + action, body || {}, function (b) { if (after) after(b); loadPeople(); if (openUser === id) loadInfo(id) })
    }
    function bridgeAction(id, action) {
        busyBridge = id + action
        call("POST", "/api/admin/bridges/" + encodeURIComponent(id) + "/" + action, {}, function () { reloadTimer.start() })
        if (error) busyBridge = ""
    }
    Timer { id: reloadTimer; interval: 2500; onTriggered: { dlg.busyBridge = ""; dlg.loadBridges() } }
    function scheduleLabel(s) { return !s || s.every === "off" ? "Auto-restart: off" : s.every === "daily" ? "Auto-restart: daily " + utcToLocal(s.at) : "Auto-restart: every " + (s.every === "6h" ? "6" : "12") + " h" }

    onOpened: { tab = 0; error = ""; notice = ""; openUser = ""; loadPeople() }
    onTabChanged: { if (!visible) return; if (tab === 0 && !people) loadPeople(); else if (tab === 1) loadBridges(); else if (tab === 2) loadServer() }

    component Pill: Button { flat: false; font.pixelSize: Math.round(12 * look.textScale) }
    component Field: ColumnLayout { property alias label: l.text; spacing: 2; Label { id: l; color: look.muted; font.pixelSize: Math.round(12 * look.textScale) } }

    header: Rectangle {
        color: "transparent"; implicitHeight: 100
        Label { x: 20; y: 14; text: "Server admin"; color: look.text; font.pixelSize: Math.round(20 * look.textScale); font.weight: Font.Bold }
        IconButton { anchors.right: parent.right; anchors.rightMargin: 8; y: 8; symbol: "✕"; glyphSize: 16; onClicked: dlg.close() }
        Row {
            x: 16; y: 54; spacing: 6
            Repeater {
                model: ["Accounts" + (dlg.people ? " (" + dlg.people.length + ")" : ""), "Bridges", "Server"]
                delegate: Rectangle {
                    width: tl.implicitWidth + 28; height: 34; radius: 17; color: dlg.tab === index ? look.accent : look.panel2
                    Label { id: tl; anchors.centerIn: parent; text: modelData; color: dlg.tab === index ? look.accentInk : look.text; font.pixelSize: Math.round(13 * look.textScale) }
                    TapHandler { onTapped: dlg.tab = index }
                }
            }
        }
        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: look.line }
    }

    contentItem: ColumnLayout {
        spacing: 0
        Label { visible: dlg.error.length > 0; Layout.fillWidth: true; Layout.margins: 12; text: dlg.error; color: look.danger; wrapMode: Text.Wrap }
        Label { visible: dlg.notice.length > 0; Layout.fillWidth: true; Layout.margins: 12; text: dlg.notice; color: look.accent; wrapMode: Text.Wrap }
        StackLayout {
            Layout.fillWidth: true; Layout.fillHeight: true; currentIndex: dlg.tab

            // ---------------- accounts
            ScrollView { SmoothWheel { view: parent.contentItem as Flickable }
                clip: true; contentWidth: availableWidth
                ColumnLayout {
                    width: parent.width - 32; x: 16; spacing: 8
                    Item { height: 6 }
                    Label { visible: !dlg.people; text: "Loading accounts…"; color: look.muted }
                    Repeater {
                        model: dlg.people || []
                        delegate: Rectangle {
                            id: person
                            readonly property var u: modelData
                            readonly property bool open: dlg.openUser === u.id
                            Layout.fillWidth: true; radius: 12; color: look.panel2; opacity: u.deactivated ? 0.55 : 1
                            implicitHeight: pcol.implicitHeight + 20
                            ColumnLayout {
                                id: pcol; x: 12; y: 10; width: parent.width - 24; spacing: 8
                                RowLayout { Layout.fillWidth: true; spacing: 10
                                    Avatar { letter: dlg.nameOf(person.u)[0].toUpperCase(); seed: person.u.id; size: 36 }
                                    ColumnLayout { Layout.fillWidth: true; spacing: 0
                                        Label { text: dlg.nameOf(person.u); color: look.text; font.weight: Font.DemiBold; font.pixelSize: Math.round(14 * look.textScale) }
                                        Label { text: person.u.id; color: look.muted; font.pixelSize: Math.round(11 * look.textScale) } }
                                    Label { visible: person.u.admin; text: "Admin"; color: look.accent; font.pixelSize: Math.round(11 * look.textScale); font.weight: Font.Bold }
                                    Label { visible: person.u.you; text: "You"; color: look.muted; font.pixelSize: Math.round(11 * look.textScale) }
                                    Label { visible: person.u.deactivated; text: "Deleted"; color: look.danger; font.pixelSize: Math.round(11 * look.textScale) }
                                    Label { text: person.u.networks.reduce(function (n, x) { return n + x.logins.length }, 0) + " bridges"; color: look.muted; font.pixelSize: Math.round(11 * look.textScale) }
                                    TapHandler { onTapped: dlg.toggleUser(person.u.id) }
                                }
                                ColumnLayout {
                                    visible: person.open; Layout.fillWidth: true; spacing: 6
                                    Label { Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.muted; font.pixelSize: Math.round(12 * look.textScale)
                                        text: "Status: " + (person.u.deactivated ? "Deleted" : (dlg.info && dlg.info.locked ? "Locked (can't sign in)" : "Active")) + "\nSigned in on: " + (dlg.info ? (dlg.info.devices.length ? dlg.info.devices.map(function (d) { return d.name || d.id }).join(", ") : "no devices") : "…") }
                                    Repeater {
                                        model: person.u.networks
                                        delegate: ColumnLayout { Layout.fillWidth: true; spacing: 4
                                            readonly property var net: modelData
                                            Repeater {
                                                model: net.logins
                                                delegate: RowLayout { Layout.fillWidth: true
                                                    Rectangle { width: 9; height: 9; radius: 5; color: N.stateLabel(modelData.state_event)[1] }
                                                    Label { Layout.fillWidth: true; elide: Text.ElideRight; color: look.text; font.pixelSize: Math.round(12 * look.textScale)
                                                        text: net.name + " · " + (modelData.name || (modelData.profile && modelData.profile.name) || modelData.id) + " · " + N.stateLabel(modelData.state_event)[0] }
                                                    Label { text: "Disconnect"; color: look.danger; font.pixelSize: Math.round(12 * look.textScale)
                                                        TapHandler { onTapped: { confirm.ask("Disconnect " + net.name + " for " + dlg.nameOf(person.u) + "?", function () { dlg.call("POST", "/api/admin/users/" + encodeURIComponent(person.u.id) + "/logout/" + encodeURIComponent(net.id) + "/" + encodeURIComponent(modelData.id), {}, function () { dlg.loadPeople() }) }) } } }
                                                }
                                            }
                                        }
                                    }
                                    Flow {
                                        visible: !person.u.deactivated; Layout.fillWidth: true; spacing: 6
                                        Pill { text: "Rename"; onClicked: prompt.ask("New name", dlg.nameOf(person.u), false, 1, function (v) { dlg.userAction(person.u.id, "rename", { displayname: v }) }) }
                                        Pill { text: "Reset password"; onClicked: prompt.ask("New password (8+ characters)", "", true, 8, function (v) { dlg.userAction(person.u.id, "password", { password: v }) }) }
                                        Pill { visible: !person.u.you; text: person.u.admin ? "Remove admin" : "Make admin"; onClicked: dlg.userAction(person.u.id, "admin", { admin: !person.u.admin }) }
                                        Pill { visible: !person.u.you; text: dlg.info && dlg.info.locked ? "Unlock" : "Lock account"; onClicked: dlg.userAction(person.u.id, "lock", { locked: !(dlg.info && dlg.info.locked) }) }
                                        Pill { text: "Sign out everywhere"; onClicked: confirm.ask("Sign " + dlg.nameOf(person.u) + " out of every device?", function () { dlg.userAction(person.u.id, "logout-all", {}, function (b) { dlg.notice = "Signed out of " + b.signedOut + " device(s)." }) }) }
                                        Pill { visible: !person.u.you; text: "Delete account"; onClicked: confirm.ask("Delete " + dlg.nameOf(person.u) + "? This removes their account, disconnects their bridges and can't be undone.", function () { dlg.userAction(person.u.id, "delete", {}) }) }
                                    }
                                }
                            }
                        }
                    }
                    Item { height: 12 }
                }
            }

            // ---------------- bridges
            ScrollView { SmoothWheel { view: parent.contentItem as Flickable }
                clip: true; contentWidth: availableWidth
                ColumnLayout {
                    width: parent.width - 32; x: 16; spacing: 8
                    Item { height: 6 }
                    Label { visible: !dlg.control.docker; Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.muted; font.pixelSize: Math.round(12 * look.textScale)
                        text: "Restart, stop and settings are switched off. To turn them on, run this once on the server: cd ~/pager/server && ./scripts/enable-admin-control.sh" }
                    Label { visible: !dlg.bridges; text: "Checking bridges…"; color: look.muted }
                    Repeater {
                        model: dlg.bridges || []
                        delegate: Rectangle {
                            id: bcard
                            readonly property var b: modelData
                            readonly property bool running: b.container ? b.container.state === "running" : b.up
                            Layout.fillWidth: true; radius: 12; color: look.panel2; implicitHeight: bcol.implicitHeight + 20
                            ColumnLayout {
                                id: bcol; x: 12; y: 10; width: parent.width - 24; spacing: 8
                                RowLayout { Layout.fillWidth: true; spacing: 10
                                    Rectangle { width: 34; height: 34; radius: 17; color: N.meta(bcard.b.id).color; Label { anchors.centerIn: parent; text: N.meta(bcard.b.id).glyph; color: "white"; font.weight: Font.Bold } }
                                    ColumnLayout { Layout.fillWidth: true; spacing: 0
                                        Label { text: bcard.b.name; color: look.text; font.weight: Font.DemiBold; font.pixelSize: Math.round(14 * look.textScale) }
                                        Label { text: bcard.b.container ? bcard.b.container.status : (bcard.running ? "Running" : "Not responding"); color: look.muted; font.pixelSize: Math.round(11 * look.textScale) } }
                                    Label { text: bcard.running && bcard.b.up ? "Running" : (bcard.running ? "Starting" : "Stopped"); color: bcard.running && bcard.b.up ? look.accent : look.danger; font.pixelSize: Math.round(12 * look.textScale); font.weight: Font.Bold }
                                }
                                Flow { Layout.fillWidth: true; spacing: 6
                                    Pill { text: dlg.busyBridge === bcard.b.id + "restart" ? "Restarting…" : "Restart"; enabled: dlg.control.docker && dlg.busyBridge === ""; onClicked: dlg.bridgeAction(bcard.b.id, "restart") }
                                    Pill { visible: bcard.running; text: "Stop"; enabled: dlg.control.docker && dlg.busyBridge === ""; onClicked: confirm.ask("Stop " + bcard.b.name + "? Everyone's " + bcard.b.name + " accounts go offline until it starts again.", function () { dlg.bridgeAction(bcard.b.id, "stop") }) }
                                    Pill { visible: !bcard.running; text: "Start"; enabled: dlg.control.docker && dlg.busyBridge === ""; onClicked: dlg.bridgeAction(bcard.b.id, "start") }
                                    Pill { text: "Log"; enabled: dlg.control.docker; onClicked: { logView.bridge = bcard.b; logView.open() } }
                                    Pill { text: "Settings"; enabled: dlg.control.settings; onClicked: { bridgeSettings.bridge = bcard.b; bridgeSettings.open() } }
                                    Pill { text: dlg.scheduleLabel(dlg.schedules[bcard.b.id]); enabled: dlg.control.docker && dlg.canSave; onClicked: { schedule.bridge = bcard.b; schedule.open() } }
                                }
                            }
                        }
                    }
                    Item { height: 12 }
                }
            }

            // ---------------- server
            ScrollView { SmoothWheel { view: parent.contentItem as Flickable }
                clip: true; contentWidth: availableWidth
                ColumnLayout {
                    width: parent.width - 32; x: 16; spacing: 10
                    Item { height: 6 }
                    Label { visible: !dlg.server; text: "Loading…"; color: look.muted }
                    ColumnLayout {
                        visible: !!dlg.server; Layout.fillWidth: true; spacing: 10
                        Field { label: "Address"; Label { text: dlg.server ? dlg.server.domain : ""; color: look.text } }
                        Field { label: "Who can sign up"
                            Flow { Layout.fillWidth: true; spacing: 6
                                Repeater {
                                    model: [["invite", "Anyone with the invite code"], ["open", "Anyone"], ["closed", "No one"]]
                                    delegate: Rectangle { width: sl.implicitWidth + 24; height: 32; radius: 16; color: dlg.server && dlg.server.signup === modelData[0] ? look.accent : look.panel2
                                        Label { id: sl; anchors.centerIn: parent; text: modelData[1]; color: dlg.server && dlg.server.signup === modelData[0] ? look.accentInk : look.text; font.pixelSize: Math.round(13 * look.textScale) }
                                        TapHandler { onTapped: dlg.call("POST", "/api/admin/server", { signup: modelData[0] }, function (b) { dlg.server = b }) } }
                                } } }
                        Field { label: "Invite code"
                            RowLayout { Layout.fillWidth: true
                                Label { Layout.fillWidth: true; text: dlg.server && dlg.server.inviteCode ? dlg.server.inviteCode : "none"; color: look.text; font.family: "monospace" }
                                Pill { text: "Copy"; onClicked: { files.copy(dlg.server.inviteCode); dlg.notice = "Copied" } }
                                Pill { text: "New code"; onClicked: confirm.ask("Make a new invite code? The old one stops working.", function () { dlg.call("POST", "/api/admin/server", { regenerateInvite: true }, function (b) { dlg.server = b }) }) } } }
                    }
                    Item { height: 12 }
                }
            }
        }
    }

    // ---- small dialogs
    Dialog {
        id: confirm
        property var then_; property string text_
        function ask(text, fn) { text_ = text; then_ = fn; open() }
        modal: true; anchors.centerIn: Overlay.overlay; title: "Are you sure?"; standardButtons: Dialog.Cancel | Dialog.Ok

        Label { text: confirm.text_; color: look.text; wrapMode: Text.Wrap; width: 340 }
        onAccepted: if (then_) then_()
    }
    Dialog {
        id: prompt
        property var then_; property string label_; property bool secret_; property int min_: 1
        function ask(label, initial, secret, min, fn) { label_ = label; secret_ = secret; min_ = min; then_ = fn; field.text = initial; open() }
        modal: true; anchors.centerIn: Overlay.overlay; title: label_; standardButtons: Dialog.Cancel | Dialog.Ok

        TextField { id: field; width: 340; echoMode: prompt.secret_ ? TextInput.Password : TextInput.Normal; color: look.text; background: Rectangle { color: look.bg; radius: 8; border.color: look.line } }
        onOpened: field.forceActiveFocus()
        onAccepted: if (field.text.length >= min_ && then_) then_(field.text)
    }
    Dialog {
        id: logView
        property var bridge; property string text_: "Loading…"
        modal: true; anchors.centerIn: Overlay.overlay; width: Math.min(640, dlg.width - 24); height: Math.min(520, dlg.height - 40); title: (bridge ? bridge.name : "") + " log"

        function refresh() { text_ = "Loading…"; core.api("GET", "/api/admin/bridges/" + encodeURIComponent(bridge.id) + "/logs?tail=300", null, function (s, b) { text_ = s === 200 ? (b.log || "(empty)") : ((b && b.error) || "Couldn't load") }) }
        onAboutToShow: refresh()
        contentItem: ScrollView { SmoothWheel { view: parent.contentItem as Flickable } clip: true; TextArea { readOnly: true; text: logView.text_; wrapMode: TextArea.NoWrap; font.family: "monospace"; font.pixelSize: Math.round(11 * look.textScale); color: look.text; background: Rectangle { color: look.bg } } }
        footer: DialogButtonBox { Button { text: "Refresh"; DialogButtonBox.buttonRole: DialogButtonBox.ActionRole; onClicked: logView.refresh() } Button { text: "Close"; DialogButtonBox.buttonRole: DialogButtonBox.RejectRole } }
    }
    Dialog {
        id: bridgeSettings
        property var bridge; property var rows: null; property var vals: ({})
        modal: true; anchors.centerIn: Overlay.overlay; width: Math.min(480, dlg.width - 24); title: (bridge ? bridge.name : "") + " settings"

        onAboutToShow: { rows = null; vals = ({}); core.api("GET", "/api/admin/bridges/" + encodeURIComponent(bridge.id) + "/settings", null, function (s, b) { if (s === 200) { rows = b.settings; const v = {}; for (const r of rows) v[r.key] = r.value; vals = v } else dlg.fail(s, b) }) }
        readonly property bool dirty: !!rows && rows.some(function (r) { return vals[r.key] !== r.value })
        contentItem: ColumnLayout { spacing: 8
            Label { visible: !bridgeSettings.rows; text: "Loading…"; color: look.muted }
            Label { visible: !!bridgeSettings.rows && bridgeSettings.rows.length === 0; text: "This bridge has no options to change here."; color: look.muted }
            Repeater {
                model: bridgeSettings.rows || []
                delegate: RowLayout { Layout.fillWidth: true
                    ColumnLayout { Layout.fillWidth: true; spacing: 0
                        Label { text: modelData.label; color: look.text }
                        Label { visible: !!modelData.hint; Layout.fillWidth: true; wrapMode: Text.Wrap; text: modelData.hint; color: look.muted; font.pixelSize: Math.round(11 * look.textScale) } }
                    PSwitch { visible: modelData.kind === "bool"; checked: !!bridgeSettings.vals[modelData.key]; onToggled: { const v = bridgeSettings.vals; v[modelData.key] = checked; bridgeSettings.vals = v } }
                    SpinBox { visible: modelData.kind === "number"; from: 0; to: 100000; value: Number(bridgeSettings.vals[modelData.key]); onValueModified: { const v = bridgeSettings.vals; v[modelData.key] = value; bridgeSettings.vals = v } }
                }
            }
            Label { text: "Saving restarts " + (bridgeSettings.bridge ? bridgeSettings.bridge.name : "") + " for a few seconds."; color: look.muted; font.pixelSize: Math.round(12 * look.textScale) }
        }
        footer: DialogButtonBox {
            Button { text: "Cancel"; DialogButtonBox.buttonRole: DialogButtonBox.RejectRole }
            Button { text: "Save and restart"; enabled: bridgeSettings.dirty; DialogButtonBox.buttonRole: DialogButtonBox.AcceptRole }
        }
        onAccepted: dlg.call("PUT", "/api/admin/bridges/" + encodeURIComponent(bridge.id) + "/settings", { values: vals, restart: true }, function () { dlg.loadBridges() })
    }
    Dialog {
        id: schedule
        property var bridge; property string every: "off"; property string at: "04:00"
        modal: true; anchors.centerIn: Overlay.overlay; width: Math.min(440, dlg.width - 24); title: (bridge ? bridge.name : "") + ": restart on a timer"

        onAboutToShow: { const c = dlg.schedules[bridge.id]; every = c ? c.every : "off"; at = dlg.utcToLocal(c ? c.at : "04:00") }
        contentItem: ColumnLayout { spacing: 8
            Repeater {
                model: [["off", "Never (only when I press Restart)"], ["6h", "Every 6 hours"], ["12h", "Every 12 hours"], ["daily", "Once a day"]]
                delegate: RadioButton { text: modelData[1]; checked: schedule.every === modelData[0]; onClicked: schedule.every = modelData[0]; palette.windowText: look.text }
            }
            TextField { visible: schedule.every === "daily"; text: schedule.at; placeholderText: "HH:MM (your time)"; inputMask: "99:99"; color: look.text; onTextEdited: schedule.at = text; background: Rectangle { color: look.bg; radius: 8; border.color: look.line } }
            Label { Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.muted; font.pixelSize: Math.round(12 * look.textScale)
                text: "The bridge restarts by itself; its accounts stay linked, and messages are delayed for about 10 to 25 seconds." }
        }
        footer: DialogButtonBox { Button { text: "Cancel"; DialogButtonBox.buttonRole: DialogButtonBox.RejectRole } Button { text: "Save"; DialogButtonBox.buttonRole: DialogButtonBox.AcceptRole } }
        onAccepted: dlg.call("PUT", "/api/admin/bridges/" + encodeURIComponent(bridge.id) + "/schedule", { every: every, at: dlg.localToUtc(at) }, function () { dlg.loadBridges() })
    }
}
