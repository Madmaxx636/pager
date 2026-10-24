import QtQuick
import QtQuick.Controls
import QtQuick.Dialogs
import QtQuick.Layouts
import "Networks.js" as N

// Start a chat: everyone from every connected app in one list, then pick how to reach them.
Dialog {
    id: dlg
    modal: true; anchors.centerIn: Overlay.overlay
    width: Math.min(460, Overlay.overlay ? Overlay.overlay.width - 24 : 460); height: Math.min(640, Overlay.overlay ? Overlay.overlay.height - 24 : 640)
    padding: 0
    background: Rectangle { color: look.panel; radius: 14; border.color: look.line }

    property var networks: null
    property var people: []
    property var remote: []
    property bool loading: false
    property bool busy: false
    property string error: ""
    property string note: ""
    property var choose: null          // {title, ways}
    property int generation: 0

    readonly property string q: search.text.trim()
    readonly property var shown: {
        const t = q.toLowerCase(), digits = q.replace(/\D/g, "")
        const local = people.filter(p => !t || p.name.toLowerCase().includes(t) || (digits.length >= 3 && p.ways.some(w => (w.detail || "").replace(/\D/g, "").includes(digits))))
        const seen = {}; local.forEach(p => seen[p.key] = true)
        return t ? local.concat(remote.filter(p => !seen[p.key])) : local
    }

    onOpened: { search.text = ""; error = ""; note = ""; choose = null; busy = false; load(); search.forceActiveFocus() }
    onClosed: generation++

    function load() {
        const g = ++generation; loading = true; people = []
        core.api("GET", "/api/bridges", null, function (status, body) {
            if (g !== generation) return
            if (status !== 200) { error = (body && body.error) || "Couldn't reach the server"; networks = []; loading = false; return }
            const list = (body.networks || []).filter(n => n.logins && n.logins.length)
            networks = list
            let pending = 0, found = []
            for (const n of list) for (const l of n.logins) {
                pending++
                core.api("GET", "/api/bridges/" + n.id + "/contacts?login_id=" + encodeURIComponent(l.id), null, function (s, b) {
                    if (g !== generation) return
                    if (s === 200) for (const c of N.parseContacts(b)) found.push({ c: c, way: { net: n, login: l.id, id: c.id, detail: c.detail } })
                    if (--pending === 0) finish(found)
                })
            }
            if (pending === 0) { loading = false }
        })
    }
    function finish(found) {
        core.addToPhonebook(found.filter(f => f.c.detail).map(f => ({ number: f.c.detail, name: f.c.name })))
        people = N.mergePeople(found, core.prettyName); loading = false
    }
    Timer {   // typing something that is not in the list: ask the networks too
        id: remoteTimer; interval: 350; onTriggered: {
            if (!dlg.networks || dlg.q.length < 3) { dlg.remote = []; return }
            const g = dlg.generation; let pending = 0, found = []
            for (const n of dlg.networks) { const l = n.logins[0]; if (!l) continue; pending++
                core.api("POST", "/api/bridges/" + n.id + "/search_users?login_id=" + encodeURIComponent(l.id), { query: dlg.q }, function (s, b) {
                    if (g !== dlg.generation) return
                    if (s === 200) for (const c of N.parseContacts(b)) found.push({ c: c, way: { net: n, login: l.id, id: c.id, detail: c.detail } })
                    if (--pending === 0) dlg.remote = N.mergePeople(found, core.prettyName)
                })
            }
        }
    }
    function startWith(w) {
        busy = true; error = ""; choose = null
        const open = (id, done) => core.api("POST", "/api/bridges/" + w.net.id + "/create_dm/" + encodeURIComponent(id) + (w.login ? "?login_id=" + encodeURIComponent(w.login) : ""), {}, done)
        const g = generation
        open(w.id, function (status, body) {
            if (g !== generation) return
            if (status === 200 && body.dm_room_mxid) { done(body.dm_room_mxid); return }
            const number = N.dialable(w.detail)
            if (number && number !== w.id && N.couldNotResolve(body && body.error)) {
                open(number, function (s2, b2) { if (g !== generation) return; if (s2 === 200 && b2.dm_room_mxid) done(b2.dm_room_mxid); else fail(b2) })
            } else fail(body)
        })
    }
    function done(room) { busy = false; core.openWhenAvailable(room); dlg.close() }
    function fail(body) { busy = false; error = N.startError(body && body.error) }
    function pick(p) {
        const ways = p.ways.slice()
        if (ways.length === 1) startWith(ways[0]); else choose = { title: p.name, ways: ways }
    }

    header: Rectangle {
        color: "transparent"; implicitHeight: 56
        Label { x: 20; anchors.verticalCenter: parent.verticalCenter; text: "New chat"; color: look.text; font.pixelSize: Math.round(20 * look.textScale); font.weight: Font.Bold }
        IconButton { anchors.right: parent.right; anchors.rightMargin: 8; anchors.verticalCenter: parent.verticalCenter; symbol: "✕"; glyphSize: 16; onClicked: dlg.close() }
        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: look.line }
    }
    contentItem: ColumnLayout {
        spacing: 0
        TextField {
            id: search; Layout.fillWidth: true; Layout.margins: 14; placeholderText: "Name, phone number or username"; placeholderTextColor: look.muted; color: look.text; selectByMouse: true
            font.pixelSize: Math.round(14 * look.textScale); leftPadding: 14; background: Rectangle { radius: 18; color: look.panel2 }
            onTextChanged: { dlg.remote = []; remoteTimer.restart() }
        }
        Label { visible: dlg.error.length > 0; Layout.fillWidth: true; Layout.leftMargin: 16; Layout.rightMargin: 16; wrapMode: Text.Wrap; text: dlg.error; color: look.danger; font.pixelSize: Math.round(13 * look.textScale) }
        Label { visible: dlg.networks !== null && dlg.networks.length === 0 && !dlg.loading; Layout.fillWidth: true; Layout.margins: 16; wrapMode: Text.Wrap; color: look.muted
            text: "Connect an account first: ⋮ → Accounts." }
        ListView {
            id: peopleList
            Layout.fillWidth: true; Layout.fillHeight: true; clip: true; boundsBehavior: Flickable.StopAtBounds
            ScrollBar.vertical: ScrollBar { }
            SmoothWheel { view: peopleList }
            model: dlg.shown
            header: Item {
                width: peopleList.width; height: dlg.q.length ? 58 : 0; visible: dlg.q.length > 0
                Rectangle { anchors.fill: parent; color: hh.hovered ? look.panel2 : "transparent"; HoverHandler { id: hh }
                    RowLayout { anchors.fill: parent; anchors.leftMargin: 16; spacing: 12
                        Rectangle { width: 40; height: 40; radius: 20; color: look.accent; Label { anchors.centerIn: parent; text: "＋"; color: look.accentInk; font.pixelSize: 20 } }
                        Label { Layout.fillWidth: true; text: "Message “" + dlg.q + "”"; color: look.text; elide: Text.ElideRight } }
                    TapHandler { enabled: !dlg.busy && dlg.networks !== null; onTapped: dlg.choose = { title: "Message “" + dlg.q + "”", ways: dlg.networks.map(n => ({ net: n, login: n.logins[0] ? n.logins[0].id : "", id: dlg.q, detail: dlg.q })) } } }
            }
            delegate: Rectangle {
                width: peopleList.width; height: 58; color: hv.hovered ? look.panel2 : "transparent"
                HoverHandler { id: hv }
                RowLayout { anchors.fill: parent; anchors.leftMargin: 16; anchors.rightMargin: 16; spacing: 12
                    Avatar { size: 40; letter: modelData.name.length ? modelData.name[0].toUpperCase() : "?"; seed: modelData.name }
                    ColumnLayout { Layout.fillWidth: true; spacing: 0
                        Label { text: modelData.name; color: look.text; font.weight: Font.DemiBold; elide: Text.ElideRight; Layout.fillWidth: true; font.pixelSize: Math.round(14 * look.textScale) }
                        Label { visible: modelData.detail.length > 0; text: modelData.detail; color: look.muted; elide: Text.ElideRight; Layout.fillWidth: true; font.pixelSize: Math.round(12 * look.textScale) } }
                    Row { spacing: 4
                        Repeater { model: modelData.ways
                            delegate: Rectangle { width: 22; height: 22; radius: 11; color: N.meta(modelData.net.id).color; Label { anchors.centerIn: parent; text: N.meta(modelData.net.id).glyph; color: "white"; font.pixelSize: 11; font.bold: true } } } } }
                TapHandler { enabled: !dlg.busy; onTapped: dlg.pick(modelData) }
            }
            footer: Item { width: peopleList.width; height: foot.implicitHeight + 24
                ColumnLayout { id: foot; x: 16; y: 8; width: parent.width - 32; spacing: 6
                    Label { visible: dlg.loading; text: "Finding your contacts…"; color: look.muted }
                    Label { visible: dlg.busy; text: "Opening chat…"; color: look.muted }
                    Label { visible: !dlg.loading && dlg.shown.length === 0 && dlg.networks !== null && dlg.networks.length > 0; Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.muted
                        text: dlg.q.length ? "No one by that name yet. Use the row above to message a number or username." : "No contacts yet." }
                    Label { visible: dlg.note.length > 0; text: dlg.note; color: look.accent }
                    Button { text: "Import contacts (.vcf)"; flat: true; onClicked: vcf.open() }
                    Label { Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.muted; font.pixelSize: Math.round(11 * look.textScale)
                        text: "Names from a contacts file replace phone numbers everywhere in Pager." } } }
        }
    }
    FileDialog { id: vcf; title: "Import contacts"; nameFilters: ["Contacts (*.vcf)", "All files (*)"]; onAccepted: { const n = core.importContacts(files.path(selectedFile)); dlg.note = n > 0 ? "Imported " + n + " numbers" : ""; dlg.error = n > 0 ? "" : "No contacts found in that file"; dlg.people = dlg.people.slice() } }
    Dialog {
        id: chooser
        visible: dlg.choose !== null
        modal: true; anchors.centerIn: Overlay.overlay; width: Math.min(380, Overlay.overlay ? Overlay.overlay.width - 32 : 380); title: dlg.choose ? dlg.choose.title : ""
        standardButtons: Dialog.Cancel
        background: Rectangle { color: look.panel; radius: 14; border.color: look.line }
        onRejected: dlg.choose = null
        contentItem: ColumnLayout { spacing: 4
            Label { text: "How do you want to message them?"; color: look.muted; Layout.fillWidth: true; wrapMode: Text.Wrap }
            Repeater { model: dlg.choose ? dlg.choose.ways : []
                delegate: Rectangle { Layout.fillWidth: true; height: 48; radius: 10; color: wh.hovered ? look.panel2 : "transparent"; HoverHandler { id: wh }
                    RowLayout { anchors.fill: parent; anchors.leftMargin: 8; spacing: 10
                        Rectangle { width: 28; height: 28; radius: 14; color: N.meta(modelData.net.id).color; Label { anchors.centerIn: parent; text: N.meta(modelData.net.id).glyph; color: "white"; font.bold: true } }
                        ColumnLayout { spacing: 0; Label { text: N.meta(modelData.net.id).label; color: look.text } Label { visible: !!modelData.detail; text: modelData.detail || ""; color: look.muted; font.pixelSize: 11 } } }
                    TapHandler { onTapped: dlg.startWith(modelData) } } }
        }
    }
}
