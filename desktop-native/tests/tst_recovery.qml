import QtQuick
import QtQuick.Controls
import QtTest
import "../qml"

Item {
    width: 600; height: 600
    Recovery { id: dlg; parent: Overlay.overlay }
    Recovery { id: viaSettings; parent: Overlay.overlay }
    Settings { id: settings; parent: Overlay.overlay; onRestoreRequested: viaSettings.open() }
    TestCase {
        name: "Recovery"; when: windowShown
        function test_the_key_can_be_typed_and_sent() {
            dlg.open(); tryVerify(function () { return dlg.opened })
            const field = findChild(dlg.contentItem, "keyField")
            verify(field !== null, "key field exists")
            verify(field.activeFocus, "key field has focus when the dialog opens")
            keyClick("A"); keyClick("b")
            compare(field.text, "Ab")
            dlg.close()
        }
        function test_typing_works_after_opening_it_from_settings() {
            settings.open(); tryVerify(function () { return settings.opened })
            settings.restoreRequested(); settings.close()           // what the "Restore…" button does
            tryVerify(function () { return viaSettings.opened })
            wait(400)                                               // let the closing Settings finish its animation
            const field = findChild(viaSettings.contentItem, "keyField")
            verify(field.activeFocus, "focus is on the key field")
            keyClick("x"); keyClick("y")
            compare(field.text, "xy")
        }
    }
}
