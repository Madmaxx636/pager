import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// Share a place: paste a map link (OpenStreetMap, Google Maps, Apple Maps) or type the latitude and longitude.
Dialog {
    id: dlg
    modal: true; anchors.centerIn: Overlay.overlay; width: Math.min(440, Overlay.overlay ? Overlay.overlay.width - 32 : 440); title: "Share a location"
    standardButtons: Dialog.Cancel | Dialog.Ok
    property real lat: NaN; property real lon: NaN
    function parse(t) {
        let m = /(-?\d{1,3}\.\d+)\s*[, ;]\s*(-?\d{1,3}\.\d+)/.exec(t) || /mlat=(-?[\d.]+)&mlon=(-?[\d.]+)/.exec(t) || /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(t)
        if (m) { lat = parseFloat(m[1]); lon = parseFloat(m[2]) } else { lat = NaN; lon = NaN }
        if (Math.abs(lat) > 90 || Math.abs(lon) > 180) { lat = NaN; lon = NaN }
    }
    onAboutToShow: { where.text = ""; lat = NaN; lon = NaN; where.forceActiveFocus() }
    onAccepted: core.sendLocation(lat, lon)
    Component.onCompleted: standardButton(Dialog.Ok).enabled = Qt.binding(() => !isNaN(dlg.lat))
    ColumnLayout { width: parent.width; spacing: 8
        TextField { id: where; Layout.fillWidth: true; placeholderText: "A map link, or 48.8584, 2.2945"; onTextChanged: dlg.parse(text) }
        Label { Layout.fillWidth: true; wrapMode: Text.Wrap; color: isNaN(dlg.lat) ? look.muted : look.accent; font.pixelSize: Math.round(12 * look.textScale)
            text: isNaN(dlg.lat) ? "Right-click a spot in your map app and copy its link or coordinates." : "Will share " + dlg.lat.toFixed(5) + ", " + dlg.lon.toFixed(5) } }
}
