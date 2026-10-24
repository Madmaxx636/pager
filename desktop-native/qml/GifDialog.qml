import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "Gifs.js" as G

// Search GIFs (your own GIPHY or KLIPY key), keep favourites, add several to the message box and press Done.
Dialog {
    id: dlg
    signal openSettings()
    modal: true; anchors.centerIn: Overlay.overlay
    width: Math.min(560, Overlay.overlay ? Overlay.overlay.width - 32 : 560); height: Math.min(Overlay.overlay ? Overlay.overlay.height * 0.88 : 640, Math.max(360, implicitHeight))
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
    // each picked GIF goes into the message and the picker stays open until Done
    readonly property var shown: tab === "favorites" ? favorites : gifs
    readonly property real cellW: (width - 48 - 6) / 2
    readonly property var rows: {      // two GIFs to a row, each as tall as its own shape asks (not too wide, not too narrow)
        const out = []; const list = shown
        for (let i = 0; i < list.length; i += 2) {
            const a = list[i], b = list[i + 1]
            const ra = a.w && a.h ? Math.min(2, Math.max(0.6, a.w / a.h)) : 1.4, rb = b ? (b.w && b.h ? Math.min(2, Math.max(0.6, b.w / b.h)) : 1.4) : 99
            out.push({ items: b ? [a, b] : [a], h: Math.max(cellW / ra, b ? cellW / rb : 0) })
        }
        return out
    }
    contentItem: ColumnLayout { spacing: 8
        Flow { Layout.fillWidth: true; spacing: 6
            Repeater { model: [{ id: "favorites", name: "Favorites" + (dlg.favorites.length ? " (" + dlg.favorites.length + ")" : "") }].concat(dlg.sources)
                delegate: Rectangle { height: 33; width: tl.implicitWidth + 26; radius: 17; color: dlg.tab === modelData.id ? look.accent : look.panel2
                    Label { id: tl; anchors.centerIn: parent; text: modelData.name; color: dlg.tab === modelData.id ? look.accentInk : look.muted; font.pixelSize: Math.round(13.05 * look.textScale); font.weight: Font.Medium }
                    TapHandler { onTapped: dlg.tab = modelData.id } HoverHandler { cursorShape: Qt.PointingHandCursor } } } }
        Rectangle { visible: dlg.source !== null; Layout.fillWidth: true; Layout.preferredHeight: 44; radius: 22; color: look.panel2
            TextField { id: search; anchors.fill: parent; anchors.leftMargin: 16; anchors.rightMargin: 12; background: null; placeholderText: dlg.source ? "Search " + dlg.source.name : ""; placeholderTextColor: look.muted; color: look.text; font.pixelSize: Math.round(15 * look.textScale); selectByMouse: true
                onTextChanged: debounce.restart() } }
        Label { visible: dlg.err.length > 0; Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.danger; text: dlg.err }
        Label { visible: dlg.source && dlg.busy && dlg.gifs.length === 0; text: "Loading…"; color: look.muted }
        Label { visible: dlg.source && !dlg.busy && !dlg.err.length && dlg.gifs.length === 0; text: "Nothing found" + (search.text.trim().length ? " for “" + search.text.trim() + "”" : "") + "."; color: look.muted }
        ListView { id: grid; visible: dlg.shown.length > 0; Layout.fillWidth: true; Layout.preferredHeight: Math.min(contentHeight, (Overlay.overlay ? Overlay.overlay.height : 700) * 0.52); clip: true; spacing: 6; model: dlg.rows; boundsBehavior: Flickable.StopAtBounds
            ScrollBar.vertical: ScrollBar { }
            SmoothWheel { view: grid }
            delegate: Row { spacing: 6; height: modelData.h
                Repeater { model: modelData.items
                    delegate: Item { width: dlg.cellW; height: parent.height
                        Rectangle { anchors.fill: parent; radius: 10; color: look.panel2; clip: true
                            Image { anchors.fill: parent; source: modelData.previewUrl; fillMode: Image.PreserveAspectCrop; asynchronous: true; cache: true }
                            TapHandler { onTapped: { core.sendGif(modelData.url, modelData.title, modelData.w, modelData.h); dlg.picked++ } }
                            HoverHandler { cursorShape: Qt.PointingHandCursor } }
                        Rectangle { anchors.right: parent.right; anchors.top: parent.top; anchors.margins: 6; width: 30; height: 30; radius: 15; color: "#8c000000"
                            Label { anchors.centerIn: parent; readonly property bool fav: dlg.favorites.length >= 0 && core.isFavoriteGif(modelData.url); text: fav ? "★" : "☆"; color: "#ffd54a"; font.pixelSize: 17 }
                            TapHandler { onTapped: core.toggleFavoriteGif(modelData) } HoverHandler { cursorShape: Qt.PointingHandCursor } } } } }
        }
        Label { visible: dlg.source && dlg.source.keyOf === "klipy"; text: "Powered by KLIPY"; color: look.muted; font.pixelSize: Math.round(12 * look.textScale) }
        EmptyState { visible: dlg.tab === "favorites" && dlg.favorites.length === 0; Layout.fillWidth: true; icon: "image"; title: dlg.sources.length ? "No favorite GIFs yet" : "Set up GIF search"
            body: dlg.sources.length ? "Search for a GIF and tap ☆ to keep it here. Your favorites follow your account to every device." : "Add a free GIPHY or KLIPY API key in Settings → Stickers & GIFs. Pager doesn't ship a shared key."
            Button { visible: !dlg.sources.length; text: "Open settings"; highlighted: true; onClicked: { dlg.close(); dlg.openSettings() } } }
        RowLayout { visible: dlg.picked > 0; Layout.fillWidth: true; Layout.topMargin: 6
            Label { Layout.fillWidth: true; text: dlg.picked + " added to your message"; color: look.muted }
            Button { text: "Done"; highlighted: true; onClicked: dlg.close() } }
    }
}
