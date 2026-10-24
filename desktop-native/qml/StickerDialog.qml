import QtQuick
import QtQuick.Controls
import QtQuick.Dialogs
import QtQuick.Layouts

// Your stickers and the chat's own packs. Add pictures from this computer to your pack.
Dialog {
    id: dlg
    modal: true; anchors.centerIn: Overlay.overlay; title: "Stickers"
    width: Math.min(560, Overlay.overlay ? Overlay.overlay.width - 32 : 560); height: Math.min(Overlay.overlay ? Overlay.overlay.height * 0.88 : 560, Math.max(360, implicitHeight))
    property var packs: []
    property int tab: 0
    function refresh() { packs = core.stickerPacks(); if (tab >= packs.length) tab = 0 }
    onAboutToShow: refresh()
    Connections { target: core; function onCurrentChanged() { if (dlg.visible) dlg.refresh() } }
    FileDialog { id: adder; title: "Add stickers"; fileMode: FileDialog.OpenFiles; nameFilters: ["Pictures (*.png *.jpg *.jpeg *.gif *.webp)"]; onAccepted: core.addStickers(selectedFiles.map(u => String(u))) }
    contentItem: ColumnLayout { spacing: 8
        RowLayout { visible: dlg.packs.length > 0; Layout.fillWidth: true; spacing: 6
            Flow { Layout.fillWidth: true; spacing: 6
                Repeater { model: dlg.packs
                    delegate: Rectangle { height: 33; width: pl.implicitWidth + 26; radius: 17; color: dlg.tab === index ? look.accent : look.panel2
                        Label { id: pl; anchors.centerIn: parent; text: modelData.name; color: dlg.tab === index ? look.accentInk : look.muted; font.pixelSize: Math.round(13.05 * look.textScale); font.weight: Font.Medium }
                        TapHandler { onTapped: dlg.tab = index } } } }
            IconButton { ico: "plus"; onClicked: adder.open(); ToolTip.text: "Add stickers"; ToolTip.visible: hovered } }
        GridView {
            id: grid
            visible: dlg.packs.length > 0; Layout.fillWidth: true; Layout.preferredHeight: Math.min(contentHeight, (Overlay.overlay ? Overlay.overlay.height : 700) * 0.5); clip: true
            cellWidth: Math.floor(width / 4); cellHeight: cellWidth; model: dlg.packs.length ? dlg.packs[Math.min(dlg.tab, dlg.packs.length - 1)].stickers : []
            boundsBehavior: Flickable.StopAtBounds; ScrollBar.vertical: ScrollBar { }
            delegate: Item { width: grid.cellWidth; height: grid.cellHeight
                Rectangle { anchors.fill: parent; anchors.margins: 4; radius: 12; color: sh.hovered ? look.panel2 : "transparent"
                    MxcImage { anchors.fill: parent; anchors.margins: 6; mxc: modelData.url }
                    HoverHandler { id: sh; cursorShape: Qt.PointingHandCursor }
                    ToolTip.visible: sh.hovered; ToolTip.text: modelData.body; ToolTip.delay: 600
                    TapHandler { onTapped: { core.sendSticker(modelData); dlg.close() } } } }
        }
        EmptyState { visible: dlg.packs.length === 0; Layout.fillWidth: true; icon: "sticker"; title: "No stickers yet"; body: "Add images from your computer and they become stickers you can send in any page."
            Button { text: "Add stickers"; highlighted: true; onClicked: adder.open() } }
    }
}
