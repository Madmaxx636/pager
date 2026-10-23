import QtQuick
import QtQuick.Controls
import QtTest
import "../qml"

Item {
    id: root
    width: 600; height: 700
    NewChat { id: dlg; parent: Overlay.overlay }

    TestCase {
        name: "NewChat"; when: windowShown
        function init() { core.clear(); dlg.generation++ }
        function asked(method, path) { return core.calls().filter(c => c.method === method && c.path.indexOf(path) === 0) }
        function setup() {
            core.reply("GET /api/bridges", 200, { networks: [{ id: "whatsapp", name: "WhatsApp", logins: [{ id: "w1" }] }, { id: "signal", name: "Signal", logins: [{ id: "s1" }] }, { id: "irc", name: "IRC", logins: [] }] })
            core.reply("GET /api/bridges/whatsapp/contacts?login_id=w1", 200, { contacts: [{ id: "wa-ann", name: "Ann Lee", identifiers: ["tel:+15551230001"] }, { id: "wa-bob", name: "Bob", identifiers: ["tel:+15551230002"] }] })
            core.reply("GET /api/bridges/signal/contacts?login_id=s1", 200, { contacts: [{ id: "sig-ann", name: "Ann Lee", identifiers: ["tel:+15551230001"] }] })
            dlg.open(); tryVerify(function () { return !dlg.loading && dlg.people.length > 0 })
        }
        function test_one_row_per_person_across_networks() {
            setup()
            compare(dlg.people.length, 2)
            const ann = dlg.people.filter(p => p.name === "Ann Lee")[0]
            compare(ann.ways.length, 2)                                  // the same number on WhatsApp and Signal is one person
            compare(dlg.people.filter(p => p.name === "Bob")[0].ways.length, 1)
            dlg.close()
        }
        function test_one_way_starts_the_chat_and_opens_it() {
            setup()
            core.reply("POST /api/bridges/whatsapp/create_dm/wa-bob?login_id=w1", 200, { dm_room_mxid: "!bob:x" })
            dlg.pick(dlg.people.filter(p => p.name === "Bob")[0])
            tryVerify(function () { return core.opened() === "!bob:x" })
        }
        function test_several_ways_ask_which_network() {
            setup()
            dlg.pick(dlg.people.filter(p => p.name === "Ann Lee")[0])
            verify(dlg.choose !== null); compare(dlg.choose.ways.length, 2)
            dlg.close()
        }
        function test_falls_back_to_the_phone_number_when_the_id_cannot_be_resolved() {
            setup()
            core.reply("POST /api/bridges/whatsapp/create_dm/wa-bob?login_id=w1", 500, { error: "Internal error resolving identifier" })
            core.reply("POST /api/bridges/whatsapp/create_dm/%2B15551230002?login_id=w1", 200, { dm_room_mxid: "!bob2:x" })
            dlg.startWith({ net: { id: "whatsapp" }, login: "w1", id: "wa-bob", detail: "+15551230002" })
            tryVerify(function () { return core.opened() === "!bob2:x" })
        }
        function test_a_failure_is_explained() {
            setup()
            core.reply("POST /api/bridges/signal/create_dm/nobody?login_id=s1", 500, { error: "Internal error resolving identifier" })
            dlg.startWith({ net: { id: "signal" }, login: "s1", id: "nobody", detail: "nobody" })
            tryVerify(function () { return dlg.error.indexOf("phone number") >= 0 })
            dlg.close()
        }
    }
}
