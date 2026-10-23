import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Dialog {
    id: dlg
    signal restoreRequested()
    modal: true; anchors.centerIn: Overlay.overlay
    width: Math.min(520, Overlay.overlay ? Overlay.overlay.width - 24 : 520)
    height: Math.min(660, Overlay.overlay ? Overlay.overlay.height - 24 : 660)
    padding: 0
    background: Rectangle { color: look.panel; radius: 14; border.color: look.line }
    header: Rectangle {
        color: "transparent"; implicitHeight: 56
        Label { x: 20; anchors.verticalCenter: parent.verticalCenter; text: "Settings"; color: look.text; font.pixelSize: Math.round(20 * look.textScale); font.weight: Font.Bold }
        IconButton { anchors.right: parent.right; anchors.rightMargin: 8; anchors.verticalCenter: parent.verticalCenter; symbol: "✕"; glyphSize: 16; onClicked: dlg.close() }
        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: look.line }
    }

    component Section: Label { Layout.topMargin: 14; text: "" ; color: look.accent; font.pixelSize: Math.round(12 * look.textScale); font.weight: Font.Bold; font.capitalization: Font.AllUppercase }
    component Chip: Rectangle {
        id: chip
        property string label; property bool on: false; signal clicked()
        implicitWidth: lbl.implicitWidth + 28; implicitHeight: 34; radius: 17
        color: on ? look.accent : look.panel2
        Label { id: lbl; anchors.centerIn: parent; text: chip.label; color: chip.on ? look.accentInk : look.text; font.pixelSize: Math.round(13 * look.textScale) }
        TapHandler { onTapped: chip.clicked() }
    }
    component SwitchRow: RowLayout {
        id: sr
        property string title; property string hint; property alias checked: sw.checked; signal toggled(bool on)
        Layout.fillWidth: true
        ColumnLayout { Layout.fillWidth: true; spacing: 1
            Label { text: sr.title; color: look.text; font.pixelSize: Math.round(14 * look.textScale) }
            Label { visible: sr.hint.length > 0; Layout.fillWidth: true; text: sr.hint; wrapMode: Text.Wrap; color: look.muted; font.pixelSize: Math.round(12 * look.textScale) } }
        PSwitch { id: sw; onToggled: sr.toggled(checked) }
    }

    contentItem: ScrollView {
        id: scroll
        clip: true; contentWidth: availableWidth
        ColumnLayout {
            width: scroll.availableWidth - 40; x: 20; spacing: 10

            Section { text: "Appearance" }
            Flow {
                Layout.fillWidth: true; spacing: 8
                Repeater {
                    model: [["system", "Follow system"], ["light", "Light"], ["dark", "Dark"], ["black", "Black"]]
                    delegate: Chip { label: modelData[1]; on: look.palette === "" && look.mode === modelData[0]; onClicked: look.setMode(modelData[0]) }
                }
            }
            Label { text: "Accent colour"; color: look.muted; font.pixelSize: Math.round(12 * look.textScale) }
            Flow {
                Layout.fillWidth: true; spacing: 8
                Repeater {
                    model: look.accents()
                    delegate: Rectangle {
                        width: 34; height: 34; radius: 17; color: modelData.color
                        border.width: look.palette === "" && look.accentName === modelData.name ? 3 : 0; border.color: look.text
                        TapHandler { onTapped: look.setAccent(modelData.name) }
                    }
                }
                TextField {
                    id: custom; width: 110; height: 34; placeholderText: "#rrggbb"; maximumLength: 7; color: look.text; placeholderTextColor: look.muted
                    font.pixelSize: Math.round(13 * look.textScale)
                    background: Rectangle { radius: 17; color: look.panel2 }
                    onAccepted: look.setAccent(text)
                    onTextEdited: if (/^#[0-9a-fA-F]{6}$/.test(text)) look.setAccent(text)
                }
            }
            Label { text: "Ready-made looks"; color: look.muted; font.pixelSize: Math.round(12 * look.textScale) }
            Flow {
                Layout.fillWidth: true; spacing: 8
                Repeater {
                    model: look.palettes()
                    delegate: Rectangle {
                        width: 38; height: 38; radius: 10; color: modelData.bg
                        border.width: look.palette === modelData.id ? 3 : 1; border.color: look.palette === modelData.id ? look.text : modelData.line
                        Rectangle { anchors.right: parent.right; anchors.bottom: parent.bottom; width: 20; height: 20; radius: 10; color: modelData.accent; anchors.margins: 4 }
                        ToolTip.visible: hov.hovered; ToolTip.text: modelData.name
                        HoverHandler { id: hov }
                        TapHandler { onTapped: look.setPalette(modelData.id) }
                    }
                }
            }
            Label { text: "Text size"; color: look.muted; font.pixelSize: Math.round(12 * look.textScale) }
            Flow {
                Layout.fillWidth: true; spacing: 8
                Repeater {
                    model: [[0.9, "Small"], [1.0, "Normal"], [1.15, "Large"], [1.3, "Larger"]]
                    delegate: Chip { label: modelData[1]; on: Math.abs(look.textScale - modelData[0]) < 0.01; onClicked: look.setTextScale(modelData[0]) }
                }
            }

            Section { text: "Chats" }
            SwitchRow { title: "Enter sends"; hint: settings.enterToSend ? "Shift+Enter starts a new line" : "Ctrl+Enter sends, Enter starts a new line"; checked: settings.enterToSend; onToggled: (on) => settings.enterToSend = on }

            Section { text: "Notifications" }
            SwitchRow { title: "Pop-ups for new messages"; checked: settings.notifEnabled; onToggled: (on) => settings.notifEnabled = on }
            SwitchRow { title: "Keep running in the tray"; hint: "Closing the window leaves Pager running so messages still reach you"; checked: settings.closeToTray; onToggled: (on) => settings.closeToTray = on }

            Section { text: "Encryption" }
            RowLayout { Layout.fillWidth: true
                Label { Layout.fillWidth: true; text: "Restore old messages with your recovery key"; wrapMode: Text.Wrap; color: look.text; font.pixelSize: Math.round(14 * look.textScale) }
                Button { text: "Restore…"; onClicked: { dlg.close(); dlg.restoreRequested() } } }

            Section { text: "Updates" }
            RowLayout { Layout.fillWidth: true
                ColumnLayout { Layout.fillWidth: true; spacing: 1
                    Label { Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.text; font.pixelSize: Math.round(14 * look.textScale)
                        text: core.updateState === "available" ? "Pager " + core.updateVersion + " is available"
                            : core.updateState === "checking" ? "Checking…"
                            : core.updateState === "downloading" ? "Downloading… " + core.updateProgress + "%"
                            : core.updateState === "installing" ? "Installing…"
                            : "Pager " + core.appVersion }
                    Label { visible: core.updateState === "available" && core.updateNotes.length > 0; Layout.fillWidth: true; wrapMode: Text.Wrap; text: core.updateNotes; color: look.muted; font.pixelSize: Math.round(12 * look.textScale) }
                    Label { visible: core.updateMessage.length > 0; Layout.fillWidth: true; wrapMode: Text.Wrap; text: core.updateMessage; color: core.updateState === "error" ? look.danger : look.muted; font.pixelSize: Math.round(12 * look.textScale) }
                    ProgressBar { visible: core.updateState === "downloading"; Layout.fillWidth: true; from: 0; to: 100; value: core.updateProgress }
                }
                Button { visible: core.updateState === "available"; text: "Update now"; onClicked: core.installUpdate() }
                Button { visible: core.updateState === "idle" || core.updateState === "error"; text: "Check for updates"; onClicked: core.checkForUpdates(false) }
            }

            Section { text: "Account" }
            Label { text: core.user; color: look.text; font.pixelSize: Math.round(14 * look.textScale) }
            RowLayout { Layout.fillWidth: true; Layout.bottomMargin: 20
                Label { Layout.fillWidth: true; text: "Pager native " + core.appVersion + " · engine " + core.version; color: look.muted; font.pixelSize: Math.round(12 * look.textScale) }
                Button { text: "Sign out"; onClicked: { dlg.close(); core.logout() } } }
        }
    }
}
