import QtQuick
import QtTest
import "../qml"

Item {
    width: 900; height: 700
    GifDialog { id: gif }
    StickerDialog { id: stickers }
    ContactDialog { id: contact }
    LocationDialog { id: place }
    AttentionDialog { id: attn }
    AttentionOverlay { id: overlay }
    TestCase {
        name: "Attach"; when: windowShown
        function test_the_dialogs_open_and_close() {
            for (const d of [gif, stickers, contact, place, attn]) { d.open(); wait(60); verify(d.visible); d.close(); wait(30) }
        }
        function test_a_sticker_goes_into_the_chat_right_away() {
            core.openRoom("!maya"); wait(150)
            const n = core.timeline.rowCount()
            core.sendSticker({ url: "mxc://demo/s1", body: "wave", w: 120, h: 120, mime: "image/png" }); wait(150)
            compare(core.timeline.rowCount(), n + 1)
        }
        function test_a_nudge_and_a_place_show_up_as_messages() {
            core.openRoom("!maya"); wait(150)
            const n = core.timeline.rowCount()
            core.sendAttention("nudge"); core.sendLocation(48.8584, 2.2945); wait(150)
            compare(core.timeline.rowCount(), n + 2)
        }
        function test_whatsapp_status_updates_get_their_own_row_not_a_chat() {
            const info = core.storiesInfo(); compare(info.id, "!stories"); compare(info.unread, 3)
            for (let i = 0; i < core.rooms.rowCount(); i++) verify(core.rooms.data(core.rooms.index(i, 0), Qt.UserRole + 1) !== "!stories")
        }
        function test_the_sound_libraries_stay_out_of_memory_until_a_sound_is_needed() {
            verify(files.readText("/proc/self/maps").indexOf("ffmpegmediaplugin") < 0, "QtMultimedia was loaded at start")
        }
        function test_every_sound_is_an_id_and_a_name() {
            const list = files.sounds(); verify(list.length > 20)
            for (const e of list) { compare(e.length, 2); verify(e[0].length > 1 && e[1].length > 1) }
            verify(files.soundFile("chime").length > 0)
        }
        function test_hiding_stories_removes_the_row() {
            settings.set("hideStories", true); compare(core.storiesInfo().id, undefined)
            settings.set("hideStories", false); compare(core.storiesInfo().id, "!stories")
        }
        function test_message_details_list_who_when_status_and_the_event() {
            core.openRoom("!maya"); wait(150)
            const id = core.timeline.data(core.timeline.index(0, 0), Qt.UserRole + 1)
            const rows = core.messageInfo(id); const labels = rows.map(r => r[0])
            for (const want of ["Sent", "From", "Chat", "Type", "Event ID"]) verify(labels.indexOf(want) >= 0, want)
            compare(rows[labels.indexOf("Event ID")][1], id)
        }
        function test_a_place_link_is_understood() {
            place.parse("https://www.openstreetmap.org/?mlat=48.858400&mlon=2.294500#map=16/48.8584/2.2945")
            verify(Math.abs(place.lat - 48.8584) < 0.0001); verify(Math.abs(place.lon - 2.2945) < 0.0001)
            place.parse("not a place"); verify(isNaN(place.lat))
        }
    }
}
