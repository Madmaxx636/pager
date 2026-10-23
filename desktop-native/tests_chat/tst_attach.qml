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
        function test_a_place_link_is_understood() {
            place.parse("https://www.openstreetmap.org/?mlat=48.858400&mlon=2.294500#map=16/48.8584/2.2945")
            verify(Math.abs(place.lat - 48.8584) < 0.0001); verify(Math.abs(place.lon - 2.2945) < 0.0001)
            place.parse("not a place"); verify(isNaN(place.lat))
        }
    }
}
