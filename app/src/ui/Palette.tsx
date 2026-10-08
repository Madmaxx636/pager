import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowDownToLine, BellOff, CheckCheck, Inbox, Keyboard, MailOpen, Pin, Search, Settings as SettingsIcon, SquarePen, Star, Hourglass, MessageSquare } from "lucide-react";
import { markAllRead, markUnread, pin, setLowPriority, setMuted, setTag, useInbox } from "../core/store";
import { networkMeta } from "../core/emoji";
import { Avatar } from "./common";
import { SETTINGS_INDEX } from "./Settings";
import type { Nav } from "./Sidebar";

interface Entry { id: string; label: string; hint?: string; icon?: React.ComponentType<{ size?: number }>; avatar?: { name: string; mxc?: string; network?: string }; run: () => void; group: string }

/** Ctrl/Cmd+K: jump to any chat, run any action, or open any setting by typing. */
export function Palette({ nav, current, onClose, onSnooze }: { nav: Nav; current?: string; onClose: () => void; onSnooze: (roomId: string) => void }) {
  const chats = useInbox();
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const go = (to: string) => () => { nav(to); onClose(); };
  const cur = chats.find((c) => c.id === current);

  const entries = useMemo<Entry[]>(() => {
    const actions: Entry[] = [
      { id: "a-new", label: "New chat", icon: SquarePen, run: go("new"), group: "Actions" },
      { id: "a-search", label: "Search all messages", icon: Search, run: go("search"), group: "Actions" },
      { id: "a-read", label: "Mark all chats as read", icon: CheckCheck, run: () => { markAllRead(); onClose(); }, group: "Actions" },
      { id: "a-star", label: "Starred messages", icon: Star, run: go("settings/starred"), group: "Actions" },
      { id: "a-keys", label: "Keyboard shortcuts", icon: Keyboard, run: go("settings/shortcuts"), group: "Actions" },
      { id: "a-set", label: "Settings", icon: SettingsIcon, run: go("settings"), group: "Actions" },
    ];
    if (cur) actions.unshift(
      { id: "c-arch", label: cur.archived ? `Move “${cur.name}” to inbox` : `Archive “${cur.name}”`, icon: Archive, run: () => { setTag(cur.id, "u.archived", !cur.archived); onClose(); }, group: "This chat" },
      { id: "c-unread", label: `Mark “${cur.name}” unread`, icon: MailOpen, run: () => { markUnread(cur.id, true); onClose(); }, group: "This chat" },
      { id: "c-pin", label: cur.pinned ? `Unpin “${cur.name}”` : `Pin “${cur.name}”`, icon: Pin, run: () => { pin(cur.id, !cur.pinned); onClose(); }, group: "This chat" },
      { id: "c-mute", label: cur.muted ? `Unmute “${cur.name}”` : `Mute “${cur.name}”`, icon: BellOff, run: () => { setMuted(cur.id, !cur.muted); onClose(); }, group: "This chat" },
      { id: "c-low", label: cur.lowPriority ? `Remove “${cur.name}” from low priority` : `Low priority: “${cur.name}”`, icon: ArrowDownToLine, run: () => { setLowPriority(cur.id, !cur.lowPriority); onClose(); }, group: "This chat" },
      { id: "c-snooze", label: `Snooze “${cur.name}”…`, icon: Hourglass, run: () => { onSnooze(cur.id); onClose(); }, group: "This chat" },
    );
    const settings: Entry[] = SETTINGS_INDEX.map((e) => ({ id: `s-${e.page}-${e.title}`, label: e.title, hint: e.where, icon: SettingsIcon, run: go(`settings/${e.page}`), group: "Settings" }));
    const people: Entry[] = chats.map((c) => ({ id: `chat-${c.id}`, label: c.name, hint: networkMeta(c.network).label, avatar: { name: c.name, mxc: c.avatarMxc, network: c.network }, run: go(`chat:${c.id}`), group: "Chats" }));
    return [...people, ...actions, ...settings];
  }, [chats, cur?.id, cur?.archived, cur?.pinned, cur?.muted, cur?.lowPriority]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = q.trim().toLowerCase();
  const shown = (t ? entries.filter((e) => `${e.label} ${e.hint ?? ""}`.toLowerCase().includes(t)) : [...entries.filter((e) => e.group === "This chat"), ...entries.filter((e) => e.group === "Chats").slice(0, 8), ...entries.filter((e) => e.group === "Actions")]).slice(0, 40);
  useEffect(() => setAt(0), [q]);
  useEffect(() => { list.current?.querySelector(".on")?.scrollIntoView({ block: "nearest" }); }, [at]);

  const key = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setAt((i) => Math.min(shown.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAt((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); shown[at]?.run(); }
    else if (e.key === "Escape") onClose();
  };
  let lastGroup = "";
  return (
    <div className="overlay top" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label="Command bar">
        <div className="palette-input"><Search size={20} /><input autoFocus placeholder="Jump to a chat, run an action, or find a setting" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} /><kbd>Esc</kbd></div>
        <div className="palette-list" ref={list}>
          {shown.length === 0 && <p className="muted pad">Nothing matches “{q}”.</p>}
          {shown.map((e, i) => {
            const header = e.group !== lastGroup ? (lastGroup = e.group) : null;
            const Icon = e.icon ?? MessageSquare;
            return (
              <div key={e.id}>
                {header && <h4>{header}</h4>}
                <button className={"palette-item" + (i === at ? " on" : "")} onMouseEnter={() => setAt(i)} onClick={e.run}>
                  {e.avatar ? <Avatar name={e.avatar.name} mxc={e.avatar.mxc} size={28} network={e.avatar.network} /> : <span className="pi"><Icon size={16} /></span>}
                  <span className="grow">{e.label}</span>{e.hint && <small>{e.hint}</small>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { Inbox };
