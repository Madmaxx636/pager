import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mascot } from "./ui/Mascot";
import { applyTheme, getSettings, setSystemTheme, useSettings, type SystemTheme } from "./core/settings";
import { forward, getState, requestNotifications, restoreSession, setOpenRoom, useStore } from "./core/store";
import { KeySetup } from "./ui/KeySetup";
import { Auth } from "./ui/Auth";
import { Sidebar } from "./ui/Sidebar";
import { Chat } from "./ui/Chat";
import { Settings } from "./ui/Settings";
import { NewChat } from "./ui/NewChat";
import { Search } from "./ui/Search";
import { ChatPicker } from "./ui/ChatPicker";
import { AccountsModal } from "./ui/Accounts";
import { Palette } from "./ui/Palette";
import { SHORTCUTS } from "./core/settings";
import { comboOf } from "./ui/Settings";
import { markUnread, pin, setMuted, setTag, snooze, useInbox } from "./core/store";
import { WhenModal } from "./ui/common";

export function App() {
  const [booting, setBooting] = useState(true);
  const session = useStore((s) => s.session);
  const synced = useStore((s) => s.synced);
  const st = useSettings();
  // Routes: home | chat:<id> | settings[/<page>] | new | search[:<room>] | forward:<room>|<event>
  const [route, setRoute] = useState("home");
  const [accounts, setAccounts] = useState(false);
  const [palette, setPalette] = useState(false);
  const [snoozing, setSnoozing] = useState<string>();
  const inbox = useInbox();
  const routeRef = useRef(route); routeRef.current = route;
  const inboxRef = useRef(inbox); inboxRef.current = inbox;
  const nav = useCallback((to: string) => setRoute(to), []);

  useEffect(() => { restoreSession().catch(() => {}).finally(() => setBooting(false)); }, []);
  useEffect(() => {
    applyTheme(st);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const f = () => applyTheme(st);
    mq.addEventListener("change", f);
    window.addEventListener("resize", f);
    return () => { mq.removeEventListener("change", f); window.removeEventListener("resize", f); };
  }, [st]);
  useEffect(() => {
    const d = window.pagerDesktop;
    if (!d?.getSystemTheme) return;
    const apply = (t: SystemTheme) => { setSystemTheme(t); applyTheme(getSettings()); };
    void d.getSystemTheme().then(apply).catch(() => {});
    d.onSystemTheme(apply);
  }, []);
  useEffect(() => {
    const open = (e: Event) => nav(`chat:${(e as CustomEvent<string>).detail}`);
    window.addEventListener("pager:open", open);
    window.pagerDesktop?.onOpenRoom((id) => nav(`chat:${id}`));
    return () => window.removeEventListener("pager:open", open);
  }, [nav]);
  useEffect(() => { if (session) requestNotifications(); }, [session]);

  // Keyboard shortcuts (rebindable in Settings → Keyboard shortcuts).
  useEffect(() => {
    if (!session) return;
    const bound = (id: string) => st.shortcuts[id] ?? SHORTCUTS.find((s) => s.id === id)!.keys;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Shift" || e.key === "Alt" || e.key === "Meta") return;
      const combo = comboOf(e);
      const hit = SHORTCUTS.find((s) => bound(s.id) === combo);
      if (!hit) return;
      const typing = (e.target as HTMLElement)?.matches?.("input, textarea, [contenteditable]");
      if (typing && !combo.includes("Ctrl") && !combo.includes("Alt")) return;
      const cur = routeRef.current.startsWith("chat:") ? routeRef.current.slice(5) : undefined;
      const list = inboxRef.current.filter((c) => !c.archived && !c.lowPriority);
      const move = (d: number, unreadOnly = false) => { const pool = unreadOnly ? list.filter((c) => c.unread > 0 || c.markedUnread || c.id === cur) : list; const i = pool.findIndex((c) => c.id === cur); const n = pool[(i + d + pool.length) % pool.length]; if (n) nav(`chat:${n.id}`); };
      const c = inboxRef.current.find((x) => x.id === cur);
      e.preventDefault();
      switch (hit.id) {
        case "palette": setPalette(true); break;
        case "newChat": nav("new"); break;
        case "search": nav("search"); break;
        case "inChatSearch": if (cur) nav(`search:${cur}`); break;
        case "settings": nav("settings"); break;
        case "prevChat": move(-1); break;
        case "nextChat": move(1); break;
        case "nextUnread": move(1, true); break;
        case "archive": if (c) setTag(c.id, "u.archived", !c.archived); break;
        case "markUnread": if (c) markUnread(c.id, true); break;
        case "mute": if (c) setMuted(c.id, !c.muted); break;
        case "pin": if (c) pin(c.id, !c.pinned); break;
        case "snooze": if (c) setSnoozing(c.id); break;
        case "help": nav("settings/shortcuts"); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [session, st.shortcuts, nav]);

  if (booting) return <div className="splash"><Mascot size={140} mood="ring" /></div>;
  if (!session) return <Auth />;

  const [kind, ...rest] = route.split(":");
  const arg = rest.join(":");
  const roomId = kind === "chat" ? arg : null;
  const home = () => nav("home");
  setOpenRoom(roomId);

  let main: React.ReactElement;
  if (kind === "chat") main = <Chat key={arg} roomId={arg} onBack={home} nav={nav} onForward={(m) => nav(`forward:${arg}|${m.id}`)} />;
  else if (route.startsWith("settings")) main = <Settings page={route.split("/")[1] ?? ""} nav={nav} onBack={home} />;
  else if (kind === "new") main = <NewChat onBack={home} onOpen={(id) => nav(`chat:${id}`)} />;
  else if (kind === "search") main = <Search roomId={arg || undefined} onBack={() => nav(arg ? `chat:${arg}` : "home")} onOpen={(id) => nav(`chat:${id}`)} />;
  else if (kind === "forward") {
    const [from, id] = arg.split("|");
    main = <ChatPicker title="Forward to…" onBack={() => nav(`chat:${from}`)} onPick={(target) => { const m = getState().chats[from]?.messages.find((x) => x.id === id); if (m) forward(m, target); nav(`chat:${target}`); }} />;
  } else main = <div className="blank"><Mascot size={170} mood={synced ? "idle" : "ring"} /><p>{synced ? "Pick a page to start." : "Syncing…"}</p></div>;

  return (
    <div className={"shell" + (route !== "home" ? " pane-open" : "")} style={{ ["--sidebar-w" as string]: `${st.sidebarWidth}px` }}>
      <Sidebar selected={roomId} onSelect={(id) => nav(`chat:${id}`)} nav={nav} onAccounts={() => setAccounts(true)} />
      <main className="main">{main}</main>
      <KeySetup />
      {accounts && <AccountsModal onClose={() => setAccounts(false)} />}
      {palette && <Palette nav={nav} current={roomId ?? undefined} onClose={() => setPalette(false)} onSnooze={setSnoozing} />}
      {snoozing && <WhenModal title="Snooze until" onPick={(at) => { snooze(snoozing, at); setSnoozing(undefined); }} onClose={() => setSnoozing(undefined)} />}
    </div>
  );
}
