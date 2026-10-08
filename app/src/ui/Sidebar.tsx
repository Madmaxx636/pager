import { useEffect, useMemo, useRef, useState } from "react";
import { ChatSummary } from "../core/types";
import { networkMeta } from "../core/emoji";
import { markAllRead, markRead, markUnread, remind, setMuted, setTag, signOut, useInbox, useStore, me } from "../core/store";
import { useSettings } from "../core/settings";
import { Avatar, Modal, TimePresetModal } from "./common";
import { needsAttention } from "./Accounts";

function timeLabel(ts: number) {
  if (!ts) return "";
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (now.getTime() - ts < 6 * 864e5) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export type Nav = (to: string) => void;

export function Sidebar({ selected, onSelect, nav, onAccounts }: { selected: string | null; onSelect: (id: string) => void; nav: Nav; onAccounts: () => void }) {
  const st = useSettings();
  const all = useInbox();
  const synced = useStore((s) => s.synced);
  const bridges = useStore((s) => s.bridges);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [archived, setArchived] = useState(false);
  const [menu, setMenu] = useState(false);
  const [ctx, setCtx] = useState<{ c: ChatSummary; x: number; y: number }>();
  const [muteFor, setMuteFor] = useState<ChatSummary>();
  const [remindFor, setRemindFor] = useState<ChatSummary>();
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); search.current?.focus(); search.current?.select(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const visible = useMemo(() => all.filter((c) => c.archived === archived), [all, archived]);
  const networks = useMemo(() => [...new Set(visible.map((c) => c.network))].sort(), [visible]);
  const unreadCount = visible.filter((c) => c.unread > 0 || c.markedUnread).length;
  const q = query.trim().toLowerCase();
  const shown = visible.filter((c) => {
    const ok = filter === "all" ? true : filter === "unread" ? c.unread > 0 || c.markedUnread : filter === "groups" ? c.isGroup : filter === "dms" ? !c.isGroup : filter === "fav" ? c.pinned : filter.startsWith("net:") ? c.network === filter.slice(4) : true;
    return ok && (!q || c.name.toLowerCase().includes(q) || c.preview.toLowerCase().includes(q));
  });
  const totalUnread = all.filter((c) => !c.archived && !c.muted && (c.unread > 0 || c.markedUnread)).length;
  const attention = [...new Set(bridges.flatMap((n) => n.logins.filter((l) => needsAttention(l.state_event)).map(() => n.name)))];
  const archivedCount = all.filter((c) => c.archived).length;

  return (
    <aside className="sidebar">
      <header>
        <div className="logo"><span className="logo-mark" /><b>{archived ? "Archived" : "Pager"}</b>{!archived && totalUnread > 0 && <small className="muted">{totalUnread} unread</small>}</div>
        <div className="header-actions">
          <button className="icon" onClick={() => nav("new")} title="New chat" aria-label="New chat">✎</button>
          <button className="icon" onClick={() => nav("search")} title="Search all messages" aria-label="Search">🔍</button>
          <div className="menu-wrap">
            <button className="icon" onClick={() => setMenu(!menu)} aria-label="Menu">⋯</button>
            {menu && (
              <div className="menu" onMouseLeave={() => setMenu(false)} onClick={() => setMenu(false)}>
                <div className="menu-id">{me()}</div>
                <button onClick={onAccounts}>Add or manage accounts</button>
                <button onClick={markAllRead}>Mark all as read</button>
                <button onClick={() => setArchived(!archived)}>{archived ? "Back to inbox" : `Archived (${archivedCount})`}</button>
                <button onClick={() => nav("settings/starred")}>Starred messages</button>
                <button onClick={() => nav("settings")}>Settings</button>
                <button onClick={() => signOut()}>Sign out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="search"><input ref={search} placeholder="Filter chats  (Ctrl+K)" value={query} onChange={(e) => setQuery(e.target.value)} /></div>

      {st.showFilterBar && !archived && (
        <div className="chips">
          <button className={filter === "all" ? "chip on" : "chip"} onClick={() => setFilter("all")}>All</button>
          <button className={filter === "unread" ? "chip on" : "chip"} onClick={() => setFilter("unread")}>Unread{unreadCount ? ` ${unreadCount}` : ""}</button>
          <button className={filter === "groups" ? "chip on" : "chip"} onClick={() => setFilter("groups")}>Groups</button>
          <button className={filter === "dms" ? "chip on" : "chip"} onClick={() => setFilter("dms")}>DMs</button>
          <button className={filter === "fav" ? "chip on" : "chip"} onClick={() => setFilter("fav")}>Favorites</button>
          {networks.length > 1 && networks.map((n) => <button key={n} className={filter === `net:${n}` ? "chip on" : "chip"} onClick={() => setFilter(`net:${n}`)}><i style={{ background: networkMeta(n).color }} />{networkMeta(n).label}</button>)}
        </div>
      )}

      {attention.length > 0 && !archived && <button className="banner" onClick={() => nav("settings/bridges")}>⚠️ {attention.join(", ")} needs you to sign in again <b>Fix</b></button>}

      <ul className="chat-list">
        {shown.map((c) => (
          <li key={c.id}>
            <button className={"chat-row" + (c.id === selected ? " sel" : "")} onClick={() => onSelect(c.id)} onContextMenu={(e) => { e.preventDefault(); setCtx({ c, x: e.clientX, y: e.clientY }); }}>
              {st.showAvatars && <Avatar name={c.name} mxc={c.avatarMxc} network={st.showNetworkBadges ? c.network : undefined} size={st.density === "compact" ? 38 : 46} />}
              <div className="chat-main">
                <div className="chat-top">
                  <span className={"chat-name" + (c.unread > 0 || c.markedUnread ? " unread-name" : "")}>{c.name}{c.muted && " 🔕"}</span>
                  <span className={"chat-time" + ((c.unread > 0 || c.markedUnread) && !c.muted ? " hot" : "")}>{timeLabel(c.ts)}</span>
                </div>
                {st.showNetworkNameInRows && <div className="chat-net" style={{ color: networkMeta(c.network).color }}>{networkMeta(c.network).label}</div>}
                <div className="chat-bottom">
                  {c.draft ? <span className="chat-preview"><b className="draft">Draft:</b> {c.draft.replace(/\n/g, " ")}</span> : st.showPreviews ? <span className="chat-preview">{c.preview}</span> : <span />}
                  {c.pinned && <span className="pin">📌</span>}
                  {(c.unread > 0 || c.markedUnread) && c.id !== selected && <span className={"unread" + (c.muted ? " muted-badge" : "")}>{c.unread > 99 ? "99+" : c.unread || "•"}</span>}
                </div>
              </div>
            </button>
          </li>
        ))}
        {shown.length === 0 && (
          <li className="empty-list">
            {!synced ? <p>Syncing…</p> : all.length === 0 ? <><p>No chats yet.</p><button className="primary" onClick={onAccounts}>Connect your first account</button></> : <p>{archived ? "Nothing archived." : filter === "unread" ? "You're all caught up 🎉" : "No matches."}</p>}
          </li>
        )}
      </ul>

      {ctx && (
        <div className="ctx-backdrop" onClick={() => setCtx(undefined)} onContextMenu={(e) => { e.preventDefault(); setCtx(undefined); }}>
          <div className="menu ctx" style={{ left: Math.min(ctx.x, window.innerWidth - 220), top: Math.min(ctx.y, window.innerHeight - 260) }} onClick={() => setCtx(undefined)}>
            <button onClick={() => setTag(ctx.c.id, "m.favourite", !ctx.c.pinned)}>{ctx.c.pinned ? "Unpin" : "Pin"}</button>
            <button onClick={() => (ctx.c.muted ? setMuted(ctx.c.id, false) : setMuteFor(ctx.c))}>{ctx.c.muted ? "Unmute" : "Mute…"}</button>
            <button onClick={() => (ctx.c.unread > 0 || ctx.c.markedUnread ? markRead(ctx.c.id) : markUnread(ctx.c.id, true))}>{ctx.c.unread > 0 || ctx.c.markedUnread ? "Mark as read" : "Mark as unread"}</button>
            <button onClick={() => setTag(ctx.c.id, "u.archived", !ctx.c.archived)}>{ctx.c.archived ? "Unarchive" : "Archive"}</button>
            <button onClick={() => setRemindFor(ctx.c)}>Remind me…</button>
          </div>
        </div>
      )}
      {muteFor && (
        <Modal title={`Mute ${muteFor.name}`} onClose={() => setMuteFor(undefined)}>
          <div className="stack">
            {([["For 1 hour", 3.6e6], ["For 8 hours", 8 * 3.6e6], ["For 1 week", 7 * 864e5], ["Until I turn it back on", undefined]] as [string, number | undefined][]).map(([l, ms]) => <button key={l} className="row-btn" onClick={() => { setMuted(muteFor.id, true, ms); setMuteFor(undefined); }}><b>{l}</b></button>)}
          </div>
        </Modal>
      )}
      {remindFor && <TimePresetModal title={`Remind me about ${remindFor.name}`} onPick={(at) => { remind(remindFor.id, at); setRemindFor(undefined); }} onClose={() => setRemindFor(undefined)} />}
    </aside>
  );
}
