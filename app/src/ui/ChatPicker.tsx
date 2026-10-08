import { useState } from "react";
import { networkMeta } from "../core/emoji";
import { useInbox } from "../core/store";
import { Avatar } from "./common";

/** Choose a chat from the inbox (Forward…). */
export function ChatPicker({ title, onBack, onPick }: { title: string; onBack: () => void; onPick: (roomId: string) => void }) {
  const all = useInbox();
  const [q, setQ] = useState("");
  const shown = all.filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <section className="page">
      <header><button className="icon back always" onClick={onBack}>‹</button><h2>{title}</h2></header>
      <div className="page-body">
        <div className="pad"><input autoFocus placeholder="Search chats" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <ul className="plain">{shown.map((c) => <li key={c.id}><button className="list-btn" onClick={() => onPick(c.id)}><Avatar name={c.name} mxc={c.avatarMxc} size={40} network={c.network} /><div><b>{c.name}</b><small>{networkMeta(c.network).label}</small></div></button></li>)}</ul>
      </div>
    </section>
  );
}
