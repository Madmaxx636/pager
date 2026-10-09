import { useEffect, useState } from "react";
import { Bell, Check, ChevronLeft, Code2, HardDrive, Hourglass, Info, Keyboard, Lock, MessageSquare, Monitor, Palette, Search, SlidersHorizontal, Smile, Star, Tag, Link as LinkIcon, Trash2, Plus, ShieldCheck } from "lucide-react";
import { RowAction, ACCENTS, DEFAULTS, DEFAULT_QUICK_REACTIONS, SHORTCUTS, resetSettings, updateSettings, useRawSettings } from "../core/settings";
import { addStickers, cancelReminder, cancelScheduled, deleteLabel, deleteProfile, me, renameLabel, signOut, useChatsRaw, useLabels, useStore } from "../core/store";
import { labelsOf } from "../core/types";
import { http } from "../core/api";
import { networkMeta } from "../core/emoji";
import { SOUNDS, playSound } from "../core/sounds";
import { EmojiPicker, EmptyState, Group, IconButton, Modal, Row, Select, SwitchRow } from "./common";
import { BridgesPage } from "./Accounts";
import { AdminPage } from "./Admin";
import type { Nav } from "./Sidebar";

type Ico = React.ComponentType<{ size?: number; color?: string }>;
export const PAGES: { id: string; icon: Ico; tint: string; title: string; hint: string; desktop?: boolean }[] = [
  { id: "appearance", icon: Palette, tint: "#8e6cf0", title: "Appearance", hint: "Theme, colors, text size, bubbles" },
  { id: "layout", icon: SlidersHorizontal, tint: "#3b82f6", title: "Inbox & layout", hint: "Tabs, pins, density, what's shown" },
  { id: "chats", icon: MessageSquare, tint: "#10b981", title: "Pages", hint: "Sending, reading, privacy, media" },
  { id: "notifications", icon: Bell, tint: "#ef4444", title: "Notifications", hint: "Previews, scope, quiet hours" },
  { id: "bridges", icon: LinkIcon, tint: "#0ea5e9", title: "Bridges & accounts", hint: "Connected apps and their status" },
  { id: "labels", icon: Tag, tint: "#f59e0b", title: "Labels", hint: "Organize pages into folders" },
  { id: "media", icon: Smile, tint: "#ec4899", title: "Stickers & GIFs", hint: "Your stickers, GIF search" },
  { id: "privacy", icon: Lock, tint: "#64748b", title: "Privacy", hint: "Receipts, typing, previews" },
  { id: "shortcuts", icon: Keyboard, tint: "#6366f1", title: "Keyboard shortcuts", hint: "See and change every shortcut" },
  { id: "desktop", icon: Monitor, tint: "#0d9488", title: "Desktop", hint: "Tray, startup, zoom", desktop: true },
  { id: "admin", icon: ShieldCheck, tint: "#dc2626", title: "Admin", hint: "Profiles, bridges, signups" },
  { id: "storage", icon: HardDrive, tint: "#14b8a6", title: "Backup & reset", hint: "Export, import, reset" },
  { id: "advanced", icon: Code2, tint: "#475569", title: "Advanced", hint: "Developer tools" },
  { id: "starred", icon: Star, tint: "#f59e0b", title: "Starred messages", hint: "" },
  { id: "scheduled", icon: Hourglass, tint: "#f97316", title: "Scheduled & reminders", hint: "" },
  { id: "about", icon: Info, tint: "#6b7280", title: "About", hint: "Version, server, sign out" },
];

/** What the settings search and the command bar can jump to. */
export const SETTINGS_INDEX: { page: string; title: string; where: string; keywords?: string }[] = [
  { page: "appearance", title: "Theme mode", where: "Appearance", keywords: "dark light amoled black system" },
  { page: "appearance", title: "Accent color", where: "Appearance", keywords: "colour" },
  { page: "appearance", title: "Text size", where: "Appearance", keywords: "font zoom bigger smaller accessibility" },
  { page: "appearance", title: "Bubble style", where: "Appearance", keywords: "rounded square" },
  { page: "appearance", title: "Page wallpaper", where: "Appearance", keywords: "background" },
  { page: "appearance", title: "Time format", where: "Appearance", keywords: "12 24 hour clock" },
  { page: "appearance", title: "Avatar shape", where: "Appearance", keywords: "circle squircle" },
  { page: "appearance", title: "Large emoji", where: "Appearance", keywords: "big emoji only" },
  { page: "appearance", title: "Quick reactions", where: "Appearance", keywords: "emoji reactions favorites" },
  { page: "appearance", title: "Reduce motion", where: "Appearance", keywords: "animations accessibility" },
  { page: "layout", title: "Inbox style", where: "Inbox & layout", keywords: "minimal pro compact titles only" },
  { page: "layout", title: "Density", where: "Inbox & layout", keywords: "compact comfortable spacing" },
  { page: "layout", title: "Pinned pages row", where: "Inbox & layout", keywords: "pins favorites circles" },
  { page: "layout", title: "Unread pages first", where: "Inbox & layout", keywords: "sort order" },
  { page: "layout", title: "Default tab", where: "Inbox & layout", keywords: "start unread inbox" },
  { page: "layout", title: "Sidebar width", where: "Inbox & layout", keywords: "resize" },
  { page: "layout", title: "Network badges", where: "Inbox & layout", keywords: "icons whatsapp signal" },
  { page: "chats", title: "Enter key sends", where: "Pages", keywords: "return newline keyboard" },
  { page: "chats", title: "Markdown formatting", where: "Pages", keywords: "bold italic code strikethrough" },
  { page: "chats", title: "Message grouping", where: "Pages", keywords: "gap minutes consecutive" },
  { page: "chats", title: "Mark as read when", where: "Pages", keywords: "open scroll manual" },
  { page: "chats", title: "Open at first unread", where: "Pages", keywords: "jump" },
  { page: "chats", title: "Send read receipts", where: "Pages", keywords: "privacy seen" },
  { page: "chats", title: "Send typing indicators", where: "Pages", keywords: "privacy typing" },
  { page: "chats", title: "Link previews", where: "Pages", keywords: "url cards" },
  { page: "chats", title: "Auto-download media", where: "Pages", keywords: "photos data" },
  { page: "chats", title: "Auto-play GIFs", where: "Pages", keywords: "animated" },
  { page: "chats", title: "Unarchive on new message", where: "Pages", keywords: "archive returns" },
  { page: "notifications", title: "Notifications", where: "Notifications", keywords: "master alerts" },
  { page: "notifications", title: "Notify me about", where: "Notifications", keywords: "scope all dms mentions favorites" },
  { page: "notifications", title: "Quiet hours", where: "Notifications", keywords: "do not disturb night silent" },
  { page: "notifications", title: "Notification content", where: "Notifications", keywords: "preview hide sender" },
  { page: "bridges", title: "Bridges & accounts", where: "Bridges", keywords: "connect disconnect whatsapp signal login status" },
  { page: "labels", title: "Labels", where: "Labels", keywords: "folders organize tags" },
  { page: "media", title: "GIF search key", where: "Stickers & GIFs", keywords: "giphy tenor api" },
  { page: "media", title: "My stickers", where: "Stickers & GIFs", keywords: "add import packs" },
  { page: "shortcuts", title: "Keyboard shortcuts", where: "Shortcuts", keywords: "keys hotkeys bindings" },
  { page: "storage", title: "Export / import settings", where: "Backup & reset", keywords: "backup restore" },
  { page: "storage", title: "Reset all settings", where: "Backup & reset", keywords: "defaults" },
  { page: "advanced", title: "Developer mode", where: "Advanced", keywords: "event ids source debug" },
  { page: "desktop", title: "Launch at login", where: "Desktop", keywords: "startup autostart tray" },
  { page: "starred", title: "Starred messages", where: "Saved", keywords: "bookmarks" },
  { page: "scheduled", title: "Scheduled messages & reminders", where: "Saved", keywords: "send later snooze" },
  { page: "about", title: "Sign out", where: "About", keywords: "logout account version" },
];

export function Settings({ page, nav, onBack }: { page: string; nav: Nav; onBack: () => void }) {
  const title = PAGES.find((p) => p.id === page)?.title ?? "Settings";
  return (
    <section className="page">
      <header><IconButton icon={ChevronLeft} label="Back" onClick={() => (page ? nav("settings") : onBack())} className="back always" /><h2>{title}</h2></header>
      <div className="page-body">{page ? <Page page={page} nav={nav} /> : <Home nav={nav} />}</div>
    </section>
  );
}

function Home({ nav }: { nav: Nav }) {
  const isAdmin = useStore((s) => s.isAdmin);
  const [q, setQ] = useState("");
  const t = q.trim().toLowerCase();
  const hits = t ? SETTINGS_INDEX.filter((e) => `${e.title} ${e.where} ${e.keywords ?? ""}`.toLowerCase().includes(t)) : [];
  const groups: string[][] = [["appearance", "layout", "chats", "notifications"], ["bridges", "labels", "media"], ["privacy", "shortcuts", "desktop", "admin", "storage", "advanced"], ["starred", "scheduled"], ["about"]];
  return (
    <>
      <div className="pill-search wide"><Search size={18} /><input autoFocus placeholder="Search settings" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {t ? (hits.length ? <Group>{hits.map((e) => <Row key={e.title} title={e.title} hint={e.where} onClick={() => nav(`settings/${e.page}`)} chevron />)}</Group> : <EmptyState icon={Search} title="No settings match" body="Try a different word." />)
        : groups.map((g, i) => <Group key={i}>{g.map((id) => PAGES.find((p) => p.id === id)!).filter((p) => (!p.desktop || window.pagerDesktop) && (p.id !== "admin" || isAdmin)).map((p) => <Row key={p.id} title={p.title} hint={p.hint} icon={p.icon} tint={p.tint} onClick={() => nav(`settings/${p.id}`)} chevron />)}</Group>)}
    </>
  );
}

function Page({ page, nav }: { page: string; nav: Nav }) {
  const s = useRawSettings();
  const u = updateSettings;
  const [deleting, setDeleting] = useState(false);
  switch (page) {
    case "appearance": return <Appearance />;
    case "layout": return (
      <>
        <Group title="Inbox">
          <Select title="Inbox style" value={s.inboxStyle} options={[["pro", "Pro: unread counts and network badges"], ["minimal", "Minimal: titles only"]]} onChange={(v) => u({ inboxStyle: v })} />
          <Select title="Default tab" value={s.defaultTab} options={[["inbox", "Inbox"], ["unread", "Unread"]]} onChange={(v) => u({ defaultTab: v })} />
          <SwitchRow title="Pinned pages row" hint="Pinned pages sit above the list as circles" checked={s.showPinsRow} onChange={(v) => u({ showPinsRow: v })} />
          <SwitchRow title="Unread pages first" hint="Unread above read, newest first" checked={s.sortUnreadFirst} onChange={(v) => u({ sortUnreadFirst: v })} />
          <SwitchRow title="Show filter bar" checked={s.showFilterBar} onChange={(v) => u({ showFilterBar: v })} />
          <SwitchRow title="Show labels in the filter bar" checked={s.showLabelsInFilterBar} disabled={!s.showFilterBar} onChange={(v) => u({ showLabelsInFilterBar: v })} />
        </Group>
        <Group title="Page list">
          <Select title="Density" value={s.density} options={[["comfortable", "Comfortable"], ["compact", "Compact"]]} onChange={(v) => u({ density: v })} />
          <Select title="Hover action 1" hint="Quick button when you point at a page" value={s.rowAction1} options={ROW_ACTIONS} onChange={(v) => u({ rowAction1: v })} />
          <Select title="Hover action 2" value={s.rowAction2} options={ROW_ACTIONS} onChange={(v) => u({ rowAction2: v })} />
          <Row title="Sidebar width" hint={`${s.sidebarWidth}px`}><input type="range" min="280" max="520" step="10" value={s.sidebarWidth} onChange={(e) => u({ sidebarWidth: Number(e.target.value) })} /></Row>
          <SwitchRow title="Show avatars" checked={s.showAvatars} onChange={(v) => u({ showAvatars: v })} />
          <SwitchRow title="Show network badges" hint="The small WhatsApp / Signal icon on avatars" checked={s.showNetworkBadges} onChange={(v) => u({ showNetworkBadges: v })} />
          <SwitchRow title="Show network name" hint="Under each page name" checked={s.showNetworkNameInRows} onChange={(v) => u({ showNetworkNameInRows: v })} />
          <SwitchRow title="Show message previews" checked={s.showPreviews} onChange={(v) => u({ showPreviews: v })} />
        </Group>
        <Group title="Conversation">
          <SwitchRow title="Show message times" checked={s.showMessageTimes} onChange={(v) => u({ showMessageTimes: v })} />
          <SwitchRow title="Show delivery & read ticks" checked={s.showReadTicks} onChange={(v) => u({ showReadTicks: v })} />
        </Group>
      </>
    );
    case "chats": return (
      <>
        <Group title="Sending">
          <SwitchRow title="Enter key sends" hint="Off: Ctrl+Enter sends and Enter adds a new line" checked={s.enterToSend} onChange={(v) => u({ enterToSend: v })} />
          <SwitchRow title="Markdown formatting" hint="**bold**, _italic_, ~~strike~~ and `code` are sent as formatted text" checked={s.markdown} onChange={(v) => u({ markdown: v })} />
          <SwitchRow title="Mention suggestions" hint="Type @ in a group to pick someone" checked={s.mentionSuggestions} onChange={(v) => u({ mentionSuggestions: v })} />
        </Group>
        <Group title="Reading">
          <Select title="Mark as read when" value={s.markReadMode} options={[["open", "I open the page"], ["scrolled", "I reach the newest message"], ["manual", "I do it myself"]]} onChange={(v) => u({ markReadMode: v })} />
          <SwitchRow title="Open at first unread" hint="Jump to the 'New messages' line" checked={s.openAtFirstUnread} onChange={(v) => u({ openAtFirstUnread: v })} />
          <Select title="Message grouping" value={String(s.groupGapMin)} options={[["1", "Within 1 minute"], ["5", "Within 5 minutes"], ["15", "Within 15 minutes"], ["60", "Within an hour"]]} onChange={(v) => u({ groupGapMin: Number(v) })} />
          <SwitchRow title="Large emoji" hint="Emoji-only messages are shown big" checked={s.largeEmoji} onChange={(v) => u({ largeEmoji: v })} />
        </Group>
        <Group title="Privacy">
          <SwitchRow title="Send read receipts" hint="Off: others won't see when you've read their messages" checked={s.sendReadReceipts} onChange={(v) => u({ sendReadReceipts: v })} />
          <SwitchRow title="Send typing indicators" checked={s.sendTyping} onChange={(v) => u({ sendTyping: v })} />
        </Group>
        <Group title="Media & links">
          <SwitchRow title="Link previews" hint="Your server fetches the page to build the preview" checked={s.linkPreviews} onChange={(v) => u({ linkPreviews: v })} />
          <Select title="Auto-download media" value={s.autoDownload} options={[["always", "Always"], ["never", "Never (click to load)"]]} onChange={(v) => u({ autoDownload: v })} />
          <SwitchRow title="Auto-play GIFs" checked={s.autoPlayGifs} onChange={(v) => u({ autoPlayGifs: v })} />
        </Group>
        <Group title="Inbox behavior">
          <SwitchRow title="Unarchive on new message" hint="Archived pages come back when someone writes (unless muted)" checked={s.unarchiveOnMessage} onChange={(v) => u({ unarchiveOnMessage: v })} />
          <SwitchRow title="Confirm before deleting" checked={s.confirmDelete} onChange={(v) => u({ confirmDelete: v })} />
        </Group>
      </>
    );
    case "notifications": return <Notifications />;
    case "bridges": return <BridgesPage />;
    case "admin": return <AdminPage />;
    case "labels": return <Labels />;
    case "media": return <Media />;
    case "privacy": return (
      <>
        <Group title="Receipts">
          <SwitchRow title="Send read receipts" checked={s.sendReadReceipts} onChange={(v) => u({ sendReadReceipts: v })} />
          <SwitchRow title="Send typing indicators" checked={s.sendTyping} onChange={(v) => u({ sendTyping: v })} />
        </Group>
        <Group title="Content" footer="Link previews are fetched by your own server, so the sites you link to never see your device.">
          <SwitchRow title="Link previews" checked={s.linkPreviews} onChange={(v) => u({ linkPreviews: v })} />
          <Select title="Notification content" value={s.notifPreview} options={[["full", "Name and message"], ["sender", "Name only"], ["hidden", "Hide content"]]} onChange={(v) => u({ notifPreview: v })} />
        </Group>
      </>
    );
    case "shortcuts": return <Shortcuts />;
    case "starred": return <Starred nav={nav} />;
    case "scheduled": return <Scheduled />;
    case "desktop": return <Desktop />;
    case "storage": return <Backup />;
    case "advanced": return (
      <Group title="Developer" footer="Adds event IDs and a 'Copy event ID' action to messages.">
        <SwitchRow title="Developer mode" checked={s.developerMode} onChange={(v) => u({ developerMode: v })} />
      </Group>
    );
    case "about": return (
      <>
        <Group title="Pager"><Row title={`Version ${import.meta.env.VITE_APP_VERSION ?? "0.3.0"}`} hint={window.pagerDesktop ? `Desktop app (${window.pagerDesktop.platform})` : "Web app"} /><Row title="An open-source, self-hosted unified messenger." /></Group>
        <Group title="Account"><Row title={me()} hint={http.base || window.location.origin} /><Row title="Sign out" onClick={() => signOut()}><span className="danger">Sign out</span></Row><Row title="Delete my profile" hint="Removes your account and everything on this server. This can't be undone" onClick={() => setDeleting(true)}><span className="danger">Delete</span></Row></Group>
        {deleting && <DeleteProfile onClose={() => setDeleting(false)} />}
      </>
    );
    default: return null;
  }
}

function DeleteProfile({ onClose }: { onClose: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Delete your profile?" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(""); try { await deleteProfile(pw); } catch (x) { setErr((x as Error).message || "Wrong password"); setBusy(false); } }}>
        <p className="muted">This deletes your account on this server, disconnects all your apps and removes your messages here. Your pages on WhatsApp, Signal and the others are not touched. This can't be undone.</p>
        <label>Your password<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus required /></label>
        {err && <div className="error">{err}</div>}
        <div className="row-end"><button type="button" className="link" onClick={onClose}>Cancel</button><button className="primary danger" disabled={busy || !pw}>{busy ? "Deleting…" : "Delete my profile"}</button></div>
      </form>
    </Modal>
  );
}

function Appearance() {
  const s = useRawSettings();
  const [editing, setEditing] = useState<number>();
  return (
    <>
      <Group title="Theme">
        <Select title="Mode" value={s.themeMode} options={[["system", "Follow system"], ["light", "Light"], ["dark", "Dark"], ["black", "Black (AMOLED)"]]} onChange={(v) => updateSettings({ themeMode: v })} />
        <Row title="Accent color"><div className="swatches">{Object.entries(ACCENTS).map(([name, c]) => <button key={name} className={s.accent === name ? "on" : ""} style={{ background: c.dark }} onClick={() => updateSettings({ accent: name })} aria-label={name}>{s.accent === name ? <Check size={16} color={c.onDark} /> : null}</button>)}</div></Row>
      </Group>
      <Group title="Text & messages">
        <Row title="Text size" hint={`${Math.round(s.fontScale * 100)}%`}><input type="range" min="0.85" max="1.4" step="0.05" value={s.fontScale} onChange={(e) => updateSettings({ fontScale: Number(e.target.value) })} /></Row>
        <Select title="Bubble style" value={s.bubbleStyle} options={[["round", "Rounded"], ["soft", "Extra round"], ["square", "Square"], ["tail", "Tail"], ["outline", "Outline"], ["plain", "No bubbles"]]} onChange={(v) => updateSettings({ bubbleStyle: v })} />
        <Select title="Bubble fill" hint="How your own messages are colored" value={s.bubbleFill} options={[["solid", "Solid"], ["gradient", "Gradient"], ["tinted", "Soft tint"]]} onChange={(v) => updateSettings({ bubbleFill: v })} />
        <Select title="Bubble depth" value={s.bubbleDepth} options={[["flat", "Flat"], ["soft", "Soft shadow"], ["raised", "Raised"]]} onChange={(v) => updateSettings({ bubbleDepth: v })} />
        <Select title="Message animation" hint="When a new message appears" value={s.messageAnimation} options={[["none", "None"], ["pop", "Pop"], ["slide", "Slide"], ["fade", "Fade"]]} onChange={(v) => updateSettings({ messageAnimation: v })} />
        <SwitchRow title="Screen effects" hint="Confetti, hearts, balloons and more when a message calls for it (🎉 ❤️ 🎈 ❄️ ✨)" checked={s.screenEffects} onChange={(v) => updateSettings({ screenEffects: v })} />
        <Select title="Page wallpaper" value={s.wallpaper} options={[["none", "None"], ["dusk", "Dusk"], ["forest", "Forest"], ["ocean", "Ocean"], ["sand", "Sand"], ["graphite", "Graphite"]]} onChange={(v) => updateSettings({ wallpaper: v })} />
        <Select title="Avatar shape" value={s.avatarShape} options={[["circle", "Circle"], ["squircle", "Rounded square"]]} onChange={(v) => updateSettings({ avatarShape: v })} />
        <Select title="Time format" value={s.timeFormat} options={[["system", "Follow system"], ["12", "12-hour"], ["24", "24-hour"]]} onChange={(v) => updateSettings({ timeFormat: v })} />
        <SwitchRow title="Color sender names in groups" checked={s.colorSenderNames} onChange={(v) => updateSettings({ colorSenderNames: v })} />
        <SwitchRow title="Large emoji" hint="Emoji-only messages are shown big" checked={s.largeEmoji} onChange={(v) => updateSettings({ largeEmoji: v })} />
        <SwitchRow title="Silly hello" hint="The pager says something goofy when you open the app" checked={s.greetings} onChange={(v) => updateSettings({ greetings: v })} />
        <SwitchRow title="Reduce motion" hint="Fewer animations" checked={s.reduceMotion} onChange={(v) => updateSettings({ reduceMotion: v })} />
      </Group>
      <Group title="Reactions" footer="These show first when you right-click a message. Click one to change it.">
        <SwitchRow title="Double-click to react" hint="Double-click a message to add your first quick reaction" checked={s.doubleTapReact} onChange={(v) => updateSettings({ doubleTapReact: v })} />
        <SwitchRow title="Swipe to reply" hint="Swipe a message to the right (touch screens, or two fingers on a trackpad)" checked={s.swipeToReply} onChange={(v) => updateSettings({ swipeToReply: v })} />
        <Row title="Quick reactions"><div className="quick-edit">{s.quickReactions.map((e, i) => <button key={i} onClick={() => setEditing(i)}>{e}</button>)}</div></Row>
        <Row title="Reset quick reactions" onClick={() => updateSettings({ quickReactions: DEFAULT_QUICK_REACTIONS })}><span className="accent">Reset</span></Row>
      </Group>
      {editing !== undefined && <EmojiPicker recent={s.recentEmoji} onPick={(e) => { const q = [...s.quickReactions]; q[editing] = e; updateSettings({ quickReactions: q }); setEditing(undefined); }} onClose={() => setEditing(undefined)} />}
    </>
  );
}

const ROW_ACTIONS: [RowAction, string][] = [["none", "Nothing"], ["read", "Mark read / unread"], ["archive", "Archive"], ["pin", "Pin"], ["mute", "Mute"], ["low", "Low priority"], ["snooze", "Snooze 3 hours"]];
const fmtMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const parseMin = (v: string) => { const [h, m] = v.split(":").map(Number); return (h || 0) * 60 + (m || 0); };

function Notifications() {
  const s = useRawSettings();
  const [perm, setPerm] = useState(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  const [word, setWord] = useState("");
  const known = ["whatsapp", "signal", "telegram", "discord", "instagram", "messenger", "gmessages"];
  const off = !s.notifEnabled;
  const chats = Object.entries(s.notifChat).filter(([, p]) => p && ((p.mode && p.mode !== "default") || (p.preview && p.preview !== "default") || (p.sound && p.sound !== "default")));
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const addWord = () => { const w = word.trim(); if (w && !s.notifKeywords.some((k) => k.toLowerCase() === w.toLowerCase())) updateSettings({ notifKeywords: [...s.notifKeywords, w] }); setWord(""); };
  function test() {
    const body = "This is how a message will look.";
    if (window.pagerDesktop) window.pagerDesktop.notify({ title: "Pager test", body, silent: !s.notifSound });
    else if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("Pager test", { body, silent: !s.notifSound });
  }
  return (
    <>
      <Group><SwitchRow title="Notifications" hint="Master switch for message alerts" checked={s.notifEnabled} onChange={(v) => updateSettings({ notifEnabled: v })} />
        {perm === "default" && <Row title="Allow browser notifications"><button className="pill" onClick={async () => setPerm(await Notification.requestPermission())}>Allow</button></Row>}
        {perm === "denied" && <Row title="Notifications are blocked in your browser settings." />}
        <Row title="Send a test notification" hint="Check sound and how it looks" onClick={off ? undefined : test}><span className="accent">Test</span></Row></Group>
      <Group title="What to notify" footer="Muted and Low priority pages stay quiet except for @mentions, replies to your messages and your keywords.">
        <Select title="Notify me about" value={s.notifScope} disabled={off} options={[["all", "Every message"], ["dm_mentions", "Direct messages and mentions"], ["favorites", "Pinned pages and mentions"]]} onChange={(v) => updateSettings({ notifScope: v })} />
        <Select title="Direct messages" value={s.notifDirectMode} disabled={off} options={[["all", "Every message"], ["mentions", "Mentions and replies only"], ["none", "Nothing"]]} onChange={(v) => updateSettings({ notifDirectMode: v })} />
        <Select title="Group pages" value={s.notifGroupMode} disabled={off} options={[["all", "Every message"], ["mentions", "Mentions and replies only"], ["none", "Nothing"]]} onChange={(v) => updateSettings({ notifGroupMode: v })} />
        <SwitchRow title="Groups: only when mentioned" hint="Group pages stay quiet unless someone @mentions you" checked={s.notifGroupMentionsOnly} disabled={off} onChange={(v) => updateSettings({ notifGroupMentionsOnly: v })} />
      </Group>
      <Group title="Keywords" footer="A message with one of these words always notifies you, even in a muted page. Whole words only.">
        <div className="chips pad">{s.notifKeywords.map((k) => <span key={k} className="chip">{k}<button aria-label={`Remove ${k}`} onClick={() => updateSettings({ notifKeywords: s.notifKeywords.filter((x) => x !== k) })}>×</button></span>)}</div>
        <Row title="Add a keyword"><form onSubmit={(e) => { e.preventDefault(); addWord(); }} style={{ display: "flex", gap: 8 }}><input value={word} disabled={off} placeholder="Your name, a nickname…" onChange={(e) => setWord(e.target.value)} /><button className="pill" disabled={off || !word.trim()}>Add</button></form></Row>
      </Group>
      <Group title="Appearance">
        <Select title="Show" value={s.notifPreview} disabled={off} options={[["full", "Name and message"], ["sender", "Name only"], ["hidden", "Hide content"]]} onChange={(v) => updateSettings({ notifPreview: v })} />
        <SwitchRow title="Sound" checked={s.notifSound} disabled={off} onChange={(v) => updateSettings({ notifSound: v })} />
        <Select title="Unread badge counts" hint="The number on the app icon" value={s.notifBadge} options={[["unmuted", "Pages that can notify me"], ["all", "Every unread page"], ["off", "Nothing"]]} onChange={(v) => updateSettings({ notifBadge: v })} />
      </Group>
      <Group title="Sounds" footer="Each app and each page can have its own sound. Muted and quiet-hours messages stay silent.">
        <Select title="Alert sound" value={s.notifSoundId} disabled={off} options={SOUNDS} onChange={(v) => { updateSettings({ notifSoundId: v }); playSound(v, s.notifSoundVolume); }} />
        <Row title="Volume" hint={`${Math.round(s.notifSoundVolume * 100)}%`}><input type="range" min="0" max="1" step="0.05" value={s.notifSoundVolume} disabled={off} onChange={(e) => updateSettings({ notifSoundVolume: Number(e.target.value) })} onMouseUp={() => playSound(s.notifSoundId, s.notifSoundVolume)} /></Row>
        {known.map((id) => <Select key={"snd" + id} title={`${networkMeta(id).label} sound`} value={s.notifNetworkSound[id] ?? ""} disabled={off}
          options={[["", "Same as the app"], ...SOUNDS]} onChange={(v) => { const { [id]: _x, ...rest } = s.notifNetworkSound; updateSettings({ notifNetworkSound: v ? { ...rest, [id]: v } : rest }); if (v) playSound(v, s.notifSoundVolume); }} />)}
      </Group>
      <Group title="Do not disturb" footer="Messages still arrive, but nothing alerts you until it ends. Pinned pages and mentions can break through if you allow it under Quiet hours.">
        <Row title={s.dndUntil > Date.now() ? `On until ${new Date(s.dndUntil).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Off"}>
          {[["1 hour", 3.6e6], ["8 hours", 8 * 3.6e6]].map(([l, ms]) => <button key={l as string} className="pill" disabled={off} onClick={() => updateSettings({ dndUntil: Date.now() + (ms as number) })}>{l as string}</button>)}
          <button className="pill" disabled={off} onClick={() => { const d = new Date(); d.setHours(7, 0, 0, 0); if (d.getTime() < Date.now() + 6e4) d.setDate(d.getDate() + 1); updateSettings({ dndUntil: d.getTime() }); }}>Until morning</button>
          {s.dndUntil > Date.now() && <button className="link" onClick={() => updateSettings({ dndUntil: 0 })}>Turn off</button>}
        </Row>
      </Group>
      <Group title="Delay" footer="Waits, then skips the alert if you already read the page on another device or app.">
        <Select title="Wait before alerting" value={String(s.notifDelaySec)} disabled={off} options={[["0", "Don't wait"], ["5", "5 seconds"], ["15", "15 seconds"], ["30", "30 seconds"], ["60", "1 minute"]]} onChange={(v) => updateSettings({ notifDelaySec: Number(v) })} />
      </Group>
      <Group title="Quiet hours" footer="Messages still arrive, silently.">
        <SwitchRow title="Quiet hours" checked={s.quietHoursEnabled} disabled={off} onChange={(v) => updateSettings({ quietHoursEnabled: v })} />
        {s.quietHoursEnabled && <>
          <Row title="From"><input type="time" value={fmtMin(s.quietStartMin)} onChange={(e) => updateSettings({ quietStartMin: parseMin(e.target.value) })} /></Row>
          <Row title="Until"><input type="time" value={fmtMin(s.quietEndMin)} onChange={(e) => updateSettings({ quietEndMin: parseMin(e.target.value) })} /></Row>
          <Row title="On these days"><div className="chips">{days.map((d, i) => <button key={d} className={"chip" + (s.notifQuietDays.includes(i) ? " on" : "")} onClick={() => updateSettings({ notifQuietDays: s.notifQuietDays.includes(i) ? s.notifQuietDays.filter((x) => x !== i) : [...s.notifQuietDays, i].sort() })}>{d}</button>)}</div></Row>
          <SwitchRow title="Let important ones through" hint="Pinned pages, mentions, replies and keywords still make a sound" checked={s.notifQuietBreakThrough} onChange={(v) => updateSettings({ notifQuietBreakThrough: v })} />
        </>}
      </Group>
      <Group title="Per network" footer="Pick how each app notifies you. A page's own setting (in its info page) wins.">
        {known.map((id) => (
          <Select key={id} title={networkMeta(id).label} value={s.notifNetworkMode[id] ?? (s.notifMutedNetworks.includes(id) ? "none" : "all")} disabled={off}
            options={[["all", "Every message"], ["mentions", "Mentions only"], ["none", "Nothing"]]}
            onChange={(v) => updateSettings({ notifNetworkMode: { ...s.notifNetworkMode, [id]: v }, notifMutedNetworks: s.notifMutedNetworks.filter((x) => x !== id) })} />
        ))}
      </Group>
      {chats.length > 0 && (
        <Group title="Pages with their own settings">
          {chats.map(([id, p]) => <Row key={id} title={id.slice(0, 12) + "…"} hint={`${p.mode && p.mode !== "default" ? p.mode : "default alerts"}${p.sound === "off" ? " · silent" : ""}${p.preview && p.preview !== "default" ? ` · ${p.preview} previews` : ""}`}><button className="link" onClick={() => { const { [id]: _x, ...rest } = s.notifChat; updateSettings({ notifChat: rest }); }}>Reset</button></Row>)}
        </Group>
      )}
    </>
  );
}

function Labels() {
  const labels = useLabels();
  const chats = useChatsRaw();
  const [renaming, setRenaming] = useState<string>();
  const [name, setName] = useState("");
  if (!labels.length) return <EmptyState icon={Tag} title="No labels yet" body="Right-click a page, choose Labels, and create one. Then filter your inbox by it." />;
  return (
    <>
      <p className="muted pad">Labels work like folders. Add one from a page's menu, then filter your inbox by it.</p>
      <Group>{labels.map((l) => (
        <Row key={l} title={l} hint={`${Object.values(chats).filter((c) => labelsOf(c).includes(l)).length} pages`} icon={Tag} tint="#f59e0b">
          <button className="link" onClick={() => { setRenaming(l); setName(l); }}>Rename</button>
          <IconButton icon={Trash2} label="Delete label" onClick={() => confirm(`Delete “${l}”? The pages themselves aren't touched.`) && deleteLabel(l)} />
        </Row>))}</Group>
      {renaming && <Modal title="Rename label" onClose={() => setRenaming(undefined)}><form className="inline-form" onSubmit={(e) => { e.preventDefault(); renameLabel(renaming, name.trim()); setRenaming(undefined); }}><input autoFocus value={name} onChange={(e) => setName(e.target.value)} /><button className="primary" disabled={!name.trim()}>Save</button></form></Modal>}
    </>
  );
}

function Media() {
  const s = useRawSettings();
  const pack = useStore((x) => x.userStickers);
  const input = useState<HTMLInputElement | null>(null);
  return (
    <>
      <Group title="GIF search" footer="GIF search uses your own free API key from Giphy (developers.giphy.com) or Tenor. Pager doesn't ship a shared key.">
        <Select title="Provider" value={s.gifProvider} options={[["giphy", "Giphy"], ["tenor", "Tenor"]]} onChange={(v) => updateSettings({ gifProvider: v })} />
        <Row title="API key"><input type="password" placeholder="Paste your key" value={s.gifKey} onChange={(e) => updateSettings({ gifKey: e.target.value.trim() })} /></Row>
      </Group>
      <Group title="My stickers" footer="Stickers are saved to your Matrix account, so they follow you to other devices.">
        <Row title="Add stickers from images…" onClick={() => input[0]?.click()}><Plus size={18} /></Row>
        <Row title={pack?.stickers.length ? `${pack.stickers.length} stickers` : "No stickers yet"} />
        <input ref={input[1]} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) void addStickers(Array.from(e.target.files)); e.target.value = ""; }} />
      </Group>
    </>
  );
}

function Shortcuts() {
  const s = useRawSettings();
  const [capturing, setCapturing] = useState<string>();
  useEffect(() => {
    if (!capturing) return;
    const h = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
      if (e.key === "Escape") return setCapturing(undefined);
      updateSettings({ shortcuts: { ...s.shortcuts, [capturing]: comboOf(e) } }); setCapturing(undefined);
    };
    window.addEventListener("keydown", h, true); return () => window.removeEventListener("keydown", h, true);
  }, [capturing, s.shortcuts]);
  return (
    <>
      <Group title="Shortcuts" footer="Click Change, then press the keys you want. Escape cancels.">
        {SHORTCUTS.map((sc) => {
          const keys = s.shortcuts[sc.id] ?? sc.keys;
          return (
            <Row key={sc.id} title={sc.label}>
              <kbd className={capturing === sc.id ? "capturing" : ""}>{capturing === sc.id ? "Press keys…" : keys}</kbd>
              <button className="link" onClick={() => setCapturing(sc.id)}>Change</button>
              {s.shortcuts[sc.id] && <button className="link" onClick={() => { const { [sc.id]: _x, ...rest } = s.shortcuts; updateSettings({ shortcuts: rest }); }}>Reset</button>}
            </Row>
          );
        })}
      </Group>
    </>
  );
}

/** "Ctrl+Shift+A" for a key event; the same format the shortcut table uses. */
export function comboOf(e: KeyboardEvent): string {
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return [e.ctrlKey || e.metaKey ? "Ctrl" : "", e.altKey ? "Alt" : "", e.shiftKey ? "Shift" : "", key].filter(Boolean).join("+");
}

function Starred({ nav }: { nav: Nav }) {
  const stars = useStore((s) => s.stars);
  if (!stars.length) return <EmptyState icon={Star} title="Nothing starred yet" body="Right-click a message and choose Star to save it here." />;
  return <ul className="plain">{[...stars].sort((a, b) => b.ts - a.ts).map((st) => (
    <li key={st.eventId}><button className="list-btn col" onClick={() => nav(`chat:${st.roomId}`)}><small className="accent">{st.sender} · {st.chat}</small><span>{st.text}</span><small>{new Date(st.ts).toLocaleString()}</small></button></li>
  ))}</ul>;
}

function Scheduled() {
  const scheduled = useStore((s) => s.scheduled), reminders = useStore((s) => s.reminders);
  return (
    <>
      <Group title="Scheduled messages" footer={scheduled.length ? undefined : "Use the ▾ next to Send to schedule one."}>
        {[...scheduled].sort((a, b) => a.whenMs - b.whenMs).map((m) => <Row key={m.delayId} title={m.text} hint={`To ${m.chat} · ${new Date(m.whenMs).toLocaleString()}`}><button className="link danger" onClick={() => cancelScheduled(m)}>Cancel</button></Row>)}
        {!scheduled.length && <Row title="No scheduled messages" />}
      </Group>
      <Group title="Reminders & snoozed pages" footer={reminders.length ? undefined : "Right-click a page and choose Remind me or Snooze."}>
        {[...reminders].sort((a, b) => a.whenMs - b.whenMs).map((r) => <Row key={r.id} title={r.chat} hint={(r.snooze ? "Snoozed until " : "") + new Date(r.whenMs).toLocaleString()}><button className="link danger" onClick={() => cancelReminder(r)}>Cancel</button></Row>)}
        {!reminders.length && <Row title="No reminders" />}
      </Group>
    </>
  );
}

function Desktop() {
  const s = useRawSettings();
  const [auto, setAuto] = useState(false);
  const [spell, setSpellState] = useState<{ enabled: boolean; languages: string[]; available: string[] }>();
  useEffect(() => { void window.pagerDesktop?.getAutostart().then(setAuto); void window.pagerDesktop?.getSpell().then(setSpellState); }, []);
  const setSpell = (o: { enabled?: boolean; languages?: string[] }) => { window.pagerDesktop?.setSpell(o); setSpellState((p) => p && { ...p, ...o }); };
  return (
    <>
      <Group title="Window">
        <SwitchRow title="Keep running in the tray when closed" hint="Closing the window hides Pager so messages keep arriving" checked={s.closeToTray} onChange={(v) => { updateSettings({ closeToTray: v }); window.pagerDesktop?.setPrefs({ closeToTray: v }); }} />
        <SwitchRow title="Launch at login" checked={auto} onChange={(v) => { setAuto(v); window.pagerDesktop?.setAutostart(v); }} />
        <SwitchRow title="Start minimized to tray" checked={s.startMinimized} onChange={(v) => { updateSettings({ startMinimized: v }); window.pagerDesktop?.setPrefs({ startMinimized: v }); }} />
      </Group>
      <Group title="Look" footer="Takes your colors from KDE Plasma, GNOME, Windows or macOS and follows them when you change them.">
        <SwitchRow title="Match my system theme" hint="Colors, light or dark, and accent" checked={s.themeFollowSystem} onChange={(v) => updateSettings({ themeFollowSystem: v })} />
      </Group>
      {spell && (
        <Group title="Spell check" footer="Right-click a misspelled word for suggestions or to add it to your dictionary.">
          <SwitchRow title="Check spelling as I type" checked={spell.enabled} onChange={(v) => setSpell({ enabled: v })} />
          <Select title="Language" value={spell.languages[0] ?? ""} disabled={!spell.enabled} options={spell.available.map((l): [string, string] => [l, new Intl.DisplayNames([navigator.language], { type: "language" }).of(l) ?? l])} onChange={(v) => setSpell({ languages: [v] })} />
        </Group>
      )}
    </>
  );
}

function Backup() {
  const [msg, setMsg] = useState("");
  const s = useRawSettings();
  return (
    <>
      <Group title="Back up settings" footer="Copies every setting as text, so you can paste it on another device.">
        <Row title="Copy settings to clipboard" onClick={() => { void navigator.clipboard.writeText(JSON.stringify(s)); setMsg("Settings copied."); }} />
        <Row title="Restore settings from clipboard" onClick={async () => { try { updateSettings({ ...DEFAULTS, ...JSON.parse(await navigator.clipboard.readText()) }); setMsg("Settings restored."); } catch { setMsg("The clipboard doesn't contain Pager settings."); } }} />
        {msg && <Row title={msg} />}
      </Group>
      <Group title="Reset" footer="Puts every setting back to its default. Your pages and accounts aren't touched.">
        <Row title="Reset all settings" onClick={() => confirm("Reset all settings?") && resetSettings()}><span className="danger">Reset</span></Row>
      </Group>
    </>
  );
}
