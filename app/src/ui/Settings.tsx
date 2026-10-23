import { FONTS, PALETTES, PALETTE_GROUPS } from "../core/palettes";
import { LOOKS } from "../core/looks";
import { lastProblem } from "./ErrorBoundary";
import { hasCustomSound, importSound, onCustomSoundChange, playCustom, removeCustomSound } from "../core/customsound";
import { APP_ICONS } from "../core/appicons";
import { GIF_SOURCES, KEY_PROVIDERS, keyFingerprint, searchGifs } from "../core/gifs";
import { WALLPAPERS, wallpaperCss, importPhoto, removePhoto, loadPhoto } from "../core/wallpapers";
import { EFFECT_TRIGGERS } from "../core/effects";
import { SKINS, SKIN_GROUPS, accentsFor, skinById } from "../core/skins";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Bell, Check, ChevronDown, ChevronLeft, Code2, HardDrive, Hourglass, Info, Keyboard, Lock, MessageSquare, Monitor, Palette, Search, SlidersHorizontal, Smile, Star, Tag, Link as LinkIcon, Trash2, Plus, ShieldCheck } from "lucide-react";
import { AppSettings, BubbleBorder, bubbleColorsFor, bubbleLook, SYNC_GROUPS, groupsIn, loadSaved, SavedSettings, RowAction, ACCENTS, accentTones, DEFAULTS, SHORTCUTS, resetSettings, updateSettings, useRawSettings } from "../core/settings";
import { Tour } from "./Tour";
import { comboOf } from "../core/combo";
import { RecoveryKeyDialog, RestoreDialog } from "./KeyDialogs";
import { addStickers, cancelReminder, retryEncryptionStart, enableEncryptionForAll, exportKeyFile, importKeyFile, useEncryption, cancelScheduled, deleteLabel, deleteProfile, me, renameLabel, signOut, useChatsRaw, useLabels, useStore, loadEveryHistory, loadSavedSettings, saveSettingsToAccount, resyncFromServer } from "../core/store";
import { labelsOf } from "../core/types";
import { http } from "../core/api";
import { networkMeta } from "../core/emoji";
import { SOUNDS, playSound } from "../core/sounds";
import { EmojiPicker, EmptyState, Group, IconButton, Modal, Row, Select, Switch, SwitchRow } from "./common";
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
  { id: "privacy", icon: Lock, tint: "#64748b", title: "Privacy & encryption", hint: "Recovery key, receipts, typing, previews" },
  { id: "shortcuts", icon: Keyboard, tint: "#6366f1", title: "Keyboard shortcuts", hint: "See and change every shortcut" },
  { id: "system", icon: SlidersHorizontal, tint: "#0d9488", title: "System", hint: "Time, motion, stories, greeting" },
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
  { page: "system", title: "Time format", where: "System", keywords: "12 24 hour clock" },
  { page: "appearance", title: "Avatar shape", where: "Appearance", keywords: "circle squircle" },
  { page: "appearance", title: "Large emoji", where: "Appearance", keywords: "big emoji only" },
  { page: "appearance", title: "Quick reactions", where: "Appearance", keywords: "emoji reactions favorites" },
  { page: "system", title: "Reduce motion", where: "System", keywords: "animations accessibility" },
  { page: "system", title: "Hide Stories", where: "System", keywords: "whatsapp status" },
  { page: "system", title: "Small animations", where: "System", keywords: "motion glide" },
  { page: "system", title: "Silly hello", where: "System", keywords: "greeting goofy" },
  { page: "layout", title: "Inbox style", where: "Inbox & layout", keywords: "minimal pro compact titles only" },
  { page: "layout", title: "Density", where: "Inbox & layout", keywords: "compact comfortable spacing" },
  { page: "layout", title: "Pinned pages row", where: "Inbox & layout", keywords: "pins favorites circles" },
  { page: "layout", title: "Unread pages first", where: "Inbox & layout", keywords: "sort order" },
  { page: "layout", title: "Default tab", where: "Inbox & layout", keywords: "start unread inbox" },
  { page: "layout", title: "Sidebar width", where: "Inbox & layout", keywords: "resize" },
  { page: "layout", title: "Network badges", where: "Inbox & layout", keywords: "icons whatsapp signal" },
  { page: "privacy", title: "Encryption", where: "Privacy & encryption", keywords: "recovery key backup encrypt end-to-end e2ee key file lock" },
  { page: "privacy", title: "Recovery key", where: "Privacy & encryption", keywords: "lost forgot backup history new device restore" },
  { page: "privacy", title: "Encrypt all my pages", where: "Privacy & encryption", keywords: "turn on encryption convert" },
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
  { page: "advanced", title: "Reload everything from the server", where: "Advanced", keywords: "resync sync reload refresh missing chats cache" },
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
  // Yours at the top, the extra features in the middle, the running of the system at the bottom.
  const groups: [string, string[]][] = [["Yours", ["appearance", "layout", "chats", "notifications", "shortcuts"]], ["Extras", ["labels", "starred", "scheduled", "media"]], ["System", ["bridges", "privacy", "system", "desktop", "admin", "storage", "advanced"]], ["", ["about"]]];
  return (
    <>
      <div className="pill-search wide"><Search size={18} /><input autoFocus placeholder="Search settings" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {t ? (hits.length ? <Group>{hits.map((e) => <Row key={e.title} title={e.title} hint={e.where} onClick={() => nav(`settings/${e.page}`)} chevron />)}</Group> : <EmptyState icon={Search} title="No settings match" body="Try a different word." />)
        : groups.map(([title, ids]) => <Group key={title || "about"} title={title || undefined}>{ids.map((id) => PAGES.find((p) => p.id === id)!).filter((p) => (!p.desktop || window.pagerDesktop) && (p.id !== "admin" || isAdmin)).map((p) => <Row key={p.id} title={p.title} hint={p.hint} icon={p.icon} tint={p.tint} onClick={() => nav(`settings/${p.id}`)} chevron />)}</Group>)}
    </>
  );
}

function Page({ page, nav }: { page: string; nav: Nav }) {
  const s = useRawSettings();
  const u = updateSettings;
  const [deleting, setDeleting] = useState(false);
  const [touring, setTouring] = useState(false);
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
          <Row title="Sidebar width" hint={`${s.sidebarWidth}px`}><input type="range" min="240" max="640" step="10" value={s.sidebarWidth} onChange={(e) => u({ sidebarWidth: Number(e.target.value) })} /></Row>
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
          <SwitchRow title="Open at first unread" hint="Jump to the 'New messages' line" checked={s.openAtUnread} onChange={(v) => u({ openAtUnread: v })} />
          <Select title="Message grouping" value={String(s.groupGapMin)} options={[["1", "Within 1 minute"], ["5", "Within 5 minutes"], ["15", "Within 15 minutes"], ["60", "Within an hour"]]} onChange={(v) => u({ groupGapMin: Number(v) })} />
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
        <EncryptionGroup />
        <Group title="Content" footer="Link previews are fetched by your own server, so the sites you link to never see your device.">
          <SwitchRow title="Link previews" checked={s.linkPreviews} onChange={(v) => u({ linkPreviews: v })} />
          <Select title="Notification content" value={s.notifPreview} options={[["full", "Name and message"], ["sender", "Name only"], ["hidden", "Hide content"]]} onChange={(v) => u({ notifPreview: v })} />
        </Group>
      </>
    );
    case "shortcuts": return <Shortcuts />;
    case "starred": return <Starred nav={nav} />;
    case "scheduled": return <Scheduled />;
    case "system": return <System />;
    case "desktop": return <Desktop />;
    case "storage": return <Backup />;
    case "advanced": return (
      <>
      <Group title="Sync" footer="Use this if a chat is missing, a message never showed up, or this device is out of step with your other devices. Your account and the server are not touched.">
        <Row title="Reload everything from the server" hint="Forgets what this device saved and downloads your chats again" onClick={() => { if (confirm("Reload everything from the server? Your chats are downloaded again, which can take a minute.")) { void resyncFromServer(); nav("home"); } }} />
      </Group>
      <Group title="Developer" footer="Adds event IDs and a 'Copy event ID' action to messages.">
        <SwitchRow title="Developer mode" checked={s.developerMode} onChange={(v) => u({ developerMode: v })} />
      </Group>
      </>
    );
    case "about": return (
      <>
        <Group title="Pager"><Row title={`Version ${import.meta.env.VITE_APP_VERSION ?? "0.3.0"}`} hint={window.pagerDesktop ? `Desktop app (${window.pagerDesktop.platform})` : "Web app"} /><Row title="An open-source, self-hosted unified messenger." />{window.pagerDesktop?.memory && <MemoryRow />}<PerfRow /><Row title="Show the welcome tour again" hint="The mascot walks you through Pager" onClick={() => setTouring(true)} chevron /></Group>
        <Group title="Account"><Row title={me()} hint={http.base || window.location.origin} /><Row title="Sign out" onClick={() => signOut()}><span className="danger">Sign out</span></Row><Row title="Delete my profile" hint="Removes your account and everything on this server. This can't be undone" onClick={() => setDeleting(true)}><span className="danger">Delete</span></Row></Group>
        {deleting && <DeleteProfile onClose={() => setDeleting(false)} />}
        {touring && <Tour nav={nav} forceOpen onClose={() => setTouring(false)} />}
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
  const [picker, setPicker] = useState(false);
  const s = useRawSettings();
  const [pickDouble, setPickDouble] = useState(false);
  return (
    <>
      {window.pagerDesktop && <StyleGroup />}
      <LookGroup />
      <Group title="Theme">
        <Row title="Ready-made looks" hint="A whole colour set for the app, in every colour: on white, on black, or solid. Choose “Mode and accent” to go back to your own mix.">
          <button className={"look-none" + (s.palette === "none" ? " on" : "")} onClick={() => updateSettings({ palette: "none" })}>{s.palette === "none" ? <Check size={14} /> : null} Mode and accent</button>
        </Row>
        <div className="pad">{PALETTE_GROUPS.map(([g, label]) => (
          <div key={g} className="look-group"><small>{label}</small><div className="swatches looks">
            {PALETTES.filter((p) => p.group === g).map((p) => <button key={p.id} className={s.palette === p.id ? "on" : ""} style={{ background: `linear-gradient(135deg, ${p.bg} 50%, ${p.accent} 50%)`, border: `2px solid ${p.line}` }} onClick={() => updateSettings({ palette: p.id, accent: "custom", accentCustom: p.accent })} aria-label={p.name} title={p.name}>{s.palette === p.id ? <Check size={16} color={p.text} /> : null}</button>)}
          </div></div>
        ))}</div>
        <Select title="Mode" value={s.themeMode} options={[["system", "Follow system"], ["light", "Light"], ["dark", "Dark"], ["black", "Black (AMOLED)"]]} onChange={(v) => updateSettings({ themeMode: v })} />
        <Row title="Accent color"><div className="swatches">{Object.entries(ACCENTS).map(([name, c]) => <button key={name} className={s.accent === name ? "on" : ""} style={{ background: c.dark }} onClick={() => updateSettings({ accent: name })} aria-label={name}>{s.accent === name ? <Check size={16} color={c.onDark} /> : null}</button>)}{window.pagerDesktop && <button className={"swatch-system" + (s.accent === "system" ? " on" : "")} onClick={() => updateSettings({ accent: "system" })} aria-label="Match my system accent" title="Match my system accent"><Monitor size={14} color="#fff" /></button>}<button className={"swatch-custom" + (s.accent === "custom" ? " on" : "")} style={s.accent === "custom" ? { background: s.accentCustom } : undefined} onClick={() => setPicker(true)} aria-label="Make your own">{s.accent === "custom" ? <Check size={16} color={accentTones("custom", s.accentCustom).onDark} /> : <Palette size={15} color="#fff" />}</button></div></Row>
        {picker && <ColorDialog value={s.accent === "custom" ? s.accentCustom : accentTones(s.accent, s.accentCustom).light} onClose={() => setPicker(false)} onPick={(c) => { updateSettings({ accent: "custom", accentCustom: c }); setPicker(false); }} />}
      </Group>
      <BubbleGroup />
      <WallpaperGroup />
      <EffectsGroup />
      <AppIconGroup />
      <Group title="Size & font">
        <Select title="App size" hint="Makes everything bigger or smaller, not only the text" value={s.uiScale} options={[["small", "Small"], ["medium", "Medium"], ["large", "Large"]]} onChange={(v) => updateSettings({ uiScale: v })} />
        <Select title="Font" value={s.fontFamily} options={FONTS.map((f) => [f[0], f[1]] as [string, string])} onChange={(v) => updateSettings({ fontFamily: v })} />
      </Group>
      <Group title="Text & messages">
        <Select title="Reactions" value={s.reactionStyle} options={[["filled", "Filled"], ["outline", "Outline"]]} onChange={(v) => updateSettings({ reactionStyle: v })} />
        <SwitchRow title="Delete on the other network too" hint="When you delete a chat in Pager, also delete it on Signal, WhatsApp or Google Messages. It can't be undone, so you are asked each time" checked={s.deleteAtSource} onChange={(v) => updateSettings({ deleteAtSource: v })} />
        <Row title="Text size" hint={`${Math.round(s.fontScale * 100)}%`}><input type="range" min="0.85" max="1.4" step="0.05" value={s.fontScale} onChange={(e) => updateSettings({ fontScale: Number(e.target.value) })} /></Row>
        <Select title="Avatar shape" value={s.avatarShape} options={[["circle", "Circle"], ["squircle", "Rounded square"]]} onChange={(v) => updateSettings({ avatarShape: v })} />
        <SwitchRow title="Color sender names in groups" checked={s.colorSenderNames} onChange={(v) => updateSettings({ colorSenderNames: v })} />
        <SwitchRow title="Large emoji" hint="Emoji-only messages are shown big" checked={s.largeEmoji} onChange={(v) => updateSettings({ largeEmoji: v })} />
      </Group>
      <Group title="Reactions" footer="Click “Double-click to react” to choose which reaction it adds. The switch turns it on or off.">
        <Row title="Double-click to react" hint={s.doubleTapReact ? `Double-click a message to add ${s.doubleTapEmoji || s.quickReactions[0]}` : "Off"} onClick={() => setPickDouble(true)}><span className="dt-emoji">{s.doubleTapEmoji || s.quickReactions[0]}</span><Switch checked={s.doubleTapReact} onChange={(v) => updateSettings({ doubleTapReact: v })} /></Row>
        <SwitchRow title="Swipe to reply" hint="Swipe a message to the right (touch screens, or two fingers on a trackpad)" checked={s.swipeToReply} onChange={(v) => updateSettings({ swipeToReply: v })} />
      </Group>
      {pickDouble && <EmojiPicker recent={s.recentEmoji} onPick={(e) => { updateSettings({ doubleTapEmoji: e }); setPickDouble(false); }} onClose={() => setPickDouble(false)} />}
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
  const off = !s.notifEnabled;
  const isAdmin = useStore((x) => x.isAdmin);
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
        <SwitchRow title="Warn me when an account disconnects" hint="A notification when Google Messages, WhatsApp or another account loses its login" checked={s.accountAlerts} disabled={off} onChange={(v) => updateSettings({ accountAlerts: v })} />
        {isAdmin && <SwitchRow title="Tell me when bridges update" hint="A notification after the weekly automatic update, and if one had to be put back" checked={s.updateAlerts} disabled={off} onChange={(v) => updateSettings({ updateAlerts: v })} />}
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
      <Group title="Sounds" footer="Muted and quiet-hours messages stay silent. A page can have its own sound in its info page.">
        <SwitchRow title="Sounds inside a page" hint="A little sound when you send or get a message in the page you have open" checked={s.convoSounds} onChange={(v) => updateSettings({ convoSounds: v })} />
        <Select title="Send sound" value={s.sendSound} disabled={!s.convoSounds} options={SOUNDS} onChange={(v) => { updateSettings({ sendSound: v }); playSound(v, s.convoSoundVolume); }} />
        <Select title="Reaction sound" value={s.reactionSound} disabled={!s.convoSounds} options={SOUNDS} onChange={(v) => { updateSettings({ reactionSound: v }); playSound(v, s.convoSoundVolume); }} />
        <Select title="Receive sound" value={s.receiveSound} disabled={!s.convoSounds} options={SOUNDS} onChange={(v) => { updateSettings({ receiveSound: v }); playSound(v, s.convoSoundVolume); }} />
        <Row title="Page sound volume" hint={`${Math.round(s.convoSoundVolume * 100)}%`}><input type="range" min="0" max="1" step="0.05" value={s.convoSoundVolume} disabled={!s.convoSounds} onChange={(e) => updateSettings({ convoSoundVolume: Number(e.target.value) })} /></Row>
        <Select title="Alert sound" value={s.notifSoundId} disabled={off} options={SOUNDS} onChange={(v) => { updateSettings({ notifSoundId: v }); playSound(v, s.notifSoundVolume); }} />
        <CustomSoundRow />
        <Row title="Volume" hint={`${Math.round(s.notifSoundVolume * 100)}%`}><input type="range" min="0" max="1" step="0.05" value={s.notifSoundVolume} disabled={off} onChange={(e) => updateSettings({ notifSoundVolume: Number(e.target.value) })} onMouseUp={() => playSound(s.notifSoundId, s.notifSoundVolume)} /></Row>
        <AppSounds off={off} />
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
  const [bulk, setBulk] = useState<{ done: number; total: number }>();
  const pack = useStore((x) => x.userStickers);
  const input = useState<HTMLInputElement | null>(null);
  return (
    <>
      <Group title="GIF search" footer="Add a free key from either (or both) and each gets its own tab in the GIF picker. Pager doesn't ship a shared key. Tenor shut down in June 2026, so a Tenor key no longer works. Keys stay on each device; use Backup & reset > Sync settings > GIF search keys to copy them to another one.">
        {KEY_PROVIDERS.map((p) => <GifKeyRow key={p.id} provider={p} />)}
      </Group>
      <Group title="History" footer="Pager loads older messages as you scroll. This fetches all of them now, so they are on this device. It can take a while and uses data.">
        <Row title={bulk ? (bulk.done >= bulk.total ? `Done: ${bulk.total} pages loaded` : `Loading… ${bulk.done} of ${bulk.total} pages`) : "Load every page's full history"} onClick={() => { if (bulk && bulk.done < bulk.total) return; setBulk({ done: 0, total: 1 }); void loadEveryHistory((done, total) => setBulk({ done, total })); }} />
      </Group>
      <Group title="Voice messages" footer="Needs transcription switched on at your server (scripts/enable-transcription.sh). The words are made on your own server and kept on this device.">
        <SwitchRow title="Write out voice messages automatically" hint="Otherwise use “Write it out” under a message" checked={s.autoTranscribe} onChange={(v) => updateSettings({ autoTranscribe: v })} />
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
        <SwitchRow title="Smooth graphics" hint="Uses your graphics chip for smoother scrolling and animation, and about 30 MB more memory. Takes effect after you restart Pager" checked={s.smoothGraphics} onChange={(v) => { updateSettings({ smoothGraphics: v }); window.pagerDesktop?.setPrefs({ smoothGraphics: v }); }} />
        <SwitchRow title="Start minimized to tray" checked={s.startMinimized} onChange={(v) => { updateSettings({ startMinimized: v }); window.pagerDesktop?.setPrefs({ startMinimized: v }); }} />
      </Group>
      <Group title="Look" footer="Takes your colors from KDE Plasma, GNOME, Windows or macOS and follows them when you change them.">
        <SwitchRow title="Match my system theme" hint="Window colors and light or dark. Pick System in Accent color to use its accent too" checked={s.themeFollowSystem} onChange={(v) => updateSettings({ themeFollowSystem: v })} />
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
  const [syncing, setSyncing] = useState(false);
  const s = useRawSettings();
  return (
    <>
      <Group title="Sync settings" footer="Choose which settings to copy between your computers and browsers. Nothing is copied unless you press the button.">
        <Row title="Sync settings…" hint="Save from this device or load onto it" onClick={() => setSyncing(true)} chevron />
      </Group>
      {syncing && <SyncSettingsDialog onClose={() => setSyncing(false)} />}
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

/** "Make your own" accent: the system colour wheel, or type the colour code. */
function ColorDialog({ value, onClose, onPick }: { value: string; onClose: () => void; onPick: (hex: string) => void }) {
  const [hex, setHex] = useState(value.toLowerCase());
  const ok = /^#[0-9a-f]{6}$/i.test(hex);
  return (
    <Modal title="Make your own" onClose={onClose}>
      <div className="color-dialog">
        <input type="color" aria-label="Colour wheel" value={ok ? hex : "#0d9488"} onChange={(e) => setHex(e.target.value)} />
        <label>Colour code<input className={ok ? "" : "bad"} value={hex} maxLength={7} spellCheck={false} onChange={(e) => setHex(e.target.value.startsWith("#") ? e.target.value : "#" + e.target.value)} /></label>
        <div className="color-preview" style={{ background: ok ? hex : "transparent" }} />
      </div>
      <div className="row-end"><button className="link" onClick={onClose}>Cancel</button><button className="primary" disabled={!ok} onClick={() => onPick(hex.toLowerCase())}>Use this colour</button></div>
    </Modal>
  );
}

/** End-to-end encryption on this device: the recovery key that brings your history back on a new device. */
function EncryptionGroup() {
  const e = useEncryption();
  const [dlg, setDlg] = useState<"create" | "restore" | "export" | "import" | "all">();
  return (
    <Group title="Encryption" footer="Encrypted pages can only be read by your devices. The recovery key lets a new device read your history; Pager can't recover it for you.">
      <Row title="Encryption on this device" hint={e.ready ? `Ready · device ${e.deviceId}` : e.error ? `Couldn't start: ${e.error}` : "Starting…"} onClick={!e.ready && e.error ? () => void retryEncryptionStart() : undefined}>{!e.ready && e.error && <span className="accent">Try again</span>}</Row>
      {e.mismatch && <Row title="This device's keys don't match your account" hint="New messages can't be read here. Sign out, sign in again and enter your recovery key." onClick={() => signOut()}><span className="danger">Sign out</span></Row>}
      {e.ready && <Row title="Device fingerprint" hint={e.fingerprint.match(/.{1,4}/g)?.join(" ")} />}
      <Row title="Recovery key" hint={e.backupHere ? "On: your message keys are backed up" : e.backupOnServer ? "A backup exists. Enter the recovery key to read your history here" : "Not set up yet"}
        onClick={e.ready ? () => setDlg(e.backupOnServer && !e.backupHere ? "restore" : "create") : undefined}>
        <span className="accent">{e.backupHere ? "Replace" : e.backupOnServer ? "Enter key" : "Set up"}</span>
      </Row>
      {e.backupOnServer && e.backupHere === false && <Row title="Make a new recovery key instead" onClick={() => setDlg("create")}><span className="accent">New key</span></Row>}
      {e.ready && <Row title="Encrypt all my pages" hint="Turns on encryption for every page that can take it. Older messages stay readable on your server" onClick={() => setDlg("all")}><span className="accent">Encrypt</span></Row>}
      {e.ready && <Row title="Lost your recovery key?" hint={e.backupHere ? "This device still has your keys: choose Replace above and it makes a new one" : "Use a key file below, or make a new key. Without either, older encrypted messages can't be read on this device"} />}
      {e.ready && <Row title="Advanced: save keys to a file" hint="Not your recovery key. A separate file you protect with a passphrase you choose" onClick={() => setDlg("export")}><span className="accent">Save</span></Row>}
      {e.ready && <Row title="Advanced: restore keys from a file" hint="Only for a file made with the row above. Asks for that file's passphrase" onClick={() => setDlg("import")}><span className="accent">Open</span></Row>}
      {dlg === "create" && <RecoveryKeyDialog onClose={() => setDlg(undefined)} />}
      {dlg === "restore" && <RestoreDialog onClose={() => setDlg(undefined)} onLost={() => setDlg("create")} />}
      {dlg === "all" && <EncryptAllDialog onClose={() => setDlg(undefined)} hasKey={e.backupHere} />}
      {dlg === "export" && <ExportKeysDialog onClose={() => setDlg(undefined)} />}
      {dlg === "import" && <ImportKeysDialog onClose={() => setDlg(undefined)} />}
    </Group>
  );
}

function ExportKeysDialog({ onClose }: { onClose: () => void }) {
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <Modal title="Save my keys to a file" onClose={onClose}>
      <p className="muted">This is a separate, optional backup file: it is <b>not</b> your recovery key. Choose a passphrase for it (you will need it to open the file), and keep both safe, separately.</p>
      <input type="password" autoFocus placeholder="Passphrase (at least 8 characters)" value={pass} onChange={(e) => setPass(e.target.value)} />
      {err && <p className="error">{err}</p>}
      <div className="row-end"><button className="link" onClick={onClose}>Cancel</button>
        <button className="primary" disabled={busy || pass.length < 8} onClick={() => { setBusy(true); setErr(""); exportKeyFile(pass).then((text) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" })); a.download = "pager-keys.txt"; a.click(); onClose(); }).catch((e) => setErr(e.message)).finally(() => setBusy(false)); }}>{busy ? "Saving…" : "Save file"}</button></div>
    </Modal>
  );
}

function ImportKeysDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<number>();
  return (
    <Modal title="Restore keys from a file" onClose={onClose}>
      {done != null ? <p>Done: {done} new message keys. Older messages in your encrypted pages can be read now.</p> : (
        <>
          <p className="muted">This is only for a key <b>file</b> you saved earlier with a passphrase. If you have a recovery key (a code), close this and use <b>Recovery key</b> instead.</p>
          <input type="file" accept=".txt,text/plain" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setName(f.name); setText(await f.text()); } }} />
          <input type="password" placeholder="Passphrase" value={pass} onChange={(e) => setPass(e.target.value)} />
          {err && <p className="error">{err}</p>}
        </>
      )}
      <div className="row-end"><button className="link" onClick={onClose}>{done != null ? "Close" : "Cancel"}</button>
        {done == null && <button className="primary" disabled={busy || !text || !pass} onClick={() => { setBusy(true); setErr(""); importKeyFile(text, pass).then(setDone).catch((e) => setErr(e.message)).finally(() => setBusy(false)); }}>{busy ? "Restoring…" : name ? `Restore ${name}` : "Restore"}</button>}</div>
    </Modal>
  );
}

function EncryptAllDialog({ onClose, hasKey }: { onClose: () => void; hasKey: boolean }) {
  const [state, setState] = useState<"ask" | "run" | "done">("ask");
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [result, setResult] = useState<{ done: number; failed: { name: string; why: string }[] }>();
  return (
    <Modal title="Encrypt all my pages?" onClose={() => state !== "run" && onClose()}>
      {state === "ask" && (
        <>
          <p>Every page that can take encryption will be switched on. Messages from now on are end-to-end encrypted.</p>
          <p className="muted">Older messages stay readable on your server. Encryption can't be turned off again. Pages whose app isn't ready are skipped and listed.</p>
          {!hasKey && <p className="warn">You haven't set up a recovery key on this device. Do that first, so a new device can read your history.</p>}
          <div className="row-end"><button className="link" onClick={onClose}>Cancel</button><button className="primary" onClick={() => { setState("run"); enableEncryptionForAll((a, b) => setProgress([a, b])).then((r) => { setResult(r); setState("done"); }); }}>Encrypt all</button></div>
        </>
      )}
      {state === "run" && <p>Turning on encryption… {progress[0]} of {progress[1]}</p>}
      {state === "done" && result && (
        <>
          <p>{result.done} page{result.done === 1 ? "" : "s"} encrypted.</p>
          {result.failed.length > 0 && <><p className="muted">Skipped {result.failed.length}:</p><ul className="plain small">{result.failed.slice(0, 20).map((f, i) => <li key={i}><b>{f.name}</b><br /><small className="muted">{f.why}</small></li>)}</ul></>}
          <div className="row-end"><button className="primary" onClick={onClose}>Done</button></div>
        </>
      )}
    </Modal>
  );
}

/** Desktop only: pick a whole look (Windows, macOS, KDE, GNOME and more). "Pager default" is the look Pager has always had. */
function StyleGroup() {
  const s = useRawSettings();
  const skin = skinById(s.skin);
  const accents = skin ? accentsFor(skin) : [];
  const [open, setOpen] = useState(() => { try { return localStorage.getItem("pager.styleOpen") === "1"; } catch { return false; } });
  const toggle = () => { setOpen(!open); try { localStorage.setItem("pager.styleOpen", open ? "0" : "1"); } catch { /* private mode */ } };
  return (
    <>
      <Group title="Style" footer={open ? "A whole look for the desktop app: buttons, message field, bubbles, fonts and colours. Pager default keeps the look you know." : undefined}>
        <Row title="Desktop style" hint={skin ? skin.name : "Pager default"} onClick={toggle}><ChevronDown size={18} style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform .2s" }} /></Row>
        {open && <div className="skin-picks">
          <button className={"skin-chip" + (s.skin === "default" ? " on" : "")} onClick={() => updateSettings({ skin: "default", skinAccent: "" })}>Pager default</button>
          {SKIN_GROUPS.map((g) => (
            <div key={g} className="skin-group"><small>{g}</small><div>{SKINS.filter((x) => x.group === g).map((x) => (
              <button key={x.id} className={"skin-chip" + (s.skin === x.id ? " on" : "")} onClick={() => updateSettings({ skin: x.id, skinAccent: "" })}><i style={{ background: `linear-gradient(135deg, ${x.bg} 50%, ${x.accent} 50%)`, borderColor: x.line }} />{x.name}</button>
            ))}</div></div>
          ))}
        </div>}
        {open && skin && accents.length > 0 && <Row title="Accent colour" hint={skin.family === "adwaita" ? "GNOME's accent colours" : "Plasma's accent colours"}><div className="swatches">{accents.map(([n, c]) => <button key={c} className={(s.skinAccent || skin.accent) === c ? "on" : ""} style={{ background: c }} title={n} aria-label={n} onClick={() => updateSettings({ skinAccent: c === skin.accent ? "" : c })}>{(s.skinAccent || skin.accent) === c ? <Check size={16} color="#fff" /> : null}</button>)}</div></Row>}
      </Group>
    </>
  );
}

/** "Sync settings": pick which groups to save from this device, or load onto it. Nothing is copied unless you press a button. */
function SyncSettingsDialog({ onClose }: { onClose: () => void }) {
  const [saved, setSaved] = useState<SavedSettings | undefined>();
  const [ready, setReady] = useState(false);
  const [saveIds, setSaveIds] = useState<string[]>([]);
  const [loadIds, setLoadIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const available = groupsIn(saved);
  useEffect(() => { void loadSavedSettings().then((c) => { setSaved(c); setReady(true); }); }, []);
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const desktop = !!window.pagerDesktop;
  const groups = SYNC_GROUPS.filter((g) => g.id !== "desktop" || desktop);
  return (
    <Modal title="Sync settings" onClose={onClose}>
      <p className="muted">Settings stay on each device. Here you choose what to copy between your computers and browsers. Phones and tablets have their own.</p>
      <h4>Save from this device</h4>
      <div className="sync-list">{groups.map((g) => <label key={g.id} className="check-row"><input type="checkbox" checked={saveIds.includes(g.id)} onChange={() => toggle(saveIds, setSaveIds, g.id)} /><span>{g.label}<small className="muted"> {g.hint}</small></span></label>)}</div>
      <div className="row-end"><button className="primary" disabled={busy || !saveIds.length} onClick={() => { setBusy(true); setNote(""); saveSettingsToAccount(saveIds).then(async () => { setSaved(await loadSavedSettings()); setNote("Saved."); setSaveIds([]); }).catch(() => setNote("Couldn't save. Try again.")).finally(() => setBusy(false)); }}>Save selected</button></div>
      <h4>Load onto this device</h4>
      {!ready ? <p className="muted">Looking…</p> : !available.length ? <p className="muted">Nothing has been saved yet. Save from your other device first.</p> : (
        <>
          <p className="muted small">Last saved {new Date(saved!.savedAt).toLocaleString()} from {saved!.from}.</p>
          <div className="sync-list">{groups.filter((g) => available.includes(g.id)).map((g) => <label key={g.id} className="check-row"><input type="checkbox" checked={loadIds.includes(g.id)} onChange={() => toggle(loadIds, setLoadIds, g.id)} /><span>{g.label}<small className="muted"> {g.hint}</small></span></label>)}</div>
          <div className="row-end"><button className="primary" disabled={!loadIds.length} onClick={() => { const n = loadSaved(saved!, loadIds); setNote(n ? `Changed ${n} setting${n === 1 ? "" : "s"} on this device.` : "Nothing to change: this device already matches."); setLoadIds([]); }}>Load selected</button></div>
        </>
      )}
      {note && <p className="accent">{note}</p>}
      <div className="row-end"><button className="link" onClick={onClose}>Close</button></div>
    </Modal>
  );
}

/** A whole messenger look at once: pick one and colours, bubbles, type and motion change together. "None" gives your own settings back. */
function LookGroup() {
  const s = useRawSettings();
  return (
    <Group title="App look">
      <div className="look-cards">
        <button className={"look-card" + (s.look === "none" ? " on" : "")} onClick={() => updateSettings({ look: "none" })}><span className="look-sw"><i style={{ background: "var(--accent)" }} /><i style={{ background: "var(--theirs)" }} /><i style={{ background: "var(--panel-2)" }} /></span><b>Pager</b><small>Your own colours, bubbles and settings</small></button>
        {LOOKS.map((l) => (
          <button key={l.id} className={"look-card" + (s.look === l.id ? " on" : "")} onClick={() => updateSettings({ look: l.id })}>
            <span className="look-sw">{l.swatch.map((c) => <i key={c} style={{ background: c }} />)}</span><b>{l.name}</b><small>{l.blurb}</small>
          </button>
        ))}
      </div>
      {s.look !== "none" && <p className="muted pad">This look sets colours, bubbles, type and motion for the whole app. Your own choices below are kept and come back when you pick “Pager”.</p>}
    </Group>
  );
}

/** What is moving on screen right now. Click to copy the details; handy when the app is using more processor than it should. */
function PerfRow() {
  const read = () => {
    const anims = document.getAnimations().filter((a) => a.playState === "running");
    const where = (a: Animation) => { const t = (a.effect as KeyframeEffect | null)?.target as Element | null; return `${(a as CSSAnimation).animationName ?? a.constructor.name} on ${t ? `${t.tagName.toLowerCase()}${t.className && typeof t.className === "string" ? "." + t.className.split(" ")[0] : ""}` : "?"}`; };
    const counts = new Map<string, number>(); anims.forEach((a) => counts.set(where(a), (counts.get(where(a)) ?? 0) + 1));
    const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
    return {
      version: import.meta.env.VITE_APP_VERSION, running: anims.length, byKind: Object.fromEntries([...counts].sort((a, b) => b[1] - a[1]).slice(0, 12)),
      domNodes: document.getElementsByTagName("*").length, jsHeapMB: heap ? Math.round(heap / 1048576) : undefined,
      blurred: [...document.querySelectorAll("*")].filter((e) => getComputedStyle(e).backdropFilter !== "none").length,
      idleAttr: document.documentElement.hasAttribute("data-idle"), lowEnd: document.documentElement.hasAttribute("data-lowend"), motion: document.documentElement.dataset.motion ?? "full",
      lastProblem: lastProblem(), dpr: window.devicePixelRatio, window: `${innerWidth}x${innerHeight}`,
    };
  };
  const [r, setR] = useState(read);
  useEffect(() => { const t = window.setInterval(() => setR(read()), 3000); return () => window.clearInterval(t); }, []);
  return <Row title={`Moving on screen: ${r.running} animation${r.running === 1 ? "" : "s"}`} hint="Click to copy the details" onClick={() => void navigator.clipboard?.writeText(JSON.stringify(read(), null, 2))} />;
}

/** Desktop only: what the app is using right now, by part. */
function MemoryRow() {
  const [m, setM] = useState<{ total: number; parts: { type: string; mb: number }[] }>();
  useEffect(() => { const f = () => void window.pagerDesktop?.memory?.().then(setM); f(); const t = window.setInterval(f, 5000); return () => window.clearInterval(t); }, []);
  return <Row title={m ? `Memory in use: ${m.total} MB` : "Memory in use"} hint={m?.parts.filter((p) => p.mb > 0).map((p) => `${p.type} ${p.mb}`).join(" · ")} />;
}


const BORDER_STYLES: [BubbleBorder, string][] = [["none", "None"], ["solid", "Solid"], ["dotted", "Dotted"], ["dashed", "Dashed"], ["thick", "Thick"], ["edge", "Bottom edge"], ["dashdot", "Dash dot"]];
const SHAPES: [AppSettings["bubbleStyle"], string, string][] = [["round", "Rounded", "12px"], ["curved", "Curved tail", "12px 12px 12px 3px"], ["tail", "Pointed tail", "12px 12px 12px 0"], ["outline", "Outlined", "12px"]];

/** A colour row like Beeper's: the name on the left and a swatch on the right that opens a colour picker. */
function ColorSwatchRow({ title, value, onChange }: { title: string; value: string; onChange: (c: string) => void }) {
  const [picker, setPicker] = useState(false);
  return (
    <Row title={title} onClick={() => setPicker(true)}>
      {value && <button type="button" className="link" onClick={(e) => { e.stopPropagation(); onChange(""); }}>Default</button>}
      <span className="swatch-box" style={{ background: value || "var(--panel-2)" }} />
      {picker && <ColorDialog value={value || "#8b7cf6"} onClose={() => setPicker(false)} onPick={(c) => { onChange(c); setPicker(false); }} />}
    </Row>
  );
}

/** Everything Beeper lets you set for one side: colours for light and dark, the shape, the corner radius and the border. */
function SideSettings({ mine }: { mine: boolean }) {
  const s = useRawSettings();
  const look = bubbleLook(s, mine);
  const k = (a: keyof AppSettings, b: keyof AppSettings) => (mine ? a : b);
  const set = (patch: Partial<AppSettings>) => updateSettings(patch);
  const light = mine ? ["bubbleMine", "bubbleMineText"] : ["bubbleTheirs", "bubbleTheirsText"];
  const dark = mine ? ["bubbleMineDark", "bubbleMineTextDark"] : ["bubbleTheirsDark", "bubbleTheirsTextDark"];
  const radius = look.radius || 18;
  return (
    <>
      {!mine && <SwitchRow title="Use native colors" hint="Each network's own colour" checked={s.bubbleNative} onChange={(v) => set({ bubbleNative: v })} />}
      <h4 className="side-h">Light</h4>
      <ColorSwatchRow title="Color" value={s[light[0] as keyof AppSettings] as string} onChange={(c) => set({ [light[0]]: c })} />
      <ColorSwatchRow title="Text color" value={s[light[1] as keyof AppSettings] as string} onChange={(c) => set({ [light[1]]: c })} />
      <h4 className="side-h">Dark</h4>
      <ColorSwatchRow title="Color" value={s[dark[0] as keyof AppSettings] as string} onChange={(c) => set({ [dark[0]]: c })} />
      <ColorSwatchRow title="Text color" value={s[dark[1] as keyof AppSettings] as string} onChange={(c) => set({ [dark[1]]: c })} />
      <Row title="Bubble shape" />
      <div className="shape-tiles" role="radiogroup" aria-label="Bubble shape">
        {SHAPES.map(([id, label, r]) => <button key={id} type="button" role="radio" aria-checked={look.style === id} className={"shape-tile" + (look.style === id ? " on" : "")} onClick={() => set({ [k("outStyle", "bubbleStyle")]: id })} title={label}><i style={{ borderRadius: r, ...(id === "outline" ? { background: "transparent", border: "2px solid currentColor" } : {}) }} /><small>{label}</small></button>)}
      </div>
      <Row title={`Corner radius: ${radius}`}>
        <input type="range" min="0" max="24" step="1" value={radius} onChange={(e) => set({ [k("outRadius", "bubbleRadius")]: Number(e.target.value) })} />
      </Row>
      <Row title="Border style" />
      <div className="shape-tiles scroll" role="radiogroup" aria-label="Border style">
        {BORDER_STYLES.map(([id, label]) => <button key={id} type="button" role="radio" aria-checked={look.border === id} className={"shape-tile" + (look.border === id ? " on" : "")} onClick={() => set({ [k("outBorder", "bubbleBorder")]: id })} title={label}><i className={"bd-sample bd-" + id}>{id === "none" ? "✕" : ""}</i><small>{label}</small></button>)}
      </div>
      {look.border !== "none" && <ColorSwatchRow title="Border color" value={look.borderColor} onChange={(c) => set({ [k("outBorderColor", "bubbleBorderColor")]: c })} />}
    </>
  );
}

/** Message bubbles, laid out like Beeper's: a preview, then Incoming and Outgoing, each with its own colours, shape, corner radius and border. */
function BubbleGroup() {
  const s = useRawSettings();
  const sample = (mine: boolean, text: string) => { const look = bubbleLook(s, mine); const dark = document.documentElement.dataset.theme !== "light"; const col = bubbleColorsFor(s, mine, dark);
    const st: Record<string, string> = {}; if (look.radius > 0) { st["--radius"] = `${look.radius}px`; if (look.style === "round" || look.style === "outline") st["--tight"] = `${Math.min(8, Math.round(look.radius / 3))}px`; }
    if (look.borderColor) st["--bc"] = look.borderColor; if (col.color) { st[mine ? "--mine" : "--bubble-theirs"] = col.color; st[mine ? "--mine-ink" : "--theirs-ink"] = col.text || "#fff"; } else if (col.text) st[mine ? "--mine-ink" : "--theirs-ink"] = col.text;
    return <div className={"msg first last" + (mine ? " mine" : "")} data-shape={look.style} data-border={look.border === "none" ? undefined : look.border} data-colored={col.color || col.text ? "" : undefined} style={st as React.CSSProperties}><div className="bubble">{text}</div></div>; };
  return (
    <Group title="Message bubbles">
      <div className="bubble-preview" aria-hidden>{sample(false, "Hey! How do you like the new theme?")}{sample(true, "It looks amazing! 🎨")}</div>
      <details className="bubble-section"><summary>Incoming</summary><SideSettings mine={false} /></details>
      <details className="bubble-section"><summary>Outgoing</summary><SideSettings mine />
        <Select title="Fill" hint="How your own messages are coloured" value={s.bubbleFill} options={[["solid", "Solid"], ["gradient", "Gradient"], ["tinted", "Soft tint"], ["glass", "Glass"]]} onChange={(v) => updateSettings({ bubbleFill: v })} />
      </details>
      <Select title="Depth" value={s.bubbleDepth} options={[["flat", "Flat"], ["soft", "Soft shadow"], ["raised", "Raised"]]} onChange={(v) => updateSettings({ bubbleDepth: v })} />
      <Row title="Widest bubble" hint={s.bubbleWidth ? `${s.bubbleWidth}% of the chat` : "Default"}>
        <input type="range" min="0" max="95" step="5" value={s.bubbleWidth} onChange={(e) => { const v = Number(e.target.value); updateSettings({ bubbleWidth: v > 0 && v < 40 ? 40 : v }); }} />
      </Row>
      <Select title="Message animation" hint="When a new message appears" value={s.messageAnimation} options={[["none", "None"], ["pop", "Pop"], ["slide", "Slide"], ["fade", "Fade"]]} onChange={(v) => updateSettings({ messageAnimation: v })} />
      <Row title="Reset message bubbles" hint="Undo all bubble color and shape changes made here" onClick={() => updateSettings(RESET_BUBBLES)}><span className="danger">Reset</span></Row>
    </Group>
  );
}

const RESET_BUBBLES: Partial<AppSettings> = { bubbleStyle: "round", bubbleFill: "solid", bubbleDepth: "soft", bubbleBorder: "none", bubbleBorderColor: "", bubbleMine: "", bubbleTheirs: "", bubbleRadius: 0, bubbleWidth: 0,
  outStyle: "", outRadius: -1, outBorder: "", outBorderColor: "", bubbleMineDark: "", bubbleTheirsDark: "", bubbleMineText: "", bubbleTheirsText: "", bubbleMineTextDark: "", bubbleTheirsTextDark: "", bubbleNative: false };

function WallpaperGroup() {
  const s = useRawSettings();
  const file = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState("");
  const [has, setHas] = useState(false);
  const dark = typeof document !== "undefined" && document.documentElement.dataset.theme !== "light";
  useEffect(() => { void loadPhoto().then(setHas); }, []);
  async function pick(f?: File) {
    if (!f) return;
    setErr("");
    try { await importPhoto(f); setHas(true); updateSettings({ wallpaper: "custom" }); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <Group title="Wallpaper" footer="Made in the app, so there is nothing to download. Your own photo stays on this device and is shrunk to save memory.">
      <div className="wp-picks">
        {WALLPAPERS.map((w) => <button key={w.id} className={"wp-pick" + (s.wallpaper === w.id ? " on" : "")} style={{ background: wallpaperCss(w.id, dark) === "none" ? undefined : wallpaperCss(w.id, dark) }} onClick={() => updateSettings({ wallpaper: w.id })}><span>{w.name}</span></button>)}
        <button className={"wp-pick" + (s.wallpaper === "custom" ? " on" : "")} style={has ? { background: "var(--wp-image) center / cover" } : undefined} onClick={() => (has ? updateSettings({ wallpaper: "custom" }) : file.current?.click())}><span>{has ? "Your photo" : "Add photo…"}</span></button>
      </div>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      <Row title="Your own photo" hint={has ? "Saved on this device" : "Pick a picture from your computer"}>
        <button className="link" onClick={() => file.current?.click()}>{has ? "Change…" : "Choose…"}</button>
        {has && <button className="link danger" onClick={async () => { await removePhoto(); setHas(false); if (s.wallpaper === "custom") updateSettings({ wallpaper: "none" }); }}>Remove</button>}
      </Row>
      {err && <p className="error pad">{err}</p>}
      <Row title="Darken" hint={s.wallpaperDim ? `${s.wallpaperDim}%` : "Off"}><input type="range" min="0" max="70" step="5" value={s.wallpaperDim} onChange={(e) => updateSettings({ wallpaperDim: Number(e.target.value) })} /></Row>
    </Group>
  );
}

/** The switch turns screen effects on or off; clicking the row itself shows what sets each one off. */
function EffectsGroup() {
  const s = useRawSettings();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Group title="Screen effects">
        <Row title="Screen effects" hint="Click to see what sets each one off" onClick={() => setOpen(true)} chevron><Switch checked={s.screenEffects} onChange={(v) => updateSettings({ screenEffects: v })} /></Row>
      </Group>
      {open && <Modal title="What sets off each effect" onClose={() => setOpen(false)}>
        <p className="muted">{s.screenEffects ? "Effects are on." : "Effects are off. The switch turns them on."} They play when a new message, sent or received, says one of these. Nothing extra is sent.</p>
        <ul className="effect-list">{EFFECT_TRIGGERS.map((t) => <li key={t.effect}><b>{t.glyph} {t.name}</b><span>{t.says}</span><small className="muted">{t.examples.join("  ")}</small></li>)}</ul>
        <div className="row-end"><button className="link" onClick={() => setOpen(false)}>Close</button></div>
      </Modal>}
    </>
  );
}

/** Settings → System: how times, motion and the odd bits of the app behave. */
function System() {
  const s = useRawSettings();
  return (
    <>
      <Group title="Easy on your connection and your machine" footer="Both are overrides: your own settings are not changed, so switching one off brings everything back.">
        <SwitchRow title="Low data mode" hint="For a slow or limited connection: nothing downloads until you tap it, GIFs don't play by themselves, link previews and typing indicators are off, pictures arrive at half size, and less runs in the background" checked={s.lowData} onChange={(v) => updateSettings({ lowData: v })} />
        <SwitchRow title="Low-end device mode" hint={`For an older or slower computer: no blur or glass, no full-screen effects, no glowing or endlessly looping animations (typing dots, message pops and small effects stay), and fewer messages kept in memory.${window.pagerDesktop ? " Pager also draws the screen without your graphics chip. Takes full effect after you restart Pager" : ""}`} checked={s.lowEnd} onChange={(v) => { updateSettings({ lowEnd: v }); window.pagerDesktop?.setPrefs({ lowEnd: v }); }} />
      </Group>
      <Group title="Time">
        <Select title="Time format" value={s.timeFormat} options={[["system", "Follow system"], ["12", "12-hour"], ["24", "24-hour"]]} onChange={(v) => updateSettings({ timeFormat: v })} />
      </Group>
      <Group title="Motion">
        {window.pagerDesktop && <SwitchRow title="Small animations" hint="Things slide, glide, glow, pop, breathe and fade a little. Off for none" checked={s.fancyMotion} onChange={(v) => updateSettings({ fancyMotion: v })} />}
        <SwitchRow title="Reduce motion" hint="Fewer animations" checked={s.reduceMotion} onChange={(v) => updateSettings({ reduceMotion: v })} />
      </Group>
      <Group title="Extras">
        <SwitchRow title="Hide Stories" hint="Removes the Stories row (WhatsApp status updates) from the list" checked={s.hideStories} onChange={(v) => updateSettings({ hideStories: v })} />
        <SwitchRow title="Silly hello" hint="The pager says something goofy when you open the app" checked={s.greetings} onChange={(v) => updateSettings({ greetings: v })} />
      </Group>
    </>
  );
}

/** Sounds for particular apps. Only the apps you have set up are listed; the + adds one of your connected apps. */
function AppSounds({ off }: { off: boolean }) {
  const s = useRawSettings();
  const bridges = useStore((x) => x.bridges);
  const [adding, setAdding] = useState(false);
  const set = (id: string, v: string) => { const { [id]: _x, ...rest } = s.notifNetworkSound; updateSettings({ notifNetworkSound: v ? { ...rest, [id]: v } : rest }); if (v) playSound(v, s.notifSoundVolume); };
  const mine = Object.keys(s.notifNetworkSound);
  const canAdd = bridges.filter((b) => b.logins.length > 0 && !mine.includes(b.id));
  return (
    <>
      {mine.map((id) => (
        <Select key={"snd" + id} title={`${networkMeta(id).label} sound`} value={s.notifNetworkSound[id]} disabled={off} options={[["", "Same as the app (remove)"], ...SOUNDS]} onChange={(v) => set(id, v)} />
      ))}
      <Row title="Sound for one app" hint={mine.length ? "Add another connected app" : "Give a connected app its own alert sound"} onClick={canAdd.length ? () => setAdding(!adding) : undefined}>
        {canAdd.length ? <Plus size={18} /> : <small className="muted">No more connected apps</small>}
      </Row>
      {adding && canAdd.map((b) => <Row key={b.id} title={b.name} onClick={() => { set(b.id, s.notifSoundId); setAdding(false); }}><small className="accent">Add</small></Row>)}
    </>
  );
}

/** One GIF provider's key, with a button that tries it and says in words what is wrong. */
function GifKeyRow({ provider }: { provider: (typeof KEY_PROVIDERS)[number] }) {
  const s = useRawSettings();
  const key = s.gifKeys[provider.id] ?? "";
  const [state, setState] = useState<"" | "testing" | "ok" | string>("");
  async function test() {
    setState("testing");
    try { const r = await searchGifs(GIF_SOURCES.find((x) => x.keyOf === provider.id)!, key, ""); setState(r.length ? "ok" : "The key was accepted but nothing came back."); } catch (e) { setState((e as Error).message); }
  }
  return (
    <>
      <Row title={`${provider.name} key`} hint={`Free from ${provider.where}${key ? ` · this device has: ${keyFingerprint(key)}` : ""}`}>
        <input type="password" placeholder="Paste your key" value={key} onChange={(e) => { setState(""); updateSettings({ gifKeys: { ...s.gifKeys, [provider.id]: e.target.value.trim() } }); }} />
        <button className="pill" disabled={!key || state === "testing"} onClick={test}>{state === "testing" ? "Trying…" : "Try it"}</button>
      </Row>
      {state === "ok" && <p className="accent pad">{provider.name} works.</p>}
      {state && state !== "ok" && state !== "testing" && <p className="error pad">{state}</p>}
    </>
  );
}

/** Pick a sound file of your own to use for alerts (then choose "Your own sound" in any sound list). */
function CustomSoundRow() {
  const s = useRawSettings();
  const has = useSyncExternalStore(onCustomSoundChange, hasCustomSound);
  const file = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState("");
  return (
    <>
      <Row title="Your own sound" hint={has ? "Saved on this device. Pick “Your own sound” in any sound list to use it" : "Pick an audio file (MP3, OGG, WAV…), up to 30 seconds"}>
        {has && <button className="link" onClick={() => playCustom(s.notifSoundVolume)}>Play</button>}
        <button className="pill" onClick={() => file.current?.click()}>{has ? "Change…" : "Choose file…"}</button>
        {has && <button className="link danger" onClick={() => void removeCustomSound()}>Remove</button>}
      </Row>
      <input ref={file} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { setErr(""); importSound(f).then(() => updateSettings({ notifSoundId: "custom" })).catch((x) => setErr((x as Error).message)); } }} />
      {err && <p className="error pad">{err}</p>}
    </>
  );
}

/** Which colour the app's icon wears: on the browser tab, and in the desktop app on the window and in the tray. */
function AppIconGroup() {
  const s = useRawSettings();
  return (
    <Group title="App icon" footer={window.pagerDesktop ? "Shows on the window and in the tray. Some desktops keep showing the installed icon in the task bar and menus." : "Shows on this browser tab."}>
      <div className="icon-picks" role="radiogroup" aria-label="App icon">
        {APP_ICONS.map((i) => (
          <button key={i.id} type="button" role="radio" aria-checked={s.appIcon === i.id} className={"icon-pick" + (s.appIcon === i.id ? " on" : "")} onClick={() => updateSettings({ appIcon: i.id })} title={i.name}>
            <i style={{ background: `linear-gradient(135deg, ${i.from}, ${i.to})` }}>{s.appIcon === i.id && <Check size={18} color="#fff" />}</i><small>{i.name}</small>
          </button>
        ))}
      </div>
    </Group>
  );
}
