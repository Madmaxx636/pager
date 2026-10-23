import QtQuick
import QtQuick.Controls
import QtQuick.Dialogs
import QtQuick.Layouts

// Your stickers and the chat's own packs. Add pictures from this computer to your pack.
Dialog {
    id: dlg
    modal: true; anchors.centerIn: Overlay.overlay; padding: 0
    width: Math.min(520, Overlay.overlay ? Overlay.overlay.width - 24 : 520); height: Math.min(560, Overlay.overlay ? Overlay.overlay.height - 40 : 560)
    property var packs: []
    property int tab: 0
    function refresh() { packs = core.stickerPacks(); if (tab >= packs.length) tab = 0 }
    onAboutToShow: refresh()
    Connections { target: core; function onCurrentChanged() { if (dlg.visible) dlg.refresh() } }
    background: Rectangle { color: look.panel; radius: 16; border.color: look.line }
    header: Item { height: 52
        Label { x: 20; anchors.verticalCenter: parent.verticalCenter; text: "Stickers"; color: look.text; font.pixelSize: Math.round(18 * look.textScale); font.weight: Font.DemiBold }
        IconButton { anchors.right: parent.right; anchors.rightMargin: 8; anchors.verticalCenter: parent.verticalCenter; ico: "x"; onClicked: dlg.close() } }
    FileDialog { id: adder; title: "Add stickers"; fileMode: FileDialog.OpenFiles; nameFilters: ["Pictures (*.png *.jpg *.jpeg *.gif *.webp)"]; onAccepted: core.addStickers(selectedFiles.map(u => String(u))) }
    contentItem: ColumnLayout { spacing: 8
        RowLayout { visible: dlg.packs.length > 0; Layout.fillWidth: true; Layout.leftMargin: 14; Layout.rightMargin: 14; spacing: 6
            Flow { Layout.fillWidth: true; spacing: 6
                Repeater { model: dlg.packs
                    delegate: Rectangle { height: 32; width: pl.implicitWidth + 24; radius: 16; color: dlg.tab === index ? look.accent : look.panel2
                        Label { id: pl; anchors.centerIn: parent; text: modelData.name; color: dlg.tab === index ? look.accentInk : look.text; font.pixelSize: Math.round(13 * look.textScale) }
                        TapHandler { onTapped: dlg.tab = index } } } }
            IconButton { ico: "plus"; onClicked: adder.open(); ToolTip.text: "Add stickers"; ToolTip.visible: hovered } }
        GridView {
            id: grid
            visible: dlg.packs.length > 0; Layout.fillWidth: true; Layout.fillHeight: true; Layout.leftMargin: 10; Layout.rightMargin: 10; clip: true
            cellWidth: Math.floor(width / 4); cellHeight: cellWidth; model: dlg.packs.length ? dlg.packs[Math.min(dlg.tab, dlg.packs.length - 1)].stickers : []
            boundsBehavior: Flickable.StopAtBounds; ScrollBar.vertical: ScrollBar { }
            delegate: Item { width: grid.cellWidth; height: grid.cellHeight
                Rectangle { anchors.fill: parent; anchors.margins: 4; radius: 12; color: sh.hovered ? look.panel2 : "transparent"
                    MxcImage { anchors.fill: parent; anchors.margins: 6; mxc: modelData.url }
                    HoverHandler { id: sh; cursorShape: Qt.PointingHandCursor }
                    ToolTip.visible: sh.hovered; ToolTip.text: modelData.body; ToolTip.delay: 600
                    TapHandler { onTapped: { core.sendSticker(modelData); dlg.close() } } } }
        }
        ColumnLayout { visible: dlg.packs.length === 0; Layout.fillWidth: true; Layout.fillHeight: true; spacing: 10
            Item { Layout.fillHeight: true }
            Label { Layout.alignment: Qt.AlignHCenter; text: "No stickers yet"; color: look.text; font.weight: Font.DemiBold; font.pixelSize: Math.round(16 * look.textScale) }
            Label { Layout.fillWidth: true; Layout.leftMargin: 30; Layout.rightMargin: 30; horizontalAlignment: Text.AlignHCenter; wrapMode: Text.Wrap; color: look.muted; text: "Add images from your computer and they become stickers you can send in any page." }
            Button { Layout.alignment: Qt.AlignHCenter; text: "Add stickers"; highlighted: true; onClicked: adder.open() }
            Item { Layout.fillHeight: true } }
    }
}
