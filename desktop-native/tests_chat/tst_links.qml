import QtQuick
import QtTest
import "../qml"

Item {
    width: 900; height: 700
    TestCase {
        name: "Links"; when: windowShown
        function init() { settings.set("showPinsRow", false); wait(50) }                          // pinned chats would sit in their own row, not in the list
        function cleanup() { core.unlink("!maya"); core.unlink("!dad"); settings.set("showPinsRow", true); wait(50) }
        function test_two_chats_of_one_person_become_one_row_and_one_conversation() {
            const rows = core.rooms.rowCount()
            core.openRoom("!maya"); wait(200)
            const alone = core.timeline.rowCount()
            core.link("!maya", "!dad"); wait(200)
            compare(core.rooms.rowCount(), rows - 1)                       // one row for both
            verify(core.merged)
            compare(core.linkedChats.length, 2)
            verify(core.timeline.rowCount() > alone)                       // Dad's messages joined Maya's
            core.setSolo("!maya", true); wait(100)
            verify(!core.merged); compare(core.timeline.rowCount(), alone) // one at a time again
            core.setSolo("!maya", false); wait(100)
            verify(core.merged)
            core.unlink("!maya"); wait(100)
            compare(core.rooms.rowCount(), rows); verify(!core.merged)
        }
        function test_a_message_in_a_merged_chat_goes_to_the_chat_that_spoke_last() {
            core.openRoom("!maya"); core.link("!maya", "!dad"); wait(200)
            core.demoReceive("!dad", "newest from dad"); wait(200)
            compare(core.sendTarget(), "!dad")
            core.setVia("!maya"); compare(core.sendTarget(), "!maya")
        }
    }
}
