import QtQuick
import QtQuick.Controls
import QtQuick.Dialogs
import QtQuick.Layouts
import Pager.Items
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

    // id, title, hint, icon, tint, group: grouped and tinted like the web app's settings home
    readonly property var pages: [
        ["appearance", "Appearance", "Theme, colors, text size, bubbles", "palette", "#8e6cf0", "Yours"], ["layout", "Inbox & layout", "Tabs, pins, density, what's shown", "sliders-horizontal", "#3b82f6", "Yours"],
        ["chats", "Pages", "Sending, reading, privacy, media", "message-square", "#10b981", "Yours"], ["notifications", "Notifications", "Previews, scope, quiet hours", "bell", "#ef4444", "Yours"],
        ["shortcuts", "Keyboard shortcuts", "See and change every shortcut", "keyboard", "#6366f1", "Yours"],
        ["labels", "Labels", "Organize pages into folders", "tag", "#f59e0b", "Extras"], ["starred", "Starred messages", "", "star", "#f59e0b", "Extras"], ["scheduled", "Scheduled & reminders", "", "hourglass", "#f97316", "Extras"],
        ["media", "Stickers & GIFs", "Your stickers, GIF search", "smile", "#ec4899", "Extras"],
        ["bridges", "Bridges & accounts", "Connected apps and their status", "link", "#0ea5e9", "System"], ["privacy", "Privacy & encryption", "Recovery key, receipts, typing, previews", "lock", "#64748b", "System"],
        ["system", "System", "Time, motion, stories, greeting", "sliders-horizontal", "#0d9488", "System"], ["desktop", "Desktop", "Tray, startup, zoom", "monitor", "#0d9488", "System"],
        ["admin", "Admin", "Profiles, bridges, signups", "shield-check", "#dc2626", "System"], ["storage", "Backup & reset", "Export, import, reset", "hard-drive", "#14b8a6", "System"],
        ["advanced", "Advanced", "Developer tools", "code-xml", "#475569", "System"], ["about", "About", "Version, server, sign out", "info", "#6b7280", ""]
    ]
    property string find: ""
    FileDialog { id: photoPick; title: "Choose a wallpaper photo"; nameFilters: ["Pictures (*.png *.jpg *.jpeg *.webp *.bmp)"]
        onAccepted: { const f = files.importWallpaper(String(selectedFile), core.dataDir()); if (f.length) { settings.set("wallpaperPhoto", f); settings.set("wallpaper", "custom") } } }
    FileDialog { id: stickerAdder; title: "Add stickers"; fileMode: FileDialog.OpenFiles; nameFilters: ["Pictures (*.png *.jpg *.jpeg *.gif *.webp)"]; onAccepted: core.addStickers(selectedFiles.map(u => String(u))) }
    readonly property var visiblePages: pages.filter(p => (p[0] !== "admin" || core.isAdmin) && (find.length === 0 || (p[1] + " " + p[2]).toLowerCase().indexOf(find.toLowerCase()) >= 0))

    function openPage(id) { find = ""; findField.text = ""; for (let i = 0; i < visiblePages.length; i++) if (visiblePages[i][0] === id) { page = i; showingList = false; break } open() }
    onAboutToShow: { if (!narrow) showingList = false; note = "" }

    header: Rectangle {
        color: "transparent"; implicitHeight: 56
        IconButton { visible: dlg.narrow && !dlg.showingList; x: 6; anchors.verticalCenter: parent.verticalCenter; ico: "chevron-left"; onClicked: dlg.showingList = true }
        Label { x: dlg.narrow && !dlg.showingList ? 52 : 20; anchors.verticalCenter: parent.verticalCenter; text: dlg.narrow && !dlg.showingList ? dlg.visiblePages[dlg.page][1] : "Settings"; color: look.text; font.pixelSize: Math.round(20 * look.textScale); font.weight: Font.Bold }
        IconButton { anchors.right: parent.right; anchors.rightMargin: 8; anchors.verticalCenter: parent.verticalCenter; ico: "x"; onClicked: dlg.close() }
        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: look.line }
    }

    contentItem: RowLayout {
        spacing: 0
        // ---- the list of pages
        ColumnLayout {
            visible: !dlg.narrow || dlg.showingList
            Layout.preferredWidth: dlg.narrow ? dlg.width : 300; Layout.fillHeight: true; spacing: 0
            Rectangle { Layout.fillWidth: true; Layout.margins: 12; Layout.bottomMargin: 4; implicitHeight: 40; radius: 20; color: look.panel2
                Row { anchors.fill: parent; anchors.leftMargin: 14; spacing: 8
                    Icon { anchors.verticalCenter: parent.verticalCenter; name: "search"; size: 17; color: look.muted }
                    TextField { id: findField; width: parent.width - 40; height: parent.height; placeholderText: "Search settings"; background: Item { } leftPadding: 0; color: look.text; placeholderTextColor: look.muted; onTextChanged: { dlg.find = text; dlg.page = 0 } } } }
            ListView {
                id: nav
                Layout.fillWidth: true; Layout.fillHeight: true; clip: true; model: dlg.visiblePages; boundsBehavior: Flickable.StopAtBounds
                ScrollBar.vertical: ScrollBar { }
                SmoothWheel { view: nav }
                delegate: Column {
                    readonly property bool firstOfGroup: index === 0 || dlg.visiblePages[index - 1][5] !== modelData[5]
                    width: nav.width
                    Label { visible: firstOfGroup && modelData[5].length > 0 && dlg.find.length === 0; text: modelData[5]; color: look.accent; font.pixelSize: Math.round(12 * look.textScale); font.weight: Font.Bold; font.capitalization: Font.AllUppercase; font.letterSpacing: 0.7; leftPadding: 18; topPadding: 12; bottomPadding: 4 }
                    Item { visible: firstOfGroup && modelData[5].length === 0 && dlg.find.length === 0; width: 1; height: 8 }
                    Rectangle {
                        width: parent.width - 16; x: 8; height: 54; radius: 12; color: dlg.page === index && !dlg.narrow ? Qt.rgba(look.accent.r, look.accent.g, look.accent.b, 0.16) : (hv.hovered ? look.panel2 : "transparent")
                        HoverHandler { id: hv; cursorShape: Qt.PointingHandCursor }
                        Row { anchors.verticalCenter: parent.verticalCenter; x: 10; spacing: 12
                            Rectangle { width: 34; height: 34; radius: 10; color: modelData[4]; anchors.verticalCenter: parent.verticalCenter; Icon { anchors.centerIn: parent; name: modelData[3]; size: 18; color: "white" } }
                            Column { anchors.verticalCenter: parent.verticalCenter; spacing: 1; width: nav.width - 100
                                Label { text: modelData[1]; color: look.text; font.pixelSize: Math.round(14 * look.textScale); font.weight: Font.DemiBold; elide: Text.ElideRight; width: parent.width }
                                Label { visible: modelData[2].length > 0; text: modelData[2]; color: look.muted; font.pixelSize: Math.round(11 * look.textScale); elide: Text.ElideRight; width: parent.width } } }
                        Icon { anchors.right: parent.right; anchors.rightMargin: 10; anchors.verticalCenter: parent.verticalCenter; visible: dlg.narrow; name: "chevron-right"; size: 16; color: look.muted }
                        TapHandler { onTapped: { dlg.page = index; dlg.showingList = false } }
                    }
                }
            }
        }
        Rectangle { visible: !dlg.narrow; Layout.fillHeight: true; width: 1; color: look.line }
        // ---- the page
        ScrollView {
            id: scroll
            background: Rectangle { color: look.bg }
            visible: !dlg.narrow || !dlg.showingList
            Layout.fillWidth: true; Layout.fillHeight: true; clip: true; contentWidth: availableWidth
            Loader {
                width: Math.min(scroll.availableWidth - 32, 760); x: Math.max(16, (scroll.availableWidth - width) / 2); y: 4
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
        SGroup { plain: true; Layout.fillWidth: true
            SGroup { title: "Theme"
                SBlock {
                    Label { text: "Mode"; color: look.text }
                    Flow { Layout.fillWidth: true; spacing: 6
                        Repeater { model: [["system", "Follow system"], ["light", "Light"], ["dark", "Dark"], ["black", "Black (AMOLED)"]]
                            delegate: Rectangle { height: 32; width: ml.implicitWidth + 24; radius: 16; color: look.palette === "" && look.mode === modelData[0] ? look.accent : look.panel2
                                Label { id: ml; anchors.centerIn: parent; text: modelData[1]; color: look.palette === "" && look.mode === modelData[0] ? look.accentInk : look.text; font.pixelSize: Math.round(13 * look.textScale) }
                                TapHandler { onTapped: look.setMode(modelData[0]) } } } }
                    Label { text: "Accent colour"; color: look.text }
                    Flow { Layout.fillWidth: true; spacing: 8
                        Repeater { model: look.accents()
                            delegate: Rectangle { width: 34; height: 34; radius: 17; color: modelData.color; border.width: look.palette === "" && look.accentName === modelData.name ? 3 : 0; border.color: look.text; TapHandler { onTapped: look.setAccent(modelData.name) } } }
                        TextField { width: 110; height: 34; placeholderText: "#rrggbb"; maximumLength: 7; color: look.text; placeholderTextColor: look.muted; background: Rectangle { radius: 17; color: look.panel2 }
                            onTextEdited: if (/^#[0-9a-fA-F]{6}$/.test(text)) look.setAccent(text) } }
                    RowLayout { Layout.fillWidth: true
                        ColumnLayout { Layout.fillWidth: true; spacing: 0
                            Label { text: "Ready-made looks"; color: look.text }
                            Label { Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.muted; font.pixelSize: Math.round(12 * look.textScale); text: "A whole colour set for the app, in every colour: on white, on black, or solid. Choose “Mode and accent” to go back to your own mix." } }
                        Button { text: look.palette === "" ? "✓ Mode and accent" : "Mode and accent"; flat: true; onClicked: look.setPalette("none") } }
                    Flow { Layout.fillWidth: true; spacing: 8
                        Repeater { model: look.palettes()
                            delegate: Rectangle { width: 38; height: 38; radius: 10; color: modelData.bg; border.width: look.palette === modelData.id ? 3 : 1; border.color: look.palette === modelData.id ? look.text : modelData.line
                                Rectangle { anchors.right: parent.right; anchors.bottom: parent.bottom; width: 20; height: 20; radius: 10; color: modelData.accent; anchors.margins: 4 }
                                ToolTip.visible: ph.hovered; ToolTip.text: modelData.name; HoverHandler { id: ph } TapHandler { onTapped: look.setPalette(modelData.id) } } } }
                }
            }
            SGroup { title: "Message bubbles"
                SBlock { BubblePreview { Layout.fillWidth: true } }
                SCollapse { title: "Incoming"
                    SToggle { key: "bubbleNative"; title: "Use native colors"; hint: "Each network's own colour" }
                    SBlock { Label { text: "Light"; color: look.accent; font.weight: Font.Bold; font.pixelSize: Math.round(12 * look.textScale) } }
                    SColor { key: "bubbleTheirs"; title: "Color" } SColor { key: "bubbleTheirsText"; title: "Text color" }
                    SBlock { Label { text: "Dark"; color: look.accent; font.weight: Font.Bold; font.pixelSize: Math.round(12 * look.textScale) } }
                    SColor { key: "bubbleTheirsDark"; title: "Color" } SColor { key: "bubbleTheirsTextDark"; title: "Text color" }
                    SChoice { key: "bubbleStyle"; title: "Bubble shape"; options: [["round", "Rounded"], ["curved", "Curved tail"], ["tail", "Pointed tail"], ["outline", "Outlined"]] }
                    SSlider { key: "bubbleRadius"; title: "Corner radius (0 = default)"; from: 0; to: 24; step: 1 }
                    SChoice { key: "bubbleBorder"; title: "Border style"; options: [["none", "None"], ["solid", "Solid"], ["dotted", "Dotted"], ["dashed", "Dashed"], ["thick", "Thick"], ["edge", "Bottom edge"], ["dashdot", "Dash dot"]] }
                    SColor { visible: settings.bubbleBorder !== "none"; key: "bubbleBorderColor"; title: "Border color" }
                }
                SCollapse { title: "Outgoing"
                    SBlock { Label { text: "Light"; color: look.accent; font.weight: Font.Bold; font.pixelSize: Math.round(12 * look.textScale) } }
                    SColor { key: "bubbleMine"; title: "Color" } SColor { key: "bubbleMineText"; title: "Text color" }
                    SBlock { Label { text: "Dark"; color: look.accent; font.weight: Font.Bold; font.pixelSize: Math.round(12 * look.textScale) } }
                    SColor { key: "bubbleMineDark"; title: "Color" } SColor { key: "bubbleMineTextDark"; title: "Text color" }
                    SChoice { key: "outStyle"; title: "Bubble shape"; options: [["", "Same as incoming"], ["round", "Rounded"], ["curved", "Curved tail"], ["tail", "Pointed tail"], ["outline", "Outlined"]] }
                    SSlider { key: "outRadius"; title: "Corner radius (-1 = same as incoming)"; from: -1; to: 24; step: 1 }
                    SChoice { key: "outBorder"; title: "Border style"; options: [["", "Same as incoming"], ["none", "None"], ["solid", "Solid"], ["dotted", "Dotted"], ["dashed", "Dashed"], ["thick", "Thick"], ["edge", "Bottom edge"], ["dashdot", "Dash dot"]] }
                    SColor { key: "outBorderColor"; title: "Border color" }
                    SChoice { key: "bubbleFill"; title: "Fill"; hint: "How your own messages are coloured"; options: [["solid", "Solid"], ["gradient", "Gradient"], ["tinted", "Soft tint"], ["glass", "Glass"]] }
                }
                SChoice { key: "bubbleDepth"; title: "Depth"; options: [["flat", "Flat"], ["soft", "Soft shadow"], ["raised", "Raised"]] }
                SSlider { key: "bubbleWidth"; title: "Widest bubble (0 = default)"; hint: "Percent of the chat"; from: 0; to: 95; step: 5; suffix: " %" }
                SChoice { key: "messageAnimation"; title: "Message animation"; hint: "When a new message appears"; options: [["none", "None"], ["pop", "Pop"], ["slide", "Slide"], ["fade", "Fade"]] }
                SAction { title: "Reset message bubbles"; hint: "Undo all bubble color and shape changes made here"; button: "Reset"; danger: true
                    onClicked: { for (const k of ["bubbleFill", "bubbleBorder", "bubbleBorderColor", "outStyle", "outBorder", "outBorderColor", "bubbleMine", "bubbleTheirs", "bubbleMineDark", "bubbleTheirsDark", "bubbleMineText", "bubbleTheirsText", "bubbleMineTextDark", "bubbleTheirsTextDark"]) settings.set(k, "")
                        settings.set("bubbleStyle", "round"); settings.set("bubbleFill", "solid"); settings.set("bubbleBorder", "none"); settings.set("bubbleDepth", "soft"); settings.set("bubbleRadius", 0); settings.set("outRadius", -1); settings.set("bubbleWidth", 0); settings.set("bubbleNative", false) } }
            }
            SGroup { title: "Wallpaper"; footer: "Made in the app, so there is nothing to download. Your own photo stays on this device and is shrunk to save memory."
                SBlock {
                    Flow { Layout.fillWidth: true; spacing: 8
                        Repeater { model: files.wallpapers()
                            delegate: Rectangle { width: 92; height: 64; radius: 12; color: look.panel2; clip: true; border.width: settings.wallpaper === modelData.id ? 3 : 1; border.color: settings.wallpaper === modelData.id ? look.accent : look.line
                                Wallpaper { anchors.fill: parent; anchors.margins: 1; wallpaper: modelData.id; dark: look.dark; bg: look.bg }
                                Label { anchors.left: parent.left; anchors.bottom: parent.bottom; anchors.margins: 6; text: modelData.name; color: look.text; font.pixelSize: 11; font.weight: Font.Medium; style: Text.Outline; styleColor: Qt.rgba(look.bg.r, look.bg.g, look.bg.b, 0.8) }
                                TapHandler { onTapped: settings.set("wallpaper", modelData.id) } HoverHandler { cursorShape: Qt.PointingHandCursor } } }
                        Rectangle { width: 92; height: 64; radius: 12; color: look.panel2; clip: true; border.width: settings.wallpaper === "custom" ? 3 : 1; border.color: settings.wallpaper === "custom" ? look.accent : look.line
                            Wallpaper { anchors.fill: parent; anchors.margins: 1; visible: settings.wallpaperPhoto.length > 0; wallpaper: "custom"; photo: settings.wallpaperPhoto; bg: look.bg }
                            Label { anchors.centerIn: parent; visible: settings.wallpaperPhoto.length === 0; text: "Add photo…"; color: look.muted; font.pixelSize: 11 }
                            TapHandler { onTapped: settings.wallpaperPhoto.length ? settings.set("wallpaper", "custom") : photoPick.open() } HoverHandler { cursorShape: Qt.PointingHandCursor } }
                    }
                }
                SAction { title: "Your own photo"; hint: settings.wallpaperPhoto.length ? "Saved on this device" : "Pick a picture from your computer"; button: settings.wallpaperPhoto.length ? "Change…" : "Choose…"; onClicked: photoPick.open() }
                SAction { visible: settings.wallpaperPhoto.length > 0; title: "Remove your photo"; button: "Remove"; danger: true; onClicked: { settings.set("wallpaperPhoto", ""); if (settings.wallpaper === "custom") settings.set("wallpaper", "none") } }
                SSlider { key: "wallpaperDim"; title: "Darken"; hint: settings.wallpaperDim ? "" : "Off"; from: 0; to: 70; step: 5; suffix: " %" }
            }
            SGroup { title: "Screen effects"
                SToggle { key: "screenEffects"; title: "Screen effects"; hint: "Confetti, balloons and more play when a message says something like “congrats”, “happy birthday” or “I love you”. Nothing extra is sent." }
            }
            SGroup { title: "Size & font"
                SChoice { key: "uiScale"; title: "App size"; hint: "Makes everything bigger or smaller, not only the text"; options: [["small", "Small"], ["medium", "Medium"], ["large", "Large"]] }
                SChoice { key: "fontFamily"; title: "Font"; options: [["system", "System"], ["serif", "Serif"], ["rounded", "Rounded"], ["humanist", "Humanist"], ["mono", "Monospace"], ["sf", "iPhone style"], ["googlesans", "Google style"], ["roboto", "Roboto"], ["readable", "Easy to read"]] }
            }
            SGroup { title: "Text & messages"
                SChoice { key: "reactionStyle"; title: "Reactions"; options: [["filled", "Filled"], ["outline", "Outline"]] }
                SToggle { key: "deleteAtSource"; title: "Delete on the other network too"; hint: "When you delete a chat in Pager, also delete it on Signal, WhatsApp or Google Messages. It can't be undone, so you are asked each time" }
                SSlider { key: "fontScale"; title: "Text size"; from: 0.85; to: 1.4; step: 0.05; suffix: "×"; decimals: 2 }
                SChoice { key: "avatarShape"; title: "Avatar shape"; options: [["circle", "Circle"], ["squircle", "Rounded square"]] }
                SToggle { key: "colorSenderNames"; title: "Color sender names in groups" }
                SToggle { key: "largeEmoji"; title: "Large emoji"; hint: "Emoji-only messages are shown big" }
            }
            SGroup { title: "Reactions"; footer: "Quick reactions are the emoji shown when you react to a message."
                SList { key: "quickReactions"; title: "Quick reactions"; hint: "The row of emoji that appears when you react to a message"; emojiPicker: true }
                SToggle { key: "doubleTapReact"; title: "Double-click to react"; hint: "Double-click a message to add " + (settings.doubleTapEmoji || "👍") }
                SToggle { key: "swipeToReply"; title: "Swipe to reply"; hint: "Swipe a message to the right (touch screens, or two fingers on a trackpad)" }
            }
        }
    }
    Component { id: layout
        SGroup { plain: true; Layout.fillWidth: true
            SGroup { title: "Inbox"
                SChoice { key: "inboxStyle"; title: "Inbox style"; options: [["pro", "Pro: unread counts and network badges"], ["minimal", "Minimal: titles only"]] }
                SChoice { key: "defaultTab"; title: "Default tab"; options: [["inbox", "Inbox"], ["unread", "Unread"]] }
                SToggle { key: "showPinsRow"; title: "Pinned pages row"; hint: "Pinned pages sit above the list as circles" }
                SToggle { key: "sortUnreadFirst"; title: "Unread pages first"; hint: "Unread above read, newest first" }
                SToggle { key: "showFilterBar"; title: "Show filter bar" }
                SToggle { key: "showLabelsInFilterBar"; title: "Show labels in the filter bar"; enabled: settings.showFilterBar }
            }
            SGroup { title: "Page list"
                SChoice { key: "density"; title: "Density"; options: [["comfortable", "Comfortable"], ["compact", "Compact"]] }
                SChoice { key: "rowAction1"; title: "Hover action 1"; hint: "Quick button when you point at a page"; options: [["none", "Nothing"], ["read", "Mark read / unread"], ["archive", "Archive"], ["pin", "Pin"], ["mute", "Mute"], ["low", "Low priority"], ["snooze", "Snooze 3 hours"]] }
                SChoice { key: "rowAction2"; title: "Hover action 2"; options: [["none", "Nothing"], ["read", "Mark read / unread"], ["archive", "Archive"], ["pin", "Pin"], ["mute", "Mute"], ["low", "Low priority"], ["snooze", "Snooze 3 hours"]] }
                SSlider { key: "sidebarWidth"; title: "Sidebar width"; from: 240; to: 640; step: 10; suffix: " px" }
                SToggle { key: "showAvatars"; title: "Show avatars" }
                SToggle { key: "showNetworkBadges"; title: "Show network badges"; hint: "The small WhatsApp / Signal icon on avatars" }
                SToggle { key: "showNetworkNameInRows"; title: "Show network name"; hint: "Under each page name" }
                SToggle { key: "showPreviews"; title: "Show message previews" }
            }
            SGroup { title: "Conversation"
                SToggle { key: "showMessageTimes"; title: "Show message times" }
                SToggle { key: "showReadTicks"; title: "Show delivery & read ticks" }
            }
        }
    }
    Component { id: chats
        SGroup { plain: true; Layout.fillWidth: true
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
        SGroup { plain: true; Layout.fillWidth: true
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
        SGroup { plain: true; Layout.fillWidth: true
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
        SGroup { plain: true; Layout.fillWidth: true
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
        SGroup { plain: true; Layout.fillWidth: true
            SGroup { title: "GIF search"; footer: "Add a free key from either (or both) and each gets its own tab in the GIF picker. Pager doesn't ship a shared key. Keys stay on this device."
                SText { table: "gifKeys"; key: "giphy"; title: "GIPHY"; hint: "developers.giphy.com"; secret: true }
                SText { table: "gifKeys"; key: "klipy"; title: "KLIPY"; hint: "partner.klipy.com"; secret: true }
            }
            SGroup { title: "My stickers"; footer: "Stickers are saved to your Matrix account, so they follow you to other devices."
                SAction { title: "Add stickers from images…"; button: "Add"; onClicked: stickerAdder.open() }
                SBlock { Label { text: core.stickerPacks().length && core.stickerPacks()[0].key === "user" ? core.stickerPacks()[0].stickers.length + " stickers" : "No stickers yet"; color: look.muted } }
            }
        }
    }
    Component { id: privacy
        SGroup { plain: true; Layout.fillWidth: true
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
        SGroup { plain: true; Layout.fillWidth: true
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
        SGroup { plain: true; Layout.fillWidth: true
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
        SGroup { plain: true; Layout.fillWidth: true
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
        SGroup { plain: true; Layout.fillWidth: true
            SGroup { title: "Server"
                SAction { title: "Accounts, bridges and signups"; hint: "Manage your Pager server"; button: "Open"; onClicked: { dlg.close(); dlg.adminRequested() } } }
        }
    }
    Component { id: storage
        SGroup { plain: true; Layout.fillWidth: true
            SGroup { title: "Settings backup"
                SAction { title: "Export settings"; hint: "Save your settings to a file"; button: "Export…"; onClicked: exportDialog.open() }
                SAction { title: "Import settings"; hint: "Load settings saved with Export"; button: "Import…"; onClicked: importDialog.open() }
                SAction { title: "Reset all settings"; hint: "Back to how Pager starts"; button: "Reset…"; danger: true; onClicked: resetConfirm.open() }
                Label { visible: dlg.note.length > 0; text: dlg.note; color: look.accent; Layout.fillWidth: true; wrapMode: Text.Wrap }
            }
        }
    }
    Component { id: advanced
        SGroup { plain: true; Layout.fillWidth: true
            SGroup { title: "Reload"
                SAction { title: "Reload everything from the server"; hint: "Fixes a list that is missing something. Your messages stay on the server."; button: "Reload"; onClicked: { core.reloadEverything(); dlg.close() } }
            }
            SGroup { title: "Storage"
                SAction { title: "Downloaded pictures and files"; hint: files.humanSize(core.mediaCacheSize()) + " on this computer"; button: "Clear"; onClicked: { const n = core.clearMediaCache(); dlg.note = "Freed " + files.humanSize(n) } }
                Label { visible: dlg.note.length > 0; text: dlg.note; color: look.accent }
            }
            SGroup { title: "Developer"
                SToggle { key: "developerMode"; title: "Developer mode"; hint: "Show event ids and details" }
                SToggle { key: "lowEnd"; title: "Low-end mode"; hint: "For an older computer: draws with the processor instead of the graphics chip, less memory. Takes effect after Pager restarts." }
                SToggle { key: "lowData"; title: "Low data"; hint: "Nothing downloads by itself and pictures are smaller" }
                Label { text: "Log file: " + core.logPath; color: look.muted; font.pixelSize: 12; Layout.fillWidth: true; wrapMode: Text.WrapAnywhere } }
        }
    }
    Component { id: starred
        SGroup { plain: true; Layout.fillWidth: true
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
        SGroup { plain: true; Layout.fillWidth: true
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
        SGroup { plain: true; Layout.fillWidth: true
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
