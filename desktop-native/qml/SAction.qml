import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// A row with a button.
RowLayout {
    id: row
    property string title
    property string hint: ""
    property string button: "Open"
    property bool danger: false
    property bool busy: false
    property bool flatButton: false      // a quiet text button (the web app's .link) instead of a pill
    property bool buttonWarn: false      // red text for it
    signal clicked()
    Layout.fillWidth: true; Layout.leftMargin: 16; Layout.rightMargin: 16; Layout.topMargin: 12; Layout.bottomMargin: 12; spacing: 12
    ColumnLayout { Layout.fillWidth: true; spacing: 1
        Label { text: row.title; color: row.danger ? look.danger : look.text; font.pixelSize: Math.round(15 * look.textScale); Layout.fillWidth: true; wrapMode: Text.Wrap }
        Label { visible: row.hint.length > 0; Layout.fillWidth: true; text: row.hint; wrapMode: Text.Wrap; color: look.muted; font.pixelSize: Math.round(12 * look.textScale) } }
    Button { visible: !row.flatButton && row.button.length > 0; text: row.button; enabled: !row.busy; onClicked: row.clicked() }
    Rectangle { visible: row.flatButton; implicitWidth: lk.implicitWidth + 16; implicitHeight: lk.implicitHeight + 12; radius: 8
        color: lh.hovered ? Qt.rgba((row.buttonWarn ? look.danger : look.accent).r, (row.buttonWarn ? look.danger : look.accent).g, (row.buttonWarn ? look.danger : look.accent).b, 0.12) : "transparent"
        Label { id: lk; anchors.centerIn: parent; text: row.button; color: row.buttonWarn ? look.danger : look.accent; font.pixelSize: Math.round(14 * look.textScale) }
        HoverHandler { id: lh; cursorShape: Qt.PointingHandCursor } TapHandler { onTapped: row.clicked() } }
}
