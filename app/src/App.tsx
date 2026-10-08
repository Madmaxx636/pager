import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { applyTheme, useSettings } from "./core/settings";
import { forward, getState, requestNotifications, restoreSession, useStore } from "./core/store";
import { Auth } from "./ui/Auth";
import { Sidebar } from "./ui/Sidebar";
import { Chat } from "./ui/Chat";
import { Settings } from "./ui/Settings";
import { NewChat } from "./ui/NewChat";
import { Search } from "./ui/Search";
import { ChatPicker } from "./ui/ChatPicker";
import { AccountsModal } from "./ui/Accounts";

export function App() {
  const [booting, setBooting] = useState(true);
  const session = useStore((s) => s.session);
  const synced = useStore((s) => s.synced);
  const st = useSettings();
  // Routes: home | chat:<id> | settings[/<page>] | new | search[:<room>] | forward:<room>|<event>
  const [route, setRoute] = useState("home");
  const [accounts, setAccounts] = useState(false);
  const nav = useCallback((to: string) => setRoute(to), []);

  useEffect(() => { restoreSession().catch(() => {}).finally(() => setBooting(false)); }, []);
  useEffect(() => {
    applyTheme(st);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const f = () => applyTheme(st);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [st]);
  useEffect(() => {
    const open = (e: Event) => nav(`chat:${(e as CustomEvent<string>).detail}`);
    window.addEventListener("pager:open", open);
    window.pagerDesktop?.onOpenRoom((id) => nav(`chat:${id}`));
    return () => window.removeEventListener("pager:open", open);
  }, [nav]);
  useEffect(() => { if (session) requestNotifications(); }, [session]);

  if (booting) return <div className="splash"><span className="logo-mark big" /></div>;
  if (!session) return <Auth />;

  const [kind, ...rest] = route.split(":");
  const arg = rest.join(":");
  const roomId = kind === "chat" ? arg : null;
  const home = () => nav("home");

  let main: React.ReactElement;
  if (kind === "chat") main = <Chat key={arg} roomId={arg} onBack={home} nav={nav} onForward={(m) => nav(`forward:${arg}|${m.id}`)} />;
  else if (route.startsWith("settings")) main = <Settings page={route.split("/")[1] ?? ""} nav={nav} onBack={home} />;
  else if (kind === "new") main = <NewChat onBack={home} onOpen={(id) => nav(`chat:${id}`)} />;
  else if (kind === "search") main = <Search roomId={arg || undefined} onBack={() => nav(arg ? `chat:${arg}` : "home")} onOpen={(id) => nav(`chat:${id}`)} />;
  else if (kind === "forward") {
    const [from, id] = arg.split("|");
    main = <ChatPicker title="Forward to…" onBack={() => nav(`chat:${from}`)} onPick={(target) => { const m = getState().chats[from]?.messages.find((x) => x.id === id); if (m) forward(m, target); nav(`chat:${target}`); }} />;
  } else main = <div className="blank"><span className="logo-mark big" /><p>{synced ? "Pick a chat to start." : "Syncing…"}</p></div>;

  return (
    <div className={"shell" + (route !== "home" ? " pane-open" : "")}>
      <Sidebar selected={roomId} onSelect={(id) => nav(`chat:${id}`)} nav={nav} onAccounts={() => setAccounts(true)} />
      <main className="main">{main}</main>
      {accounts && <AccountsModal onClose={() => setAccounts(false)} />}
    </div>
  );
}
