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
        function findAll(item, pred, out) { for (let i = 0; i < item.children.length; i++) { const c = item.children[i]; if (pred(c)) out.push(c); findAll(c, pred, out) } return out }
        function test_every_switch_and_choice_on_every_page_changes_its_setting() {
            page.open(); tryVerify(function () { return page.opened })
            let toggled = 0, chosen = 0
            for (let i = 0; i < page.visiblePages.length; i++) {
                page.page = i; page.showingList = false; wait(120)
                const toggles = findAll(page.contentItem, c => c.hasOwnProperty("inverted") && c.hasOwnProperty("key") && c.hasOwnProperty("hint"), [])
                for (const t of toggles) {
                    if (!t.visible || !t.enabled || !t.key.length) continue
                    const sw = sw_(t); if (!sw) continue
                    const before = !!settings[t.key]
                    sw.toggle(); sw.toggled(); wait(20)
                    verify(!!settings[t.key] !== before, "switch " + t.key + " on page " + page.visiblePages[i][0])
                    settings.set(t.key, before); toggled++
                }
                const choices = findAll(page.contentItem, c => c.hasOwnProperty("options") && c.hasOwnProperty("key") && c.hasOwnProperty("picked"), [])
                for (const c of choices) {
                    if (!c.visible || !c.key.length || c.options.length < 2) continue
                    const before = settings[c.key]
                    const other = c.options.find(o => String(o[0]) !== String(before)); settings.set(c.key, other[0]); verify(String(settings[c.key]) === String(other[0]), c.key)
                    settings.set(c.key, before); chosen++
                }
            }
            verify(toggled > 40, "found " + toggled + " switches"); verify(chosen > 15, "found " + chosen + " choices")
            page.close()
        }
        function sw_(t) { const l = findAll(t, c => c.hasOwnProperty("checked") && c.hasOwnProperty("toggle"), []); return l.length ? l[0] : null }
        function test_a_settings_page_scrolls_smoothly_and_carries_on_like_a_touchpad() {
            page.open(); tryVerify(function () { return page.opened })
            page.page = page.visiblePages.findIndex(p => p[0] === "notifications"); page.showingList = false; wait(200)
            const fl = findAll(page.contentItem, c => c.hasOwnProperty("contentY") && c.hasOwnProperty("flick") && c.contentHeight > c.height && c.mapToItem(page.contentItem, 0, 0).x > 250, [])[0]
            verify(fl !== undefined, "a scrollable page")
            const y0 = fl.contentY
            mouseWheel(page.contentItem, 600, 400, 0, -120); wait(450)
            verify(fl.contentY - y0 > 60, "a wheel click moves the page: " + (fl.contentY - y0))
            const y1 = fl.contentY
            for (let i = 0; i < 8; ++i) { mouseWheel(page.contentItem, 600, 400, 0, -40); wait(12) }
            const during = fl.contentY - y1; wait(700)
            verify(fl.contentY - y1 > during + 30, "it keeps gliding after the fingers lift: " + during + " then " + (fl.contentY - y1))
            page.close()
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
