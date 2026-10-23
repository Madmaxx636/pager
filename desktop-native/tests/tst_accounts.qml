import QtQuick
import QtQuick.Controls
import QtTest
import "../qml"

Item {
    id: root
    width: 600; height: 700
    Accounts { id: accounts; parent: Overlay.overlay }

    TestCase {
        name: "Accounts"; when: windowShown
        function init() { core.clear(); accounts.cancelFlow() }
        function route(key, status, body) { core.reply(key, status, body) }
        function asked(method, path) { return core.calls().some(c => c.method === method && c.path === path) }

        function test_lists_networks_and_their_logins() {
            route("GET /api/bridges", 200, { networks: [{ id: "whatsapp", name: "WhatsApp", logins: [{ id: "l1", name: "Maya", state_event: "CONNECTED" }] }, { id: "signal", name: "Signal", logins: [] }] })
            accounts.load()
            tryCompare(accounts, "loading", false)
            compare(accounts.networks.length, 2)
            compare(accounts.networks[0].logins[0].__net, "whatsapp")
        }
        function test_shows_a_server_error() {
            route("GET /api/bridges", 500, { error: "bridge down" })
            accounts.load(); tryCompare(accounts, "error", "bridge down")
        }
        function test_qr_sign_in_walks_the_steps_to_complete() {
            route("GET /api/bridges/whatsapp/login/flows", 200, { flows: [{ id: "qr", name: "QR" }] })
            route("POST /api/bridges/whatsapp/login/start/qr", 200, { login_id: "L", step_id: "s1", type: "display_and_wait", display_and_wait: { type: "qr", data: "abc" } })
            route("POST /api/bridges/whatsapp/login/step/L/s1/display_and_wait", 200, { login_id: "L", step_id: "done", type: "complete" })
            accounts.begin("whatsapp")
            tryVerify(function () { return accounts.step && accounts.step.type === "complete" })      // one flow: it started by itself, waited, and finished
            verify(asked("POST", "/api/bridges/whatsapp/login/start/qr"))
        }
        function test_several_flows_ask_which_one() {
            route("GET /api/bridges/gmessages/login/flows", 200, { flows: [{ id: "a", name: "A" }, { id: "b", name: "B" }] })
            accounts.begin("gmessages")
            tryCompare(accounts, "busy", false); compare(accounts.flows.length, 2); compare(accounts.step, null)
        }
        function test_form_step_sends_the_typed_values() {
            route("GET /api/bridges/signal/login/flows", 200, { flows: [{ id: "phone", name: "Phone" }] })
            route("POST /api/bridges/signal/login/start/phone", 200, { login_id: "L", step_id: "s1", type: "user_input", user_input: { fields: [{ id: "number", type: "phone", name: "Number" }] } })
            route("POST /api/bridges/signal/login/step/L/s1/user_input", 200, { login_id: "L", step_id: "end", type: "complete" })
            accounts.begin("signal"); tryVerify(function () { return accounts.step && accounts.step.type === "user_input" })
            accounts.fields = { number: "+15551234567" }
            accounts.send(accounts.fields)
            tryVerify(function () { return accounts.step && accounts.step.type === "complete" })
            const sent = core.calls().filter(c => c.path.endsWith("/user_input"))[0]
            compare(sent.body.number, "+15551234567")
        }
        function test_a_failed_step_shows_the_error_and_stays() {
            route("GET /api/bridges/signal/login/flows", 200, { flows: [{ id: "phone", name: "Phone" }] })
            route("POST /api/bridges/signal/login/start/phone", 200, { login_id: "L", step_id: "s1", type: "user_input", user_input: { fields: [] } })
            route("POST /api/bridges/signal/login/step/L/s1/user_input", 400, { error: "Wrong code" })
            accounts.begin("signal"); tryVerify(function () { return accounts.step && accounts.step.type === "user_input" })
            accounts.send({}); tryCompare(accounts, "flowError", "Wrong code")
            compare(accounts.step.type, "user_input")
        }
        function test_cancelling_ignores_late_answers() {
            route("GET /api/bridges/signal/login/flows", 200, { flows: [{ id: "phone", name: "Phone" }] })
            accounts.begin("signal"); accounts.cancelFlow()
            wait(50); compare(accounts.net, ""); compare(accounts.flows, null)
        }
    }
}
