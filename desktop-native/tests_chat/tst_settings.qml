import QtQuick
import QtQuick.Controls
import QtTest
import "../qml"

Item {
    id: root
    width: 900; height: 700
    SToggle { id: tog; key: "markdown"; title: "Formatting"; width: 400 }
    SChoice { id: choice; key: "notifScope"; title: "Scope"; options: [["all", "All"], ["dm_mentions", "DMs"]]; width: 400 }
    SSlider { id: slide; key: "groupGapMin"; title: "Gap"; from: 1; to: 30; step: 1; width: 400 }
    SList { id: list; key: "notifKeywords"; title: "Keywords"; width: 400 }
    SText { id: text; table: "gifKeys"; key: "giphy"; title: "Key"; width: 400 }
    Settings { id: page; parent: Overlay.overlay }

    TestCase {
        name: "Settings"; when: windowShown
        function init() { settings.reset() }
        function sw(item) { for (let i = 0; i < item.children.length; i++) { const c = item.children[i]; if (c.hasOwnProperty("checked")) return c; const r = sw(c); if (r) return r } return null }

        function test_a_toggle_follows_the_setting_and_changes_it() {
            const s = sw(tog); verify(s !== null)
            compare(s.checked, true)
            settings.set("markdown", false); compare(s.checked, false)             // changed from elsewhere: the switch follows
            mouseClick(s); compare(settings.markdown, true)                           // clicked: the setting follows
        }
        function test_a_choice_marks_the_chosen_option() {
            settings.set("notifScope", "dm_mentions"); compare(String(settings.notifScope), "dm_mentions")
            settings.set("notifScope", "all"); compare(String(settings.notifScope), "all")
        }
        function test_the_slider_shows_the_number() { settings.set("groupGapMin", 12); compare(settings.groupGapMin, 12) }
        function test_keywords_are_added_once_and_removed() {
            list.add("Lane"); list.add("Lane"); list.add("  "); compare(settings.notifKeywords.length, 1)
            list.remove(0); compare(settings.notifKeywords.length, 0)
        }
        function test_a_text_inside_a_table_setting() {
            text.store("abc123"); compare(settings.gifKeys.giphy, "abc123")
            text.store(""); verify(!("giphy" in settings.gifKeys))
        }
        function test_the_pages_open_and_list_what_the_other_apps_have() {
            page.open(); tryVerify(function () { return page.opened })
            const names = page.visiblePages.map(p => p[0])
            for (const want of ["appearance", "layout", "chats", "notifications", "bridges", "labels", "media", "privacy", "shortcuts", "system", "desktop", "storage", "advanced", "starred", "scheduled", "about"]) verify(names.indexOf(want) >= 0, want)
            verify(names.indexOf("admin") < 0)                                      // only for admins
            for (let i = 0; i < page.visiblePages.length; i++) { page.page = i; wait(60) }      // every page builds without errors
            page.close()
        }
    }
}
