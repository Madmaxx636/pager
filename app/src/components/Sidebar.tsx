import { useMemo, useState } from "react";
import { chatSummaries, getClient, signOut, useMatrixVersion } from "../matrix";
import { networkMeta } from "../networks";
import { Avatar } from "./Avatar";

function timeLabel(ts: number) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (now.getTime() - ts < 6 * 864e5) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function Sidebar({ selected, onSelect, onAdd }: { selected: string | null; onSelect: (id: string) => void; onAdd: () => void }) {
  useMatrixVersion();
  const [query, setQuery] = useState("");
  const [net, setNet] = useState("all");
  const [menu, setMenu] = useState(false);
  const chats = chatSummaries();
  const networks = useMemo(() => [...new Set(chats.map((c) => c.network))].sort(), [chats.map((c) => c.network).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = query.trim().toLowerCase();
  const shown = chats.filter((c) => (net === "all" || c.network === net) && (!q || c.name.toLowerCase().includes(q) || c.preview.toLowerCase().includes(q)));
  const me = getClient()?.getUserId() ?? "";

  return (
    <aside className="sidebar">
      <header>
        <div className="logo">
          <span className="logo-mark" />
          <b>Pager</b>
        </div>
        <div className="header-actions">
          <button className="icon" onClick={onAdd} title="Add account" aria-label="Add account">＋</button>
          <div className="menu-wrap">
            <button className="icon" onClick={() => setMenu(!menu)} aria-label="Menu">⋯</button>
            {menu && (
              <div className="menu" onMouseLeave={() => setMenu(false)}>
                <div className="menu-id">{me}</div>
                <button onClick={onAdd}>Connected accounts</button>
                <button onClick={() => signOut()}>Sign out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="search">
        <input placeholder="Search chats" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {networks.length > 1 && (
        <div className="chips">
          <button className={net === "all" ? "chip on" : "chip"} onClick={() => setNet("all")}>All</button>
          {networks.map((n) => (
            <button key={n} className={net === n ? "chip on" : "chip"} onClick={() => setNet(n)}>
              <i style={{ background: networkMeta(n).color }} />
              {networkMeta(n).label}
            </button>
          ))}
        </div>
      )}

      <ul className="chat-list">
        {shown.map((c) => (
          <li key={c.id}>
            <button className={"chat-row" + (c.id === selected ? " sel" : "")} onClick={() => onSelect(c.id)}>
              <Avatar name={c.name} mxc={c.avatarMxc} network={c.network} />
              <div className="chat-main">
                <div className="chat-top">
                  <span className="chat-name">{c.name}</span>
                  <span className="chat-time">{timeLabel(c.ts)}</span>
                </div>
                <div className="chat-bottom">
                  <span className="chat-preview">{c.preview}</span>
                  {c.unread > 0 && c.id !== selected && <span className="unread">{c.unread > 99 ? "99+" : c.unread}</span>}
                </div>
              </div>
            </button>
          </li>
        ))}
        {shown.length === 0 && (
          <li className="empty-list">
            {chats.length === 0 ? (
              <>
                <p>No chats yet.</p>
                <button className="primary" onClick={onAdd}>Connect your first account</button>
              </>
            ) : (
              <p>No matches.</p>
            )}
          </li>
        )}
      </ul>
    </aside>
  );
}
