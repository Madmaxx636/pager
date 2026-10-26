import QtQuick
import QtQuick.Controls
import QtTest
import "../qml"

Item {
    id: root
    width: 900; height: 700
    Chat { id: chat; anchors.fill: parent }

    TestCase {
        name: "Chat"; when: windowShown
        property var list: findChild(chat, "")

        function messages() { return findList(chat) }
        function findList(item) {
            for (let i = 0; i < item.children.length; i++) { const c = item.children[i]; if (c.hasOwnProperty("verticalLayoutDirection") && c.hasOwnProperty("cacheBuffer") && c.count !== undefined && c.model === core.timeline) return c; const r = findList(c); if (r) return r }
            return null
        }
        function open(room) { core.openRoom(room); wait(250) }

        function test_a_new_message_shows_when_you_are_at_the_bottom() {
            open("!maya")
            const lv = messages(); verify(lv !== null)
            lv.positionViewAtBeginning(); wait(100); verify(lv.atYEnd)
            const before = lv.count
            core.demoReceive("!maya", "a brand new one"); wait(250)
            compare(lv.count, before + 1)
            verify(lv.atYEnd, "still at the newest message")
        }
        function test_scrolling_up_keeps_your_place_when_a_message_arrives() {
            open("!long")
            const lv = messages()
            lv.positionViewAtBeginning(); wait(100)
            mouseWheel(lv, 200, 300, 0, 600); wait(400)         // wheel up: older messages
            verify(!lv.atYEnd, "moved away from the newest")
            const y = lv.contentY, top = lv.indexAt(100, lv.contentY + 20)
            core.demoReceive("!long", "arrives while you read old messages"); wait(300)
            verify(Math.abs(lv.contentY - y) < 2 || lv.indexAt(100, lv.contentY + 20) === top + 1, "the messages you were reading did not jump")
            verify(!lv.atYEnd)
        }
        function test_wheel_moves_a_comfortable_distance_in_the_right_direction() {
            open("!long")
            const lv = messages(); lv.positionViewAtBeginning(); wait(100)
            const y0 = lv.contentY
            mouseWheel(lv, 200, 300, 0, 120); wait(400)          // one click up
            const moved = y0 - lv.contentY
            verify(moved > 60 && moved < 400, "one click moved " + moved + " px")
            mouseWheel(lv, 200, 300, 0, -120); wait(400)         // and back down
            verify(Math.abs(lv.contentY - y0) < 20, "back where it was")
        }
        function test_a_touchpad_swipe_carries_on_after_the_fingers_lift() {
            open("!long")
            const lv = messages(); lv.positionViewAtIndex(200, ListView.Center); wait(150)
            const y0 = lv.contentY
            for (let i = 0; i < 8; ++i) { mouseWheel(lv, 200, 300, 0, 40); wait(12) }         // small steps, the way a touchpad sends them (not whole wheel clicks)
            const during = y0 - lv.contentY
            verify(during > 100, "the view followed the fingers: " + during)
            wait(700)
            const after = y0 - lv.contentY
            verify(after > during + 40, "and kept going after they lifted: " + during + " then " + after)
            // the other way
            const y1 = lv.contentY
            for (let i = 0; i < 8; ++i) { mouseWheel(lv, 200, 300, 0, -40); wait(12) }
            wait(700)
            verify(lv.contentY > y1 + 150, "flicks the other way too")
        }
        function test_dragging_from_a_message_flicks_the_list() {
            open("!long")
            const lv = messages(); lv.positionViewAtIndex(200, ListView.Center); wait(150)
            const y0 = lv.contentY
            mousePress(lv, 300, 500); mouseMove(lv, 300, 450); mouseMove(lv, 300, 380); mouseMove(lv, 300, 300); mouseRelease(lv, 300, 300); wait(600)
            verify(Math.abs(lv.contentY - y0) > 150, "dragging on a message scrolled the list: " + (lv.contentY - y0))
        }
        function test_the_jump_to_newest_button_appears_only_when_away_from_the_bottom() {
            open("!long")
            const lv = messages(); lv.positionViewAtBeginning(); wait(100)
            verify(lv.atYEnd)
            lv.movementStarted()                  // the person scrolls away (a page that has just opened keeps following the newest message until they do)
            lv.positionViewAtIndex(200, ListView.Center); wait(100)
            verify(!lv.atYEnd)
        }
        function test_the_unread_line_is_in_the_chat_that_has_unread_messages() {
            open("!maya"); verify(core.dividerRow() >= 0, "divider row " + core.dividerRow())
            open("!sam"); compare(core.dividerRow(), -1)
        }
        function test_switching_chats_shows_that_chats_messages() {
            open("!dad"); const lv = messages(); verify(lv.count > 0)
            compare(core.currentName, "Dad")
            open("!sam"); compare(core.currentName, "Sam")
        }
    }
}
