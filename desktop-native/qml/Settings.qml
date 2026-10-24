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
    height: Math.min(Qt.application.arguments.indexOf("--screenshot") >= 0 ? 4000 : 720, Overlay.overlay ? Overlay.overlay.height - 24 : 720)
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
    property string encNote: ""
    RecoveryKeyDialog { id: recoveryKeyDlg }
    KeyFileDialog { id: keyFileDlg }
    FileDialog { id: soundPick; title: "Choose a sound"; nameFilters: ["Sounds (*.wav *.mp3 *.ogg *.oga *.m4a *.flac *.opus)", "All files (*)"]
        onAccepted: { const f = files.importFile(String(selectedFile), core.dataDir(), "custom-sound"); if (f.length) { settings.set("customSoundPath", f); core.previewSound("custom", settings.notifSoundVolume) } } }
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
            SmoothWheel { view: scroll.contentItem as Flickable }
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
                SToggle { key: "screenEffects"; title: "Screen effects"; hint: "They play when a new message, sent or received, says one of these. Nothing extra is sent." }
                SBlock { Repeater { model: files.effectTriggers()
                    delegate: ColumnLayout { Layout.fillWidth: true; spacing: 0
                        Label { text: modelData.glyph + " " + modelData.name; color: look.text; font.weight: Font.DemiBold }
                        Label { text: modelData.says; color: look.muted; font.pixelSize: Math.round(12 * look.textScale); wrapMode: Text.Wrap; Layout.fillWidth: true }
                        Label { text: modelData.examples; color: look.muted; font.pixelSize: Math.round(12 * look.textScale); wrapMode: Text.Wrap; Layout.fillWidth: true } } } }
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
                SEmoji { key: "doubleTapEmoji"; title: "Double-click reaction"; hint: "Which reaction a double-click adds"; enabled: settings.doubleTapReact }
                SToggle { key: "tripleTapReact"; title: "Triple-click to react"; hint: "Triple-click a message to add " + (settings.tripleTapEmoji || "😂") }
                SEmoji { key: "tripleTapEmoji"; title: "Triple-click reaction"; hint: "Which reaction a triple-click adds"; enabled: settings.tripleTapReact }
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
            SGroup { title: "Sending"
                SToggle { key: "enterToSend"; title: "Enter key sends"; hint: "Off: Ctrl+Enter sends and Enter adds a new line" }
                SToggle { key: "markdown"; title: "Markdown formatting"; hint: "**bold**, _italic_, ~~strike~~ and `code` are sent as formatted text" }
                SToggle { key: "mentionSuggestions"; title: "Mention suggestions"; hint: "Type @ in a group to pick someone" }
            }
            SGroup { title: "Reading"
                SChoice { key: "markReadMode"; title: "Mark as read when"; options: [["open", "I open the page"], ["scrolled", "I reach the newest message"], ["manual", "I do it myself"]] }
                SToggle { key: "openAtUnread"; title: "Open at first unread"; hint: "Jump to the 'New messages' line" }
                SChoice { key: "groupGapMin"; title: "Message grouping"; options: [["1", "Within 1 minute"], ["5", "Within 5 minutes"], ["15", "Within 15 minutes"], ["60", "Within an hour"]] }
            }
            SGroup { title: "Privacy"
                SToggle { key: "sendReadReceipts"; title: "Send read receipts"; hint: "Off: others won't see when you've read their messages" }
                SToggle { key: "sendTyping"; title: "Send typing indicators" }
            }
            SGroup { title: "Media & links"
                SToggle { key: "linkPreviews"; title: "Link previews"; hint: "Your server fetches the page to build the preview" }
                SChoice { key: "autoDownload"; title: "Auto-download media"; options: [["always", "Always"], ["never", "Never (click to load)"]] }
                SToggle { key: "autoPlayGifs"; title: "Auto-play GIFs" }
            }
            SGroup { title: "Inbox behavior"
                SToggle { key: "unarchiveOnMessage"; title: "Unarchive on new message"; hint: "Archived pages come back when someone writes (unless muted)" }
                SToggle { key: "confirmDelete"; title: "Confirm before deleting" }
            }
        }
    }
    Component { id: notifications
        SGroup { plain: true; Layout.fillWidth: true
            SGroup { title: ""
                SToggle { key: "notifEnabled"; title: "Notifications"; hint: "Master switch for message alerts" }
                SToggle { key: "accountAlerts"; title: "Warn me when an account disconnects"; hint: "A notification when Google Messages, WhatsApp or another account loses its login"; enabled: settings.notifEnabled }
                SToggle { visible: core.isAdmin; key: "updateAlerts"; title: "Tell me when bridges update"; hint: "A notification after the weekly automatic update, and if one had to be put back"; enabled: settings.notifEnabled }
                SAction { title: "Send a test notification"; hint: "Check sound and how it looks"; button: "Test"; enabled: settings.notifEnabled; onClicked: core.testNotification() }
            }
            SGroup { title: "What to notify"; footer: "Muted and Low priority pages stay quiet except for @mentions, replies to your messages and your keywords."
                SChoice { key: "notifScope"; title: "Notify me about"; options: [["all", "Every message"], ["dm_mentions", "Direct messages and mentions"], ["favorites", "Pinned pages and mentions"]] }
                SChoice { key: "notifDirectMode"; title: "Direct messages"; options: [["all", "Every message"], ["mentions", "Mentions and replies only"], ["none", "Nothing"]] }
                SChoice { key: "notifGroupMode"; title: "Group pages"; options: [["all", "Every message"], ["mentions", "Mentions and replies only"], ["none", "Nothing"]] }
                SToggle { key: "notifGroupMentionsOnly"; title: "Groups: only when mentioned"; hint: "Group pages stay quiet unless someone @mentions you" }
            }
            SGroup { title: "Keywords"; footer: "A message with one of these words always notifies you, even in a muted page. Whole words only."
                SList { key: "notifKeywords"; title: "Add a keyword"; placeholder: "Your name, a nickname…" }
            }
            SGroup { title: "Appearance"
                SChoice { key: "notifPreview"; title: "Show"; options: [["full", "Name and message"], ["sender", "Name only"], ["hidden", "Hide content"]] }
                SToggle { key: "notifSound"; title: "Sound" }
                SChoice { key: "notifBadge"; title: "Unread badge counts"; hint: "The number on the app icon"; options: [["unmuted", "Pages that can notify me"], ["all", "Every unread page"], ["off", "Nothing"]] }
            }
            SGroup { title: "Sounds"; footer: "Muted and quiet-hours messages stay silent. A page can have its own sound in its info page."
                SToggle { key: "convoSounds"; title: "Sounds inside a page"; hint: "A little sound when you send or get a message in the page you have open" }
                SChoice { key: "sendSound"; title: "Send sound"; options: files.sounds(); onPicked: (v) => core.previewSound(v, settings.convoSoundVolume) }
                SChoice { key: "reactionSound"; title: "Reaction sound"; options: files.sounds(); onPicked: (v) => core.previewSound(v, settings.convoSoundVolume) }
                SChoice { key: "receiveSound"; title: "Receive sound"; options: files.sounds(); onPicked: (v) => core.previewSound(v, settings.convoSoundVolume) }
                SSlider { key: "convoSoundVolume"; title: "Page sound volume"; from: 0; to: 1; step: 0.05; decimals: 2 }
                SChoice { key: "notifSoundId"; title: "Alert sound"; options: files.sounds(); onPicked: (v) => core.previewSound(v, settings.notifSoundVolume) }
                SAction { title: "Your own sound"; hint: settings.customSoundPath.length ? "Using " + settings.customSoundPath.split("/").pop() + ". Choose “Your own sound” in a list above to use it." : "Pick an audio file (wav, mp3, ogg…), then choose “Your own sound” in a list above"; button: settings.customSoundPath.length ? "Change…" : "Choose…"; onClicked: soundPick.open() }
                SAction { visible: settings.customSoundPath.length > 0; title: "Remove your sound"; button: "Remove"; danger: true; onClicked: settings.set("customSoundPath", "") }
                SSlider { key: "notifSoundVolume"; title: "Volume"; from: 0; to: 1; step: 0.05; decimals: 2 }
            }
            SGroup { title: "Quiet hours"; footer: "Messages still arrive, silently."
                SToggle { key: "quietHoursEnabled"; title: "Quiet hours" }
                STime { visible: settings.quietHoursEnabled; key: "quietStartMin"; title: "From" }
                STime { visible: settings.quietHoursEnabled; key: "quietEndMin"; title: "Until" }
                SDays { visible: settings.quietHoursEnabled; key: "notifQuietDays"; title: "On these days" }
                SToggle { visible: settings.quietHoursEnabled; key: "notifQuietBreakThrough"; title: "Let important ones through"; hint: "Pinned pages, mentions, replies and keywords still make a sound" }
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
            SGroup { title: "Receipts"
                SToggle { key: "sendReadReceipts"; title: "Send read receipts" }
                SToggle { key: "sendTyping"; title: "Send typing indicators" }
            }
            SGroup { title: "Encryption"; footer: "Encrypted pages can only be read by your devices. The recovery key lets a new device read your history; Pager can't recover it for you."
                SAction { title: "Encryption on this device"; hint: core.encryption.device_id ? "Ready · device " + core.encryption.device_id : "Starting…"; button: "Refresh"; onClicked: core.refreshEncryption() }
                SAction { visible: !!core.encryption.fingerprint; title: "Device fingerprint"; hint: (core.encryption.fingerprint || "").replace(/(.{4})/g, "$1 ").trim(); button: "Copy"; onClicked: files.copy(core.encryption.fingerprint) }
                SAction { title: "Recovery key"; hint: core.encryption.backup_here ? "On: your message keys are backed up" : core.encryption.backup_on_server ? "A backup exists. Enter the recovery key to read your history here" : "Not set up yet"
                    button: core.encryption.backup_here ? "Replace" : core.encryption.backup_on_server ? "Enter key" : "Set up"
                    onClicked: { if (core.encryption.backup_on_server && !core.encryption.backup_here) { dlg.close(); dlg.restoreRequested() } else recoveryKeyDlg.open() } }
                SAction { visible: !!core.encryption.backup_on_server && !core.encryption.backup_here; title: "Make a new recovery key instead"; button: "New key"; onClicked: recoveryKeyDlg.open() }
                SAction { title: "Encrypt all my pages"; hint: dlg.encNote.length ? dlg.encNote : "Turns on encryption for every page that can take it. Older messages stay readable on your server"; button: "Encrypt…"; onClicked: encryptAllConfirm.open() }
                SAction { title: "Lost your recovery key?"; hint: core.encryption.backup_here ? "This device still has your keys: choose Replace above and it makes a new one" : "Use a key file below, or make a new key. Without either, older encrypted messages can't be read on this device"; button: "New key"; onClicked: recoveryKeyDlg.open() }
                SAction { title: "Advanced: save keys to a file"; hint: "Not your recovery key. A separate file you protect with a passphrase you choose"; button: "Save…"; onClicked: keyFileDlg.openFor(true) }
                SAction { title: "Advanced: restore keys from a file"; hint: "Only for a file made with the row above. Asks for that file's passphrase"; button: "Open…"; onClicked: keyFileDlg.openFor(false) }
            }
            SGroup { title: "Content"; footer: "Link previews are fetched by your own server, so the sites you link to never see your device."
                SToggle { key: "linkPreviews"; title: "Link previews" }
                SChoice { key: "notifPreview"; title: "Notification content"; options: [["full", "Name and message"], ["sender", "Name only"], ["hidden", "Hide content"]] }
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
            SGroup { title: "Easy on your connection and your machine"; footer: "Both are overrides: your own settings are not changed, so switching one off brings everything back."
                SToggle { key: "lowData"; title: "Low data mode"; hint: "For a slow or limited connection: nothing downloads until you tap it, GIFs don't play by themselves, link previews and typing indicators are off, pictures arrive at half size, and less runs in the background" }
                SToggle { key: "lowEnd"; title: "Low-end device mode"; hint: "For an older or slower computer: no blur or glass, no full-screen effects, no glowing or endlessly looping animations, and fewer messages kept in memory. Pager also draws with the processor instead of the graphics chip. Takes effect after Pager restarts." }
            }
            SGroup { title: "Time"
                SChoice { key: "timeFormat"; title: "Time format"; options: [["system", "Follow system"], ["12", "12-hour"], ["24", "24-hour"]] }
            }
            SGroup { title: "Motion"
                SToggle { key: "fancyMotion"; title: "Small animations"; hint: "Things slide, glide, glow, pop, breathe and fade a little. Off for none" }
                SToggle { key: "reduceMotion"; title: "Reduce motion"; hint: "Fewer animations" }
                SSlider { key: "scrollSpeed"; title: "Scroll speed"; hint: "How far the mouse wheel and touchpad move the lists"; from: 0.5; to: 4; step: 0.1; suffix: "×"; decimals: 1 }
            }
            SGroup { title: "Extras"
                SToggle { key: "hideStories"; title: "Hide Stories"; hint: "Removes the Stories row (WhatsApp status updates) from the list" }
                SToggle { key: "greetings"; title: "Silly hello"; hint: "The pager says something goofy when you open the app" }
            }
        }
    }
    Component { id: desktop
        SGroup { plain: true; Layout.fillWidth: true
            SGroup { title: "Window"
                SToggle { key: "closeToTray"; title: "Keep running in the tray when closed"; hint: "Closing the window hides Pager so messages keep arriving" }
                SBlock { RowLayout { Layout.fillWidth: true
                    Label { text: "Launch at login"; color: look.text; Layout.fillWidth: true }
                    PSwitch { checked: files.autostart(); onToggled: { files.setAutostart(checked); settings.set("launchAtLogin", checked) } } } }
                SToggle { key: "startMinimized"; title: "Start minimized to tray" }
            }
            SGroup { title: "Look"; footer: "Takes your colors from KDE Plasma or GNOME and follows them when you change them."
                SToggle { key: "themeFollowSystem"; title: "Match my system theme"; hint: "Light or dark follows your desktop" }
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
            SGroup { title: "Sync settings"; footer: "Choose which settings to copy between your computers and browsers. Nothing is copied unless you press the button."
                SAction { title: "Sync settings…"; hint: "Save from this device or load onto it"; button: "Open"; onClicked: syncDlg.openNow() }
            }
            SGroup { title: "Back up settings"; footer: "Saves every setting as a file, so you can load it on another device."
                SAction { title: "Export settings"; hint: "Save your settings to a file"; button: "Export…"; onClicked: exportDialog.open() }
                SAction { title: "Import settings"; hint: "Load settings saved with Export"; button: "Import…"; onClicked: importDialog.open() }
                SBlock { visible: dlg.note.length > 0; Label { text: dlg.note; color: look.accent; Layout.fillWidth: true; wrapMode: Text.Wrap } }
            }
            SGroup { title: "Reset"; footer: "Puts every setting back to its default. Your pages and accounts aren't touched."
                SAction { title: "Reset all settings"; button: "Reset…"; danger: true; onClicked: resetConfirm.open() }
            }
        }
    }
    Component { id: advanced
        SGroup { plain: true; Layout.fillWidth: true
            SGroup { title: "Sync"; footer: "Use this if a chat is missing, a message never showed up, or this device is out of step with your other devices. Your account and the server are not touched."
                SAction { title: "Reload everything from the server"; hint: "Forgets what this device saved and downloads your chats again"; button: "Reload"; onClicked: { core.reloadEverything(); dlg.close() } }
            }
            SGroup { title: "Storage"
                SAction { title: "Downloaded pictures and files"; hint: files.humanSize(core.mediaCacheSize()) + " on this computer"; button: "Clear"; onClicked: { const n = core.clearMediaCache(); dlg.note = "Freed " + files.humanSize(n) } }
                SBlock { visible: dlg.note.length > 0; Label { text: dlg.note; color: look.accent } }
            }
            SGroup { title: "Developer"; footer: "Adds event IDs and a 'Copy event ID' action to messages."
                SToggle { key: "developerMode"; title: "Developer mode" }
                SBlock { Label { text: "Log file: " + core.logPath; color: look.muted; font.pixelSize: 12; Layout.fillWidth: true; wrapMode: Text.WrapAnywhere } }
            }
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
    Dialog {
        id: syncDlg
        property var saved: ({}); property bool ready: false; property var saveIds: []; property var loadIds: []; property string msg: ""
        function openNow() { saveIds = []; loadIds = []; msg = ""; ready = false; saved = ({}); core.fetchSyncedSettings(); open() }
        Connections { target: core
            function onSyncFetched(info) { syncDlg.saved = info; syncDlg.ready = true }
            function onSyncSaved(err) { syncDlg.msg = err.length ? err : "Saved."; if (!err.length) { syncDlg.saveIds = []; core.fetchSyncedSettings() } } }
        modal: true; anchors.centerIn: Overlay.overlay; width: Math.min(480, Overlay.overlay ? Overlay.overlay.width - 32 : 480); height: Math.min(640, Overlay.overlay ? Overlay.overlay.height - 40 : 640); title: "Sync settings"; standardButtons: Dialog.Close
        background: Rectangle { color: look.panel; radius: 14; border.color: look.line }
        component Pick: Repeater { id: rep; property var picked; signal flip(string id); property var only: null
            delegate: CheckBox { visible: !rep.only || rep.only.indexOf(modelData.id) >= 0; height: visible ? implicitHeight : 0; text: modelData.label + "  ·  " + modelData.hint; checked: rep.picked.indexOf(modelData.id) >= 0; onToggled: rep.flip(modelData.id) } }
        contentItem: ScrollView { id: syncScroll; clip: true; contentWidth: availableWidth
            SmoothWheel { view: syncScroll.contentItem as Flickable }
            ColumnLayout { width: parent.width; spacing: 6
                Label { Layout.fillWidth: true; wrapMode: Text.Wrap; color: look.muted; text: "Settings stay on each device. Here you choose what to copy between your computers and browsers. Phones and tablets have their own." }
                Label { text: "Save from this device"; color: look.accent; font.weight: Font.Bold; Layout.topMargin: 6 }
                Pick { model: core.syncGroups(); picked: syncDlg.saveIds; onFlip: (id) => { const a = syncDlg.saveIds.slice(); const i = a.indexOf(id); if (i >= 0) a.splice(i, 1); else a.push(id); syncDlg.saveIds = a } }
                Button { text: "Save to my account"; highlighted: true; enabled: syncDlg.saveIds.length > 0; onClicked: { syncDlg.msg = ""; core.saveSyncedSettings(syncDlg.saveIds) } }
                Label { text: "Load onto this device"; color: look.accent; font.weight: Font.Bold; Layout.topMargin: 10 }
                Label { visible: !syncDlg.ready; text: "Looking…"; color: look.muted }
                Label { visible: syncDlg.ready && !(syncDlg.saved.groups && syncDlg.saved.groups.length); text: "Nothing has been saved yet. Save from your other device first."; color: look.muted }
                Label { visible: !!(syncDlg.saved.groups && syncDlg.saved.groups.length); text: syncDlg.saved.groups ? "Last saved " + new Date(syncDlg.saved.savedAt).toLocaleString() + " from " + syncDlg.saved.from + "." : ""; color: look.muted; font.pixelSize: 12 }
                Pick { model: core.syncGroups(); only: syncDlg.saved.groups || []; picked: syncDlg.loadIds; onFlip: (id) => { const a = syncDlg.loadIds.slice(); const i = a.indexOf(id); if (i >= 0) a.splice(i, 1); else a.push(id); syncDlg.loadIds = a } }
                Button { visible: !!(syncDlg.saved.groups && syncDlg.saved.groups.length); text: "Load onto this device"; highlighted: true; enabled: syncDlg.loadIds.length > 0; onClicked: { const n = core.loadSyncedSettings(syncDlg.loadIds); syncDlg.msg = n ? "Changed " + n + " setting" + (n === 1 ? "" : "s") + " on this device." : "Nothing to change: this device already matches."; syncDlg.loadIds = [] } }
                Label { visible: syncDlg.msg.length > 0; text: syncDlg.msg; color: look.accent }
            } }
    }
    Dialog { id: resetConfirm; modal: true; anchors.centerIn: Overlay.overlay; title: "Reset all settings?"; standardButtons: Dialog.Cancel | Dialog.Ok; background: Rectangle { color: look.panel; radius: 12; border.color: look.line }
        Label { text: "Everything goes back to how Pager starts."; color: look.text } onAccepted: { settings.reset(); dlg.note = "Settings reset." } }
    Dialog { id: encryptAllConfirm; modal: true; anchors.centerIn: Overlay.overlay; title: "Encrypt all my pages?"; standardButtons: Dialog.Cancel | Dialog.Ok; width: Math.min(420, Overlay.overlay ? Overlay.overlay.width - 32 : 420); background: Rectangle { color: look.panel; radius: 12; border.color: look.line }
        Label { width: parent.width; wrapMode: Text.Wrap; color: look.text; text: "Every page that can take encryption gets it turned on. It cannot be turned off again. Messages sent before stay readable on your server. Make sure you have your recovery key." } onAccepted: { dlg.encNote = "Starting…"; core.encryptAll() } }
    Connections { target: core; function onEncryptAllProgress(done, total, failed) { dlg.encNote = total === 0 ? "Everything is already encrypted." : (done >= total ? "Done: " + (total - failed) + " turned on" + (failed ? ", " + failed + " could not be" : "") : "Turning on… " + done + " of " + total) } }
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
