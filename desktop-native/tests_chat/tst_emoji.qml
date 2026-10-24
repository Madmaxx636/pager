import QtQuick
import QtQuick.Controls
import QtTest
import "../qml"

Item {
    width: 700; height: 700
    EmojiPicker { id: pick }
    TestCase {
        name: "EmojiPicker"; when: windowShown
        function findGrid(item) { for (let i = 0; i < item.children.length; i++) { const c = item.children[i]; if (c.hasOwnProperty("cellWidth") && c.hasOwnProperty("cellHeight")) return c; const r = findGrid(c); if (r) return r } return null }
        function test_it_is_a_roomy_sheet_with_seven_across_like_the_web() {
            pick.open(); wait(200)
            compare(pick.width, 432)
            const g = findGrid(pick.contentItem); verify(g !== null)
            compare(g.cellHeight, 51)
            verify(g.cellWidth * 7 <= g.width + 0.5 || g.width === 0)
            verify(pick.height <= 577)
            pick.close()
        }
    }
}
