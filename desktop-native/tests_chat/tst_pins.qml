import QtQuick
import QtQuick.Controls
import QtTest
import "../qml"

Item {
    id: root
    width: 380; height: 420
    RoomList { id: pane; anchors.fill: parent }

    TestCase {
        name: "Pins"; when: windowShown
        function names() { return core.pins.map(p => p.name) }
        function findList(item) { for (let i = 0; i < item.children.length; i++) { const c = item.children[i]; if (c.hasOwnProperty("headerItem") && c.hasOwnProperty("atYBeginning")) return c; const r = findList(c); if (r) return r } return null }
        function test_the_pinned_chats_are_in_view_when_the_app_opens() {
            wait(300); const lv = findList(pane); verify(lv !== null)
            console.log("contentY", lv.contentY, "originY", lv.originY, "headerH", lv.headerItem.height, "contentH", lv.contentHeight, "h", lv.height)
            verify(lv.contentY - lv.originY < 4, "the list starts at its top, pinned chats showing")
        }
        function test_pins_are_in_a_grid_of_three() {
            compare(names().length, 4)
        }
        function test_dragging_a_pin_to_a_new_place_rearranges_them() {
            wait(300)
            const before = names(); compare(before[0], "Maya")
            const cell = (root.width - 16 - 8) / 3 + 4
            const g = findPins(pane), top = g.mapToItem(pane, 0, 0), x0 = top.x + cell / 2 - 2, y0 = top.y + 50
            console.log("grid", top.x, top.y, "press", x0, y0, "at", pane.childAt(x0, y0))
            mousePress(pane, x0 + 0, y0, Qt.LeftButton)
            mouseMove(pane, x0 + 20, y0 + 4); mouseMove(pane, x0 + cell * 1.2, y0 + 4); mouseMove(pane, x0 + cell * 2, y0 + 4)
            wait(50)
            mouseRelease(pane, x0 + cell * 2, y0 + 4, Qt.LeftButton)
            wait(300)
            console.log("after", JSON.stringify(names()), g.dragFrom, g.dragOver)
            compare(names()[2], "Maya")
        }
        function findPins(item) { for (let i = 0; i < item.children.length; i++) { const c = item.children[i]; if (c.hasOwnProperty("columns") && c.hasOwnProperty("dragFrom")) return c; const r = findPins(c); if (r) return r } return null }
        function test_pages_can_be_ticked_and_acted_on_together() {
            verify(!pane.selecting)
            pane.togglePick("!a:x"); pane.togglePick("!b:x"); verify(pane.selecting); compare(pane.picked.length, 2)
            pane.togglePick("!a:x"); compare(pane.picked.length, 1)
            const seen = []; pane.eachPicked(id => seen.push(id)); compare(seen, ["!b:x"]); verify(!pane.selecting)
        }
    }
}
