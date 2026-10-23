import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "Gifs.js" as G

// Search GIFs (your own GIPHY or KLIPY key), keep favourites, add several to the message box and press Done.
Dialog {
    id: dlg
    signal openSettings()
    modal: true; anchors.centerIn: Overlay.overlay; padding: 0
    width: Math.min(620, Overlay.overlay ? Overlay.overlay.width - 24 : 620); height: Math.min(640, Overlay.overlay ? Overlay.overlay.height - 40 : 640)
    title: "GIFs"
    property var sources: G.withKeys(settings.gifKeys)
    property string tab: "favorites"
    property var gifs: []
    property string err: ""
    property bool busy: false
    property int picked: 0
    property var favorites: core.favoriteGifs()
    Connections { target: core; function onCurrentChanged() { dlg.favorites = core.favoriteGifs() } }
    readonly property var source: sources.find(s => s.id === tab) || null
    function run() {
        if (!source) return
        busy = true; err = ""
        const mine = source.id, q = search.text.trim()
        G.search(source, (settings.gifKeys || {})[source.keyOf] || "", q, function (e, list) { if (dlg.tab !== mine || search.text.trim() !== q) return; dlg.busy = false; dlg.err = e; dlg.gifs = list })
    }
    onAboutToShow: { sources = G.withKeys(settings.gifKeys); tab = favorites.length || !sources.length ? "favorites" : sources[0].id; picked = 0; search.text = ""; gifs = []; run() }
    onTabChanged: { gifs = []; if (source) run() }
    Timer { id: debounce; interval: 350; onTriggered: dlg.run() }
    background: Rectangle { color: look.panel; radius: 16; border.color: look.line }
    header: Item { height: 52
        Label { x: 20; anchors.verticalCenter: parent.verticalCenter; text: "GIFs"; color: look.text; font.pixelSize: Math.round(18 * look.textScale); font.weight: Font.DemiBold }
        IconButton { anchors.right: parent.right; anchors.rightMargin: 8; anchors.verticalCenter: parent.verticalCenter; ico: "x"; onClicked: dlg.close() } }
    component Grid2: GridView {
        id: g
        property var list: []
        property int cols: 3
        Layout.fillWidth: true; Layout.fillHeight: true; clip: true; cellWidth: Math.floor(width / cols); cellHeight: cellWidth * 0.78; model: list
        boundsBehavior: Flickable.StopAtBounds; ScrollBar.vertical: ScrollBar { }
        delegate: Item { width: g.cellWidth; height: g.cellHeight
            Rectangle { anchors.fill: parent; anchors.margins: 3; radius: 10; color: look.panel2; clip: true
                Image { anchors.fill: parent; source: modelData.previewUrl; fillMode: Image.PreserveAspectCrop; asynchronous: true; cache: true }
                TapHandler { onTapped: { core.sendGif(modelData.url, modelData.title, modelData.w, modelData.h); dlg.picked++ } }
                HoverHandler { cursorShape: Qt.PointingHandCursor }
                Rectangle { anchors.right: parent.right; anchors.top: parent.top; anchors.margins: 6; width: 28; height: 28; radius: 14; color: "#88000000"
                    Label { anchors.centerIn: parent; readonly property bool fav: dlg.favorites.length >= 0 && core.isFavoriteGif(modelData.url); text: fav ? "★" : "☆"; color: fav ? "#ffd54a" : "white"; font.pixelSize: 16 }
                    TapHandler { onTapped: { core.toggleFavoriteGif(modelData) } } }
            } }
    }
    contentItem: ColumnLayout { spacing: 8
        Flow { Layout.fillWidth: true; Layout.leftMargin: 16; Layout.rightMargin: 16; spacing: 6
            Repeater { model: [{ id: "favorites", name: "Favorites" + (dlg.favorites.length ? " (" + dlg.favorites.length + ")" : "") }].concat(dlg.sources)
                delegate: Rectangle { height: 32; width: tl.implicitWidth + 24; radius: 16; color: dlg.tab === modelData.id ? look.accent : look.panel2
                    Label { id: tl; anchors.centerIn: parent; text: modelData.name; color: dlg.tab === modelData.id ? look.accentInk : look.text; font.pixelSize: Math.round(13 * look.textScale) }
                    TapHandler { onTapped: dlg.tab = modelData.id } } } }
        TextField { id: search; visible: dlg.source !== null; Layout.fillWidth: true; Layout.leftMargin: 16; Layout.rightMargin: 16; placeholderText: dlg.source ? "Search " + dlg.source.name : ""; color: look.text; placeholderTextColor: look.muted
            background: Rectangle { radius: 20; color: look.panel2 } leftPadding: 16; onTextChanged: debounce.restart() }
        Label { visible: dlg.err.length > 0; Layout.fillWidth: true; Layout.leftMargin: 16; Layout.rightMargin: 16; wrapMode: Text.Wrap; color: look.danger; text: dlg.err }
        Label { visible: dlg.busy && dlg.gifs.length === 0; Layout.leftMargin: 16; text: "Loading…"; color: look.muted }
        Label { visible: dlg.source && !dlg.busy && !dlg.err.length && dlg.gifs.length === 0; Layout.leftMargin: 16; text: "Nothing found."; color: look.muted }
        Grid2 { visible: dlg.tab === "favorites" ? dlg.favorites.length > 0 : dlg.gifs.length > 0; list: dlg.tab === "favorites" ? dlg.favorites : dlg.gifs; Layout.leftMargin: 10; Layout.rightMargin: 10 }
        ColumnLayout { visible: dlg.tab === "favorites" && dlg.favorites.length === 0; Layout.fillWidth: true; Layout.fillHeight: true; spacing: 10
            Item { Layout.fillHeight: true }
            Label { Layout.alignment: Qt.AlignHCenter; text: dlg.sources.length ? "No favorite GIFs yet" : "Set up GIF search"; color: look.text; font.weight: Font.DemiBold; font.pixelSize: Math.round(16 * look.textScale) }
            Label { Layout.fillWidth: true; Layout.leftMargin: 30; Layout.rightMargin: 30; horizontalAlignment: Text.AlignHCenter; wrapMode: Text.Wrap; color: look.muted
                text: dlg.sources.length ? "Search for a GIF and tap ☆ to keep it here. Your favorites follow your account to every device." : "Add a free GIPHY or KLIPY API key in Settings → Stickers & GIFs. Pager doesn't ship a shared key." }
            Button { visible: !dlg.sources.length; Layout.alignment: Qt.AlignHCenter; text: "Open settings"; onClicked: { dlg.close(); dlg.openSettings() } }
            Item { Layout.fillHeight: true } }
        RowLayout { visible: dlg.picked > 0; Layout.fillWidth: true; Layout.margins: 12
            Label { Layout.fillWidth: true; text: dlg.picked + " sent"; color: look.muted }
            Button { text: "Done"; highlighted: true; onClicked: dlg.close() } }
    }
}
