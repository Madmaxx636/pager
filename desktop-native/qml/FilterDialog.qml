import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "Networks.js" as N

// Narrow the list: groups, direct messages, drafts, unanswered, one chat app.
Dialog {
    id: dlg
    modal: true; anchors.centerIn: Overlay.overlay; width: Math.min(400, Overlay.overlay ? Overlay.overlay.width - 32 : 400)
    title: "Filter pages"
    standardButtons: Dialog.Close
    function toggle(key) {
        const f = Object.assign({}, core.filters); f[key] = !f[key]
        if (key === "groups" && f.groups) f.dms = false
        if (key === "dms" && f.dms) f.groups = false
        core.setFilters(f)
    }
    function setNetwork(n) { const f = Object.assign({}, core.filters); f.network = f.network === n ? "" : n; core.setFilters(f) }
    contentItem: ColumnLayout {
        spacing: 6
        Repeater {
            model: [["groups", "Groups", "users"], ["dms", "Direct messages", "message-square-dot"], ["drafts", "With a draft", "square-pen"], ["unanswered", "Unanswered (they wrote last)", "circle-dot"]]
            delegate: Rectangle {
                readonly property bool on: !!core.filters[modelData[0]]
                Layout.fillWidth: true; height: 46; radius: 12; color: on ? Qt.rgba(look.accent.r, look.accent.g, look.accent.b, 0.16) : (hv.hovered ? look.panel2 : "transparent")
                HoverHandler { id: hv }
                RowLayout { anchors.fill: parent; anchors.leftMargin: 12; anchors.rightMargin: 12; spacing: 12
                    Icon { name: modelData[2]; size: 18; color: parent.parent.on ? look.accent : look.muted }
                    Label { Layout.fillWidth: true; text: modelData[1]; font.weight: Font.DemiBold; color: look.text }
                    Icon { visible: parent.parent.on; name: "circle-check"; size: 18; color: look.accent } }
                TapHandler { onTapped: dlg.toggle(modelData[0]) }
            }
        }
        Label { visible: core.networks.length > 1; text: "Network"; color: look.accent; font.pixelSize: 12; font.weight: Font.Bold; font.capitalization: Font.AllUppercase; Layout.topMargin: 8 }
        Repeater {
            model: core.networks.length > 1 ? core.networks : []
            delegate: Rectangle {
                readonly property bool on: core.filters.network === modelData
                Layout.fillWidth: true; height: 46; radius: 12; color: on ? Qt.rgba(look.accent.r, look.accent.g, look.accent.b, 0.16) : (hv2.hovered ? look.panel2 : "transparent")
                HoverHandler { id: hv2 }
                RowLayout { anchors.fill: parent; anchors.leftMargin: 12; anchors.rightMargin: 12; spacing: 12
                    Rectangle { width: 16; height: 16; radius: 8; color: N.meta(modelData).color }
                    Label { Layout.fillWidth: true; text: N.meta(modelData).label; font.weight: Font.DemiBold; color: look.text }
                    Icon { visible: parent.parent.on; name: "circle-check"; size: 18; color: look.accent } }
                TapHandler { onTapped: dlg.setNetwork(modelData) }
            }
        }
        Button { visible: core.filterCount > 0; text: "Clear filters"; flat: true; onClicked: { core.clearFilters(); dlg.close() } }
    }
}
