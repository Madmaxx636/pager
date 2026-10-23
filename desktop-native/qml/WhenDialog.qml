import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// Pick a moment: a quick choice, or a date and time.
Dialog {
    id: dlg
    property string heading: "When?"
    property var onPick: null
    signal picked(double whenMs)
    modal: true; anchors.centerIn: Overlay.overlay; width: Math.min(380, Overlay.overlay ? Overlay.overlay.width - 32 : 380)
    title: heading; standardButtons: Dialog.Cancel
    background: Rectangle { color: look.panel; radius: 14; border.color: look.line }
    function at(h, m, addDays) { const d = new Date(); d.setDate(d.getDate() + addDays); d.setHours(h, m, 0, 0); return d.getTime() }
    function choose(ms) { dlg.picked(ms); dlg.close() }
    readonly property var presets: {
        const now = new Date(), out = [["In 1 hour", Date.now() + 3600000], ["In 3 hours", Date.now() + 3 * 3600000]]
        if (now.getHours() < 18) out.push(["This evening, 6 PM", at(18, 0, 0)])
        out.push(["Tomorrow, 9 AM", at(9, 0, 1)])
        const toMonday = (8 - now.getDay()) % 7 || 7
        out.push(["Next week, Monday 9 AM", at(9, 0, toMonday)])
        return out
    }
    contentItem: ColumnLayout {
        spacing: 4
        Repeater {
            model: dlg.presets
            delegate: Rectangle { Layout.fillWidth: true; height: 42; radius: 10; color: ph.hovered ? look.panel2 : "transparent"; HoverHandler { id: ph }
                RowLayout { anchors.fill: parent; anchors.leftMargin: 10; Label { Layout.fillWidth: true; text: modelData[0]; color: look.text }
                    Label { text: new Date(modelData[1]).toLocaleString(Qt.locale(), "ddd h:mm AP"); color: look.muted; font.pixelSize: 12; rightPadding: 10 } }
                TapHandler { onTapped: dlg.choose(modelData[1]) } }
        }
        Label { text: "Or pick a time"; color: look.muted; font.pixelSize: 12; Layout.topMargin: 8 }
        RowLayout { spacing: 8
            TextField { id: dateField; Layout.fillWidth: true; inputMask: "9999-99-99"; text: Qt.formatDate(new Date(Date.now() + 86400000), "yyyy-MM-dd"); color: look.text; background: Rectangle { color: look.bg; radius: 8; border.color: look.line } }
            TextField { id: timeField; Layout.preferredWidth: 90; inputMask: "99:99"; text: "09:00"; color: look.text; background: Rectangle { color: look.bg; radius: 8; border.color: look.line } }
            Button { text: "Set"; onClicked: { const d = new Date(dateField.text + "T" + timeField.text + ":00"); if (!isNaN(d.getTime()) && d.getTime() > Date.now()) dlg.choose(d.getTime()) } }
        }
    }
}
