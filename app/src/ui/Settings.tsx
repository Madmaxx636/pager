import { useEffect, useState } from "react";
import { ACCENTS, DEFAULTS, DEFAULT_QUICK_REACTIONS, resetSettings, updateSettings, useSettings } from "../core/settings";
import { cancelReminder, cancelScheduled, me, signOut, useStore } from "../core/store";
import { http } from "../core/api";
import { networkMeta } from "../core/emoji";
import { EmojiPicker, Row, Select, SwitchRow } from "./common";
import { BridgesPage } from "./Accounts";
import type { Nav } from "./Sidebar";

const PAGES: [string, string, string, string][] = [
  ["appearance", "🎨", "Appearance", "Theme, colors, text size, bubbles, reactions"],
  ["layout", "🧩", "Layout", "Chat list density and what's shown"],
  ["chats", "💬", "Chats", "Sending, receipts, link previews, media"],
  ["notifications", "🔔", "Notifications", "Previews, sound, quiet hours, per-network"],
  ["bridges", "🔗", "Bridges & accounts", "Connected apps, status, hide networks"],
  ["starred", "⭐", "Starred messages", ""],
  ["scheduled", "⏰", "Scheduled & reminders", ""],
  ["desktop", "🖥", "Desktop", "Tray, startup"],
  ["storage", "💾", "Reset", "Put every setting back to default"],
  ["about", "ℹ️", "About", "Version, server, sign out"],
];

export function Settings({ page, nav, onBack }: { page: string; nav: Nav; onBack: () => void }) {
  const title = PAGES.find((p) => p[0] === page)?.[2] ?? "Settings";
  return (
    <section className="page">
      <header><button className="icon back always" onClick={() => (page ? nav("settings") : onBack())}>‹</button><h2>{title}</h2></header>
      <div className="page-body">{page ? <Page page={page} nav={nav} /> : (
        <ul className="plain">{PAGES.filter((p) => p[0] !== "desktop" || window.pagerDesktop).map(([id, icon, name, hint]) => (
          <li key={id}><button className="list-btn nav" onClick={() => nav(`settings/${id}`)}><span className="ico">{icon}</span><div><b>{name}</b>{hint && <small>{hint}</small>}</div><span>›</span></button></li>
        ))}</ul>
      )}</div>
    </section>
  );
}

function Page({ page, nav }: { page: string; nav: Nav }) {
  const s = useSettings();
  const u = updateSettings;
  switch (page) {
    case "appearance": return <Appearance />;
    case "layout": return (
      <>
        <h3 className="sec">Chat list</h3>
        <Select title="Density" value={s.density} options={[["comfortable", "Comfortable"], ["compact", "Compact"]]} onChange={(v) => u({ density: v })} />
        <SwitchRow title="Show avatars" checked={s.showAvatars} onChange={(v) => u({ showAvatars: v })} />
        <SwitchRow title="Show network badges" hint="The small WhatsApp/Signal/… icon on avatars" checked={s.showNetworkBadges} onChange={(v) => u({ showNetworkBadges: v })} />
        <SwitchRow title="Show network name" hint="Under each chat name" checked={s.showNetworkNameInRows} onChange={(v) => u({ showNetworkNameInRows: v })} />
        <SwitchRow title="Show message previews" checked={s.showPreviews} onChange={(v) => u({ showPreviews: v })} />
        <SwitchRow title="Show filter bar" hint="Unread, Groups, Favorites and network filters" checked={s.showFilterBar} onChange={(v) => u({ showFilterBar: v })} />
        <h3 className="sec">Conversation</h3>
        <SwitchRow title="Show message times" checked={s.showMessageTimes} onChange={(v) => u({ showMessageTimes: v })} />
        <SwitchRow title="Show delivery & read ticks" checked={s.showReadTicks} onChange={(v) => u({ showReadTicks: v })} />
      </>
    );
    case "chats": return (
      <>
        <h3 className="sec">Sending</h3>
        <SwitchRow title="Enter key sends" hint="Off: Ctrl+Enter sends and Enter adds a new line" checked={s.enterToSend} onChange={(v) => u({ enterToSend: v })} />
        <SwitchRow title="Mention suggestions" hint="Type @ in a group to pick someone" checked={s.mentionSuggestions} onChange={(v) => u({ mentionSuggestions: v })} />
        <h3 className="sec">Privacy</h3>
        <SwitchRow title="Send read receipts" hint="Off: others won't see when you've read their messages" checked={s.sendReadReceipts} onChange={(v) => u({ sendReadReceipts: v })} />
        <SwitchRow title="Send typing indicators" checked={s.sendTyping} onChange={(v) => u({ sendTyping: v })} />
        <h3 className="sec">Media & links</h3>
        <SwitchRow title="Link previews" hint="Your server fetches the page to build the preview" checked={s.linkPreviews} onChange={(v) => u({ linkPreviews: v })} />
        <Select title="Auto-download media" value={s.autoDownload} options={[["always", "Always"], ["never", "Never (click to load)"]]} onChange={(v) => u({ autoDownload: v })} />
        <h3 className="sec">Inbox behavior</h3>
        <SwitchRow title="Unarchive on new message" hint="Archived chats come back when someone writes (unless muted)" checked={s.unarchiveOnMessage} onChange={(v) => u({ unarchiveOnMessage: v })} />
        <SwitchRow title="Confirm before deleting" checked={s.confirmDelete} onChange={(v) => u({ confirmDelete: v })} />
      </>
    );
    case "notifications": return <Notifications />;
    case "bridges": return <BridgesPage />;
    case "starred": return <Starred nav={nav} />;
    case "scheduled": return <Scheduled />;
    case "desktop": return <Desktop />;
    case "storage": return (
      <>
        <p className="muted pad">Puts every setting back to its default. Your chats and accounts aren't touched.</p>
        <div className="pad"><button className="primary" onClick={() => confirm("Reset all settings?") && resetSettings()}>Reset all settings</button></div>
      </>
    );
    case "about": return (
      <>
        <h3 className="sec">Pager</h3><p className="pad">Version {import.meta.env.VITE_APP_VERSION ?? "0.2.0"}{window.pagerDesktop ? ` · desktop (${window.pagerDesktop.platform})` : " · web"}</p>
        <p className="muted pad">An open-source, self-hosted unified messenger.</p>
        <h3 className="sec">Account</h3><p className="pad">{me()}</p><p className="muted pad">{http.base || window.location.origin}</p>
        <div className="pad"><button className="primary" onClick={() => signOut()}>Sign out</button></div>
      </>
    );
    default: return null;
  }
}

function Appearance() {
  const s = useSettings();
  const [editing, setEditing] = useState<number>();
  return (
    <>
      <h3 className="sec">Theme</h3>
      <Select title="Mode" value={s.themeMode} options={[["system", "Follow system"], ["light", "Light"], ["dark", "Dark"], ["black", "Black (AMOLED)"]]} onChange={(v) => updateSettings({ themeMode: v })} />
      <Row title="Accent color"><div className="swatches">{Object.entries(ACCENTS).map(([name, c]) => <button key={name} className={s.accent === name ? "on" : ""} style={{ background: c.dark }} onClick={() => updateSettings({ accent: name })} aria-label={name}>{s.accent === name ? "✓" : ""}</button>)}</div></Row>
      <h3 className="sec">Text & messages</h3>
      <Row title="Text size" hint={`${Math.round(s.fontScale * 100)}%`}><input type="range" min="0.85" max="1.4" step="0.05" value={s.fontScale} onChange={(e) => updateSettings({ fontScale: Number(e.target.value) })} /></Row>
      <Select title="Bubble style" value={s.bubbleStyle} options={[["round", "Rounded"], ["soft", "Extra round"], ["square", "Square"]]} onChange={(v) => updateSettings({ bubbleStyle: v })} />
      <Select title="Chat wallpaper" value={s.wallpaper} options={[["none", "None"], ["dusk", "Dusk"], ["forest", "Forest"], ["ocean", "Ocean"], ["sand", "Sand"], ["graphite", "Graphite"]]} onChange={(v) => updateSettings({ wallpaper: v })} />
      <Select title="Time format" value={s.timeFormat} options={[["system", "Follow system"], ["12", "12-hour"], ["24", "24-hour"]]} onChange={(v) => updateSettings({ timeFormat: v })} />
      <SwitchRow title="Color sender names in groups" checked={s.colorSenderNames} onChange={(v) => updateSettings({ colorSenderNames: v })} />
      <h3 className="sec">Reactions</h3>
      <SwitchRow title="Double-click to react" hint="Double-click a message to add your first quick reaction" checked={s.doubleTapReact} onChange={(v) => updateSettings({ doubleTapReact: v })} />
      <Row title="Quick reactions" hint="Shown first when you right-click a message. Click one to change it.">
        <div className="quick-edit">{s.quickReactions.map((e, i) => <button key={i} onClick={() => setEditing(i)}>{e}</button>)}</div>
      </Row>
      <div className="pad"><button className="link" onClick={() => updateSettings({ quickReactions: DEFAULT_QUICK_REACTIONS })}>Reset to defaults</button></div>
      {editing !== undefined && <EmojiPicker recent={s.recentEmoji} onPick={(e) => { const q = [...s.quickReactions]; q[editing] = e; updateSettings({ quickReactions: q }); setEditing(undefined); }} onClose={() => setEditing(undefined)} />}
    </>
  );
}

const fmtMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const parseMin = (v: string) => { const [h, m] = v.split(":").map(Number); return (h || 0) * 60 + (m || 0); };

function Notifications() {
  const s = useSettings();
  const [perm, setPerm] = useState(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  const known = ["whatsapp", "signal", "telegram", "discord", "instagram", "messenger", "gmessages"];
  return (
    <>
      <SwitchRow title="Notifications" hint="Master switch for message alerts" checked={s.notifEnabled} onChange={(v) => updateSettings({ notifEnabled: v })} />
      {perm === "default" && <div className="pad"><button className="pill" onClick={async () => setPerm(await Notification.requestPermission())}>Allow browser notifications</button></div>}
      {perm === "denied" && <p className="warn pad">Notifications are blocked in your browser settings.</p>}
      <h3 className="sec">Content</h3>
      <Select title="Show" value={s.notifPreview} options={[["full", "Name and message"], ["sender", "Name only"], ["hidden", "Hide content"]]} onChange={(v) => updateSettings({ notifPreview: v })} />
      <h3 className="sec">Alerts</h3>
      <SwitchRow title="Sound" checked={s.notifSound} disabled={!s.notifEnabled} onChange={(v) => updateSettings({ notifSound: v })} />
      <SwitchRow title="Groups: only when mentioned" hint="Group chats stay quiet unless someone @mentions you" checked={s.notifGroupMentionsOnly} disabled={!s.notifEnabled} onChange={(v) => updateSettings({ notifGroupMentionsOnly: v })} />
      <h3 className="sec">Quiet hours</h3>
      <SwitchRow title="Quiet hours" hint="Messages arrive silently during this time" checked={s.quietHoursEnabled} disabled={!s.notifEnabled} onChange={(v) => updateSettings({ quietHoursEnabled: v })} />
      {s.quietHoursEnabled && <>
        <Row title="From"><input type="time" value={fmtMin(s.quietStartMin)} onChange={(e) => updateSettings({ quietStartMin: parseMin(e.target.value) })} /></Row>
        <Row title="Until"><input type="time" value={fmtMin(s.quietEndMin)} onChange={(e) => updateSettings({ quietEndMin: parseMin(e.target.value) })} /></Row>
      </>}
      <h3 className="sec">Per network</h3>
      {known.map((id) => <SwitchRow key={id} title={networkMeta(id).label} checked={!s.notifMutedNetworks.includes(id)} disabled={!s.notifEnabled} onChange={(on) => updateSettings({ notifMutedNetworks: on ? s.notifMutedNetworks.filter((x) => x !== id) : [...s.notifMutedNetworks, id] })} />)}
    </>
  );
}

function Starred({ nav }: { nav: Nav }) {
  const stars = useStore((s) => s.stars);
  if (!stars.length) return <p className="muted pad">Nothing starred yet. Right-click a message and choose Star.</p>;
  return <ul className="plain">{[...stars].sort((a, b) => b.ts - a.ts).map((st) => (
    <li key={st.eventId}><button className="list-btn col" onClick={() => nav(`chat:${st.roomId}`)}><small className="accent">{st.sender} · {st.chat}</small><span>{st.text}</span><small>{new Date(st.ts).toLocaleString()}</small></button></li>
  ))}</ul>;
}

function Scheduled() {
  const scheduled = useStore((s) => s.scheduled), reminders = useStore((s) => s.reminders);
  return (
    <>
      <h3 className="sec">Scheduled messages</h3>
      {!scheduled.length && <p className="muted pad">No scheduled messages. Use the ▾ next to Send to schedule one.</p>}
      {[...scheduled].sort((a, b) => a.whenMs - b.whenMs).map((m) => <Row key={m.delayId} title={m.text} hint={`To ${m.chat} · ${new Date(m.whenMs).toLocaleString()}`}><button className="link danger" onClick={() => cancelScheduled(m)}>Cancel</button></Row>)}
      <h3 className="sec">Chat reminders</h3>
      {!reminders.length && <p className="muted pad">No reminders. Right-click a chat and choose Remind me.</p>}
      {[...reminders].sort((a, b) => a.whenMs - b.whenMs).map((r) => <Row key={r.id} title={r.chat} hint={new Date(r.whenMs).toLocaleString()}><button className="link danger" onClick={() => cancelReminder(r)}>Cancel</button></Row>)}
    </>
  );
}

function Desktop() {
  const s = useSettings();
  const [auto, setAuto] = useState(false);
  useEffect(() => { void window.pagerDesktop?.getAutostart().then(setAuto); }, []);
  return (
    <>
      <SwitchRow title="Keep running in the tray when closed" hint="Closing the window hides Pager so messages keep arriving" checked={s.closeToTray} onChange={(v) => { updateSettings({ closeToTray: v }); window.pagerDesktop?.setCloseToTray(v); }} />
      <SwitchRow title="Launch at login" checked={auto} onChange={(v) => { setAuto(v); window.pagerDesktop?.setAutostart(v); }} />
      <SwitchRow title="Start minimized to tray" checked={s.startMinimized} onChange={(v) => updateSettings({ startMinimized: v })} />
    </>
  );
}

export { DEFAULTS };
