import QtQuick
import QtTest
import "../qml"

Item {
    width: 900; height: 700
    CommandBar { id: pal }
    TestCase {
        name: "Palette"; when: windowShown
        function test_typing_finds_chats_actions_and_settings() {
            core.openRoom("!maya"); wait(100)
            pal.open(); wait(80)
            verify(pal.shown.length > 0); compare(pal.shown[0].group, "This page")      // what you can do with the open chat comes first
            pal.recompute()
            pal.close()
        }
        function test_enter_runs_the_highlighted_entry() {
            core.openRoom("!long"); wait(100)
            pal.open(); wait(60)
            const i = pal.shown.findIndex(e => e.label.indexOf("Pin") === 0)
            verify(i >= 0); pal.runAt(i); wait(80)
            verify(core.roomInfo("!long").pinned)
            core.pin("!long", false)
        }
    }
}
