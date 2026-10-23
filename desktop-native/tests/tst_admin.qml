import QtQuick
import QtQuick.Controls
import QtTest
import "../qml"

Item {
    id: root
    width: 700; height: 800
    Admin { id: admin; parent: Overlay.overlay }

    TestCase {
        name: "Admin"; when: windowShown
        function init() { core.clear(); admin.error = ""; admin.notice = ""; admin.people = null; admin.bridges = null; admin.server = null; admin.openUser = "" }
        function asked(method, path) { return core.calls().filter(c => c.method === method && c.path === path) }
        readonly property var users: ({ users: [
            { id: "@me:x", displayname: "Me", admin: true, deactivated: false, you: true, networks: [] },
            { id: "@ann:x", displayname: "Ann", admin: false, deactivated: false, you: false, networks: [{ id: "whatsapp", name: "WhatsApp", logins: [{ id: "l1", state_event: "CONNECTED" }] }] }] })

        function test_loads_the_people() {
            core.reply("GET /api/admin/overview", 200, users)
            admin.loadPeople(); tryVerify(function () { return admin.people !== null })
            compare(admin.people.length, 2); compare(admin.nameOf(admin.people[1]), "Ann")
        }
        function test_shows_the_server_error_for_a_non_admin() {
            core.reply("GET /api/admin/overview", 403, { error: "Admins only" })
            admin.loadPeople(); tryCompare(admin, "error", "Admins only")
        }
        function test_user_actions_post_to_the_right_place_and_refresh() {
            core.reply("GET /api/admin/overview", 200, users)
            core.reply("POST /api/admin/users/%40ann%3Ax/lock", 200, {})
            core.reply("POST /api/admin/users/%40ann%3Ax/admin", 200, {})
            core.reply("GET /api/admin/users/%40ann%3Ax/info", 200, { id: "@ann:x", devices: [], locked: false })
            admin.userAction("@ann:x", "lock", { locked: true })
            tryVerify(function () { return asked("POST", "/api/admin/users/%40ann%3Ax/lock").length === 1 })
            compare(asked("POST", "/api/admin/users/%40ann%3Ax/lock")[0].body.locked, true)
            tryVerify(function () { return asked("GET", "/api/admin/overview").length >= 1 })       // the list is reloaded afterwards
            admin.userAction("@ann:x", "admin", { admin: true })
            tryVerify(function () { return asked("POST", "/api/admin/users/%40ann%3Ax/admin").length === 1 })
        }
        function test_sign_out_everywhere_reports_how_many() {
            core.reply("GET /api/admin/overview", 200, users)
            core.reply("POST /api/admin/users/%40ann%3Ax/logout-all", 200, { signedOut: 3 })
            admin.userAction("@ann:x", "logout-all", {}, function (b) { admin.notice = "Signed out of " + b.signedOut + " device(s)." })
            tryCompare(admin, "notice", "Signed out of 3 device(s).")
        }
        function test_bridges_and_controls_load() {
            core.reply("GET /api/admin/bridges", 200, { bridges: [{ id: "signal", name: "Signal", up: true, container: { state: "running", status: "Up 2 hours", image: "x" } }], docker: true })
            core.reply("GET /api/admin/control", 200, { docker: true, settings: true })
            core.reply("GET /api/admin/schedules", 200, { schedules: { signal: { every: "6h", at: "04:00", last: 0 } }, canSave: true, docker: true })
            admin.loadBridges()
            tryVerify(function () { return admin.bridges !== null && admin.control.docker && admin.canSave })
            compare(admin.scheduleLabel(admin.schedules.signal), "Auto-restart: every 6 h")
            compare(admin.scheduleLabel(undefined), "Auto-restart: off")
        }
        function test_restart_calls_the_bridge_action() {
            core.reply("POST /api/admin/bridges/signal/restart", 200, {})
            admin.bridgeAction("signal", "restart")
            tryVerify(function () { return asked("POST", "/api/admin/bridges/signal/restart").length === 1 })
            admin.busyBridge = ""
        }
        function test_server_settings_load_and_change() {
            core.reply("GET /api/admin/server", 200, { domain: "pager.test", signup: "invite", inviteCode: "abc" })
            core.reply("POST /api/admin/server", 200, { domain: "pager.test", signup: "closed", inviteCode: "abc" })
            admin.loadServer(); tryVerify(function () { return admin.server !== null })
            admin.call("POST", "/api/admin/server", { signup: "closed" }, function (b) { admin.server = b })
            tryVerify(function () { return admin.server.signup === "closed" })
        }
        function test_schedule_times_round_trip_between_local_and_utc() {
            compare(admin.localToUtc(admin.utcToLocal("13:45")), "13:45")
        }
    }
}
