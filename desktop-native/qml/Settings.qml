import QtQuick
import QtQuick.Controls
import QtQuick.Dialogs
import QtQuick.Layouts
import "Networks.js" as N
import "Shortcuts.js" as SC

// Settings: the same pages as the other Pager apps.
Dialog {
    id: dlg
    signal restoreRequested()
    signal accountsRequested()
    signal adminRequested()
    signal openMessage(string roomId, string eventId)
    property int page: 0
    property string note: ""
    modal: true; anchors.centerIn: Overlay.overlay
    width: Math.min(880, Overlay.overlay ? Overlay.overlay.width - 24 : 880)
    height: Math.min(720, Overlay.overlay ? Overlay.overlay.height - 24 : 720)
    padding: 0
    background: Rectangle { color: look.panel; radius: 14; border.color: look.line }
    readonly property bool narrow: width < 640
    property bool showingList: true

    readonly property var pages: [
        ["appearance", "Appearance", "Theme, colors, text size, bubbles"], ["layout", "Inbox & layout", "Tabs, pins, density, what's shown"], ["chats", "Chats", "Sending, reading, privacy, media"],
        ["notifications", "Notifications", "Previews, scope, quiet hours"], ["bridges", "Bridges & accounts", "Connected apps and their status"], ["labels", "Labels", "Organize chats into folders"],
        ["media", "Stickers & GIFs", "GIF search"], ["privacy", "Privacy & encryption", "Recovery key, receipts, typing"], ["shortcuts", "Keyboard shortcuts", "See and change every shortcut"],
        ["system", "System", "Time, motion, greeting"], ["desktop", "Desktop", "Tray, startup"], ["admin", "Admin", "Profiles, bridges, signups"], ["storage", "Backup & reset", "Export, import, reset"],
        ["advanced", "Advanced", "Developer tools"], ["starred", "Starred messages", ""], ["scheduled", "Scheduled & reminders", ""], ["about", "About", "Version, server, sign out"]
    ]
    readonly property var visiblePages: pages.filter(p => p[0] !== "admin" || core.isAdmin)

    function openPage(id) { for (let i = 0; i < visiblePages.length; i++) if (visiblePages[i][0] === id) { page = i; showingList = false; break } open() }
    onAboutToShow: { if (!narrow) showingList = false; note = "" }

    header: Rectangle {
        color: "transparent"; implicitHeight: 56
        IconButton { visible: dlg.narrow && !dlg.showingList; x: 6; anchors.verticalCenter: parent.verticalCenter; symbol: "←"; glyphSize: 20; onClicked: dlg.showingList = true }
        Label { x: dlg.narrow && !dlg.showingList ? 52 : 20; anchors.verticalCenter: parent.verticalCenter; text: dlg.narrow && !dlg.showingList ? dlg.visiblePages[dlg.page][1] : "Settings"; color: look.text; font.pixelSize: Math.round(20 * look.textScale); font.weight: Font.Bold }
        IconButton { anchors.right: parent.right; anchors.rightMargin: 8; anchors.verticalCenter: parent.verticalCenter; symbol: "✕"; glyphSize: 16; onClicked: dlg.close() }
        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: look.line }
    }

    contentItem: RowLayout {
        spacing: 0
        // ---- the list of pages
        ListView {
            id: nav
            visible: !dlg.narrow || dlg.showingList
            Layout.preferredWidth: dlg.narrow ? dlg.width : 250; Layout.fillHeight: true; clip: true; model: dlg.visiblePages; boundsBehavior: Flickable.StopAtBounds
            ScrollBar.vertical: ScrollBar { }
            SmoothWheel { view: nav }
            delegate: Rectangle {
                width: nav.width; height: 52; color: dlg.page === index && !dlg.narrow ? Qt.rgba(look.accent.r, look.accent.g, look.accent.b, 0.16) : (hv.hovered ? look.panel2 : "transparent")
                HoverHandler { id: hv }
                Column { anchors.verticalCenter: parent.verticalCenter; x: 18; width: parent.width - 36; spacing: 1
                    Label { text: modelData[1]; color: look.text; font.pixelSize: Math.round(14 * look.textScale); font.weight: Font.DemiBold; elide: Text.ElideRight; width: parent.width }
                    Label { visible: modelData[2].length > 0; text: modelData[2]; color: look.muted; font.pixelSize: Math.round(11 * look.textScale); elide: Text.ElideRight; width: parent.width } }
                TapHandler { onTapped: { dlg.page = index; dlg.showingList = false } }
            }
        }
        Rectangle { visible: !dlg.narrow; Layout.fillHeight: true; width: 1; color: look.line }
        // ---- the page
        ScrollView {
            id: scroll
            visible: !dlg.narrow || !dlg.showingList
            Layout.fillWidth: true; Layout.fillHeight: true; clip: true; contentWidth: availableWidth
            Loader {
                width: scroll.availableWidth - 48; x: 24
                sourceComponent: { switch (dlg.visiblePages[dlg.page] ? dlg.visiblePages[dlg.page][0] : "") {
                    case "appearance": return appearance; case "layout": return layout; case "chats": return chats; case "notifications": return notifications; case "bridges": return bridges
                    case "labels": return labels; case "media": return media; case "privacy": return privacy; case "shortcuts": return shortcuts; case "system": return system
                    case "desktop": return desktop; case "admin": return adminPage; case "storage": return storage; case "advanced": return advanced; case "starred": return starred
                    case "scheduled": return scheduledPage; default: return about } }
            }
        }
    }

    // =============================================================== pages
    Component { id: appearance
        SGroup { Layout.fillWidth: true; width: parent ? parent.width : 400
            SGroup { title: "Theme"
                Label { text: "Mode"; color: look.text }
                Flow { Layout.fillWidth: true; spacing: 6
                    Repeater { model: [["system", "Follow system"], ["light", "Light"], ["dark", "Dark"], ["black", "Black"]]
                        delegate: Rectangle { height: 32; width: ml.implicitWidth + 24; radius: 16; color: look.palette === "" && look.mode === modelData[0] ? look.accent : look.panel2
                            Label { id: ml; anchors.centerIn: parent; text: modelData[1]; color: look.palette === "" && look.mode === modelData[0] ? look.accentInk : look.text; font.pixelSize: Math.round(13 * look.textScale) }
                            TapHandler { onTapped: look.setMode(modelData[0]) } } } }
                Label { text: "Accent colour"; color: look.text }
                Flow { Layout.fillWidth: true; spacing: 8
                    Repeater { model: look.accents()
                        delegate: Rectangle { width: 34; height: 34; radius: 17; color: modelData.color; border.width: look.palette === "" && look.accentName === modelData.name ? 3 : 0; border.color: look.text; TapHandler { onTapped: look.setAccent(modelData.name) } } }
                    TextField { width: 110; height: 34; placeholderText: "#rrggbb"; maximumLength: 7; color: look.text; placeholderTextColor: look.muted; background: Rectangle { radius: 17; color: look.panel2 }
                        onTextEdited: if (/^#[0-9a-fA-F]{6}$/.test(text)) look.setAccent(text) } }
                Label { text: "Ready-made looks"; color: look.text }
                Flow { Layout.fillWidth: true; spacing: 8
                    Repeater { model: look.palettes()
                        delegate: Rectangle { width: 38; height: 38; radius: 10; color: modelData.bg; border.width: look.palette === modelData.id ? 3 : 1; border.color: look.palette === modelData.id ? look.text : modelData.line
                            Rectangle { anchors.right: parent.right; anchors.bottom: parent.bottom; width: 20; height: 20; radius: 10; color: modelData.accent; anchors.margins: 4 }
                            ToolTip.visible: ph.hovered; ToolTip.text: modelData.name; HoverHandler { id: ph } TapHandler { onTapped: look.setPalette(modelData.id) } } } }
            }
            SGroup { title: "Text"
                SSlider { key: "fontScale"; title: "Text size"; from: 0.8; to: 1.6; step: 0.05; suffix: "×"; decimals: 2 }
                SChoice { key: "bubbleStyle"; title: "Bubble shape"; options: [["round", "Round"], ["curved", "Curved tail"], ["tail", "Pointed tail"], ["outline", "Outlined"]] }
                SToggle { key: "colorSenderNames"; title: "Colour people's names in groups" }
                SToggle { key: "largeEmoji"; title: "Large emoji"; hint: "A message of only a few emoji is shown big, without a bubble" }
            }
            SGroup { title: "Reactions"
                SList { key: "quickReactions"; title: "Quick reactions"; hint: "The row of emoji that appears when you react to a message"; emojiPicker: true }
                SToggle { key: "doubleTapReact"; title: "Double-click a message to react" }
            }
        }
    }
    Component { id: layout
        SGroup { Layout.fillWidth: true
            SGroup { title: "Chat list"
                SChoice { key: "density"; title: "Density"; options: [["comfortable", "Comfortable"], ["compact", "Compact"]] }
                SChoice { key: "defaultTab"; title: "Start on"; options: [["inbox", "Inbox"], ["unread", "Unread"]] }
                SToggle { key: "showAvatars"; title: "Show pictures" }
                SToggle { key: "showNetworkBadges"; title: "Show which app each chat is on" }
                SToggle { key: "showPreviews"; title: "Show the last message" }
                SToggle { key: "showPinsRow"; title: "Keep pinned chats at the top" }
                SToggle { key: "sortUnreadFirst"; title: "Unread chats first" }
                SToggle { key: "showLabelsInFilterBar"; title: "Show your labels as tabs" }
                SSlider { key: "sidebarWidth"; title: "List width"; from: 280; to: 520; step: 10; suffix: " px" }
            }
            SGroup { title: "In a chat"
                SToggle { key: "showReadTicks"; title: "Show sent, delivered and read marks" }
                SToggle { key: "showMessageTimes"; title: "Show the time on messages" }
            }
        }
    }
    Component { id: chats
        SGroup { Layout.fillWidth: true
            SGroup { title: "Writing"
                SToggle { key: "enterToSend"; title: "Enter sends"; hint: "Shift+Enter starts a new line. Off: Ctrl+Enter sends" }
                SToggle { key: "markdown"; title: "Formatting"; hint: "**bold**, _italic_, `code` and ~~strike~~ become formatted text" }
                SToggle { key: "mentionSuggestions"; title: "Suggest people when you type @" }
                SToggle { key: "confirmDelete"; title: "Ask before deleting a message" }
            }
            SGroup { title: "Reading"
                SSlider { key: "groupGapMin"; title: "Group messages sent within"; from: 1; to: 30; step: 1; suffix: " min" }
                SChoice { key: "markReadMode"; title: "Mark as read when"; options: [["open", "I open the chat"], ["scrolled", "I reach the newest"], ["manual", "I say so"]] }
                SToggle { key: "openAtUnread"; title: "Open at the first unread message" }
                SToggle { key: "unarchiveOnMessage"; title: "Bring an archived chat back when someone writes" }
            }
            SGroup { title: "Privacy"
                SToggle { key: "sendReadReceipts"; title: "Send read receipts"; hint: "Off: only you and the server know what you've read" }
                SToggle { key: "sendTyping"; title: "Send typing indicators" }
            }
            SGroup { title: "Media"
                SToggle { key: "linkPreviews"; title: "Link previews" }
                SChoice { key: "autoDownload"; title: "Download pictures"; options: [["always", "Automatically"], ["never", "When I tap them"]] }
                SToggle { key: "autoPlayGifs"; title: "Play GIFs automatically" }
            }
        }
    }
    Component { id: notifications
        SGroup { Layout.fillWidth: true
            SGroup { title: "Alerts"
                SToggle { key: "notifEnabled"; title: "Notifications" }
                SChoice { key: "notifScope"; title: "Notify me about"; options: [["all", "Everything"], ["dm_mentions", "Direct messages and mentions"], ["favorites", "Pinned chats and mentions"]] }
                SChoice { key: "notifDirectMode"; title: "Direct messages"; options: [["all", "All"], ["mentions", "Mentions only"], ["none", "None"]] }
                SChoice { key: "notifGroupMode"; title: "Groups"; options: [["all", "All"], ["mentions", "Mentions only"], ["none", "None"]] }
                SChoice { key: "notifPreview"; title: "What it shows"; options: [["full", "Sender and message"], ["sender", "Sender only"], ["hidden", "Nothing"]] }
                SToggle { key: "notifSound"; title: "Sound" }
                SList { key: "notifKeywords"; title: "Keywords"; hint: "Words that always alert you, even from muted chats"; placeholder: "Add a word" }
                SChoice { key: "notifBadge"; title: "Count on the tray icon"; options: [["unmuted", "Unmuted chats"], ["all", "All chats"], ["off", "Off"]] }
            }
            SGroup { title: "Quiet hours"
                SToggle { key: "quietHoursEnabled"; title: "Quiet hours"; hint: "Alerts still show, without sound" }
                SSlider { key: "quietStartMin"; title: "From"; from: 0; to: 1425; step: 15; suffix: " min after midnight" }
                SSlider { key: "quietEndMin"; title: "Until"; from: 0; to: 1425; step: 15; suffix: " min after midnight" }
                SToggle { key: "notifQuietBreakThrough"; title: "Pinned chats and mentions can still make a sound" }
            }
            SGroup { title: "Do not disturb"
                SAction { title: settings.dndUntil > Date.now() ? "On until " + new Date(settings.dndUntil).toLocaleTimeString(Qt.locale(), "h:mm AP") : "Off"; hint: "No alerts for a while"; button: settings.dndUntil > Date.now() ? "Turn off" : "For 1 hour"
                    onClicked: settings.set("dndUntil", settings.dndUntil > Date.now() ? 0 : Date.now() + 3600000) }
            }
            SGroup { title: "Per chat"; footer: "Set a chat's own rules from its info panel."
            }
        }
    }
    Component { id: bridges
        SGroup { Layout.fillWidth: true
            SGroup { title: "Accounts"
                SAction { title: "Connect and disconnect your chat apps"; hint: "WhatsApp, Signal, Google Messages and the others"; button: "Open"; onClicked: { dlg.close(); dlg.accountsRequested() } }
            }
            SGroup { title: "Hide networks"; footer: "Hidden networks' chats stay out of the list and the counts."
                Repeater { model: ["whatsapp", "signal", "gmessages", "discord", "telegram", "instagram", "messenger", "irc", "msteams", "gvoice"]
                    delegate: RowLayout { Layout.fillWidth: true
                        Label { text: N.meta(modelData).label; color: look.text; Layout.fillWidth: true }
                        PSwitch { checked: (settings.hiddenNetworks || []).indexOf(modelData) >= 0; onToggled: { const l = (settings.hiddenNetworks || []).filter(x => x !== modelData); if (checked) l.push(modelData); settings.set("hiddenNetworks", l) } } } }
            }
        }
    }
    Component { id: labels
        SGroup { Layout.fillWidth: true
            SGroup { title: "Your labels"; footer: "Add a label to a chat from its menu. Labels appear as tabs above the list."
                Repeater { model: core.labels
                    delegate: RowLayout { Layout.fillWidth: true; spacing: 8
                        Label { text: modelData; color: look.text; Layout.fillWidth: true }
                        Label { text: core.labelCount(modelData) + (core.labelCount(modelData) === 1 ? " chat" : " chats"); color: look.muted; font.pixelSize: 12 }
                        Button { text: "Rename"; onClicked: { renameLabel.old = modelData; renameField.text = modelData; renameLabel.open() } }
                        Button { text: "Delete"; onClicked: core.deleteLabel(modelData) } } }
                Label { visible: core.labels.length === 0; text: "No labels yet."; color: look.muted }
            }
        }
    }
    Component { id: media
        SGroup { Layout.fillWidth: true
            SGroup { title: "GIF search"; footer: "GIF search needs your own free key from GIPHY or Klipy."
                SText { table: "gifKeys"; key: "giphy"; title: "GIPHY key"; secret: true }
                SText { table: "gifKeys"; key: "klipy"; title: "Klipy key"; secret: true }
            }
        }
    }
    Component { id: privacy
        SGroup { Layout.fillWidth: true
            SGroup { title: "Encryption"
                SAction { title: "Restore old messages"; hint: "Enter your recovery key to read messages from before this device was added"; button: "Enter key"; onClicked: { dlg.close(); dlg.restoreRequested() } }
            }
            SGroup { title: "Privacy"
                SToggle { key: "sendReadReceipts"; title: "Send read receipts" }
                SToggle { key: "sendTyping"; title: "Send typing indicators" }
                SToggle { key: "linkPreviews"; title: "Link previews"; hint: "Your server looks the link up for you" }
            }
        }
    }
    Component { id: shortcuts
        SGroup { Layout.fillWidth: true
            SGroup { title: "Shortcuts"; footer: "Click Change, then press the keys you want."
                Repeater { model: SC.ALL
                    delegate: RowLayout { Layout.fillWidth: true; spacing: 8
                        Label { text: modelData.label; color: look.text; Layout.fillWidth: true; wrapMode: Text.Wrap }
                        Label { text: SC.keysFor(modelData.id, settings.shortcuts); color: look.muted; font.family: "monospace"; font.pixelSize: 12 }
                        Button { text: "Change"; onClicked: { capture.id = modelData.id; capture.label = modelData.label; capture.open() } }
                        Button { text: "Reset"; visible: !!(settings.shortcuts || {})[modelData.id]; onClicked: { const t = Object.assign({}, settings.shortcuts); delete t[modelData.id]; settings.set("shortcuts", t) } } } }
            }
        }
    }
    Component { id: system
        SGroup { Layout.fillWidth: true
            SGroup { title: "Time and motion"
                SChoice { key: "timeFormat"; title: "Time format"; options: [["system", "System"], ["12", "12-hour"], ["24", "24-hour"]] }
                SToggle { key: "reduceMotion"; title: "Reduce motion"; hint: "Less animation" }
                SToggle { key: "fancyMotion"; title: "Small animations" }
                SToggle { key: "hideStories"; title: "Hide Stories"; hint: "WhatsApp status updates" }
                SToggle { key: "greetings"; title: "Silly hello when Pager opens" }
            }
        }
    }
    Component { id: desktop
        SGroup { Layout.fillWidth: true
            SGroup { title: "On this computer"
                SToggle { key: "closeToTray"; title: "Keep running in the tray"; hint: "Closing the window leaves Pager running so messages still reach you" }
                SToggle { key: "startMinimized"; title: "Start in the tray" }
                RowLayout { Layout.fillWidth: true
                    Label { text: "Start Pager when I log in"; color: look.text; Layout.fillWidth: true }
                    PSwitch { checked: files.autostart(); onToggled: { files.setAutostart(checked); settings.set("launchAtLogin", checked) } } }
            }
        }
    }
    Component { id: adminPage
        SGroup { Layout.fillWidth: true
            SGroup { title: "Server"
                SAction { title: "Accounts, bridges and signups"; hint: "Manage your Pager server"; button: "Open"; onClicked: { dlg.close(); dlg.adminRequested() } } }
        }
    }
    Component { id: storage
        SGroup { Layout.fillWidth: true
            SGroup { title: "Settings backup"
                SAction { title: "Export settings"; hint: "Save your settings to a file"; button: "Export…"; onClicked: exportDialog.open() }
                SAction { title: "Import settings"; hint: "Load settings saved with Export"; button: "Import…"; onClicked: importDialog.open() }
                SAction { title: "Reset all settings"; hint: "Back to how Pager starts"; button: "Reset…"; danger: true; onClicked: resetConfirm.open() }
                Label { visible: dlg.note.length > 0; text: dlg.note; color: look.accent; Layout.fillWidth: true; wrapMode: Text.Wrap }
            }
        }
    }
    Component { id: advanced
        SGroup { Layout.fillWidth: true
            SGroup { title: "Reload"
                SAction { title: "Reload everything from the server"; hint: "Fixes a list that is missing something. Your messages stay on the server."; button: "Reload"; onClicked: { core.reloadEverything(); dlg.close() } }
            }
            SGroup { title: "Storage"
                SAction { title: "Downloaded pictures and files"; hint: files.humanSize(core.mediaCacheSize()) + " on this computer"; button: "Clear"; onClicked: { const n = core.clearMediaCache(); dlg.note = "Freed " + files.humanSize(n) } }
                Label { visible: dlg.note.length > 0; text: dlg.note; color: look.accent }
            }
            SGroup { title: "Developer"
                SToggle { key: "developerMode"; title: "Developer mode"; hint: "Show event ids and details" }
                Label { text: "Log file: " + core.logPath; color: look.muted; font.pixelSize: 12; Layout.fillWidth: true; wrapMode: Text.WrapAnywhere } }
        }
    }
    Component { id: starred
        SGroup { Layout.fillWidth: true
            SGroup { title: "Starred messages"
                Repeater { model: core.starred()
                    delegate: Rectangle { Layout.fillWidth: true; height: 64; radius: 10; color: sh.hovered ? look.panel2 : "transparent"; HoverHandler { id: sh }
                        Column { anchors.verticalCenter: parent.verticalCenter; x: 8; width: parent.width - 16; spacing: 1
                            Label { text: modelData.sender + " · " + modelData.chat; color: look.accent; font.pixelSize: 12; elide: Text.ElideRight; width: parent.width }
                            Label { text: modelData.text; color: look.text; elide: Text.ElideRight; width: parent.width }
                            Label { text: new Date(modelData.ts).toLocaleString(Qt.locale(), "MMM d, h:mm AP"); color: look.muted; font.pixelSize: 11 } }
                        TapHandler { onTapped: { dlg.close(); dlg.openMessage(modelData.roomId, modelData.eventId) } } } }
                Label { visible: core.starred().length === 0; text: "Star a message from its menu to keep it here."; color: look.muted }
            }
        }
    }
    Component { id: scheduledPage
        SGroup { Layout.fillWidth: true
            SGroup { title: "Scheduled messages"
                Repeater { model: core.scheduled()
                    delegate: RowLayout { Layout.fillWidth: true
                        Column { Layout.fillWidth: true; Label { text: "To " + modelData.chat; color: look.accent; font.pixelSize: 12 } Label { text: modelData.text; color: look.text; elide: Text.ElideRight; width: parent.width }
                            Label { text: new Date(modelData.whenMs).toLocaleString(Qt.locale(), "ddd MMM d, h:mm AP"); color: look.muted; font.pixelSize: 11 } }
                        Button { text: "Cancel"; onClicked: core.cancelScheduled(modelData.delayId) } } }
                Label { visible: core.scheduled().length === 0; text: "Nothing scheduled. Right-click the send button to schedule a message."; color: look.muted; wrapMode: Text.Wrap; Layout.fillWidth: true }
            }
            SGroup { title: "Reminders and snoozed chats"
                Repeater { model: core.reminders()
                    delegate: RowLayout { Layout.fillWidth: true
                        Column { Layout.fillWidth: true; Label { text: (modelData.snooze ? "Snoozed: " : "Reminder: ") + modelData.chat; color: look.text; elide: Text.ElideRight; width: parent.width }
                            Label { text: new Date(modelData.whenMs).toLocaleString(Qt.locale(), "ddd MMM d, h:mm AP"); color: look.muted; font.pixelSize: 11 } }
                        Button { text: "Cancel"; onClicked: core.cancelReminder(modelData.id) } } }
                Label { visible: core.reminders().length === 0; text: "No reminders."; color: look.muted }
            }
        }
    }
    Component { id: about
        SGroup { Layout.fillWidth: true
            SGroup { title: "Pager"
                Label { text: "Pager native " + core.appVersion + " · engine " + core.version; color: look.text }
                Label { text: "Signed in as " + core.user; color: look.muted }
                Label { text: "Server: " + core.server; color: look.muted; wrapMode: Text.WrapAnywhere; Layout.fillWidth: true }
            }
            SGroup { title: "Updates"
                RowLayout { Layout.fillWidth: true
                    ColumnLayout { Layout.fillWidth: true; spacing: 1
                        Label { Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.text
                            text: core.updateState === "available" ? "Pager " + core.updateVersion + " is available" : core.updateState === "checking" ? "Checking…" : core.updateState === "downloading" ? "Downloading… " + core.updateProgress + "%" : core.updateState === "installing" ? "Installing…" : "You have " + core.appVersion }
                        Label { visible: core.updateState === "available" && core.updateNotes.length > 0; Layout.fillWidth: true; wrapMode: Text.Wrap; text: core.updateNotes; color: look.muted; font.pixelSize: 12 }
                        Label { visible: core.updateMessage.length > 0; Layout.fillWidth: true; wrapMode: Text.Wrap; text: core.updateMessage; color: core.updateState === "error" ? look.danger : look.muted; font.pixelSize: 12 }
                        ProgressBar { visible: core.updateState === "downloading"; Layout.fillWidth: true; from: 0; to: 100; value: core.updateProgress } }
                    Button { visible: core.updateState === "available"; text: "Update now"; onClicked: core.installUpdate() }
                    Button { visible: core.updateState === "idle" || core.updateState === "error"; text: "Check for updates"; onClicked: core.checkForUpdates(false) } } }
            SGroup { title: "Account"
                Button { text: "Sign out"; onClicked: { dlg.close(); core.logout() } } }
        }
    }

    // =============================================================== small dialogs
    Dialog { id: renameLabel; property string old; modal: true; anchors.centerIn: Overlay.overlay; title: "Rename label"; standardButtons: Dialog.Cancel | Dialog.Ok; background: Rectangle { color: look.panel; radius: 12; border.color: look.line }
        TextField { id: renameField; width: 300; color: look.text; background: Rectangle { color: look.bg; radius: 8; border.color: look.line } }
        onAccepted: core.renameLabel(old, renameField.text) }
    Dialog { id: resetConfirm; modal: true; anchors.centerIn: Overlay.overlay; title: "Reset all settings?"; standardButtons: Dialog.Cancel | Dialog.Ok; background: Rectangle { color: look.panel; radius: 12; border.color: look.line }
        Label { text: "Everything goes back to how Pager starts."; color: look.text } onAccepted: { settings.reset(); dlg.note = "Settings reset." } }
    FileDialog { id: exportDialog; fileMode: FileDialog.SaveFile; currentFile: "file://" + files.downloadsDir() + "/pager-settings.json"; nameFilters: ["Settings (*.json)"]
        onAccepted: dlg.note = files.writeText(files.path(selectedFile), settings.exportJson()) ? "Saved." : "Couldn't save the file." }
    FileDialog { id: importDialog; nameFilters: ["Settings (*.json)", "All files (*)"]
        onAccepted: dlg.note = settings.importJson(files.readText(files.path(selectedFile))) ? "Settings imported." : "That isn't a Pager settings file." }
    Dialog { id: capture; property string id; property string label; modal: true; anchors.centerIn: Overlay.overlay; title: "Press the new keys"; standardButtons: Dialog.Cancel; background: Rectangle { color: look.panel; radius: 12; border.color: look.line }
        onOpened: grab.forceActiveFocus()
        Item { id: grab; width: 320; height: 80; focus: true
            Label { anchors.centerIn: parent; text: capture.label + "\\n(Esc to cancel)"; horizontalAlignment: Text.AlignHCenter; color: look.text }
            Keys.onPressed: (e) => { if (e.key === Qt.Key_Escape) { capture.close(); return } const k = SC.describe(e.key, e.modifiers, e.text); if (!k.length) return
                const t = Object.assign({}, settings.shortcuts); t[capture.id] = k; settings.set("shortcuts", t); e.accepted = true; capture.close() } } }
}
