import { useEffect, useState } from "react";
import { ChevronLeft, FileText, Image as ImageIcon, Link2, Search as SearchIcon, Video } from "lucide-react";
import { SearchHit } from "../core/api";
import { displayName, nameOf } from "../core/types";
import { getState, me, search, searchLocal } from "../core/store";
import { Avatar, EmptyState, IconButton } from "./common";

const KINDS: [string, string, React.ComponentType<{ size?: number }>][] = [["all", "All", SearchIcon], ["images", "Photos", ImageIcon], ["videos", "Videos", Video], ["links", "Links", Link2], ["files", "Files", FileText]];

/** Search every chat (or one) by words, narrowed by media type. */
export function Search({ roomId, onBack, onOpen }: { roomId?: string; onBack: () => void; onOpen: (roomId: string) => void }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [hits, setHits] = useState<SearchHit[]>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2 && kind === "all") { setHits(undefined); return; }
    let live = true; setBusy(true);
    const local = searchLocal(text, roomId, kind);
    setHits(local);
    const t = setTimeout(async () => {
      // Words also go to the server, which can see older history than this device has loaded.
      if (kind === "all" && text.length >= 2) {
        const remote = await search(text, roomId);
        if (live) setHits([...local, ...remote].filter((h, i, a) => a.findIndex((x) => (x.eventId || x.roomId + x.ts) === (h.eventId || h.roomId + h.ts)) === i).sort((a, b) => b.ts - a.ts));
      }
      if (live) setBusy(false);
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [q, kind, roomId]);
  return (
    <section className="page">
      <header><IconButton icon={ChevronLeft} label="Back" onClick={onBack} className="back always" /><div className="pill-search grow"><SearchIcon size={18} /><input autoFocus placeholder={roomId ? "Search this chat" : "Search all messages"} value={q} onChange={(e) => setQ(e.target.value)} /></div></header>
      <div className="tabs pad-x">{KINDS.map(([id, label, Icon]) => <button key={id} className={"tab" + (kind === id ? " on" : "")} onClick={() => setKind(id)}><Icon size={15} />{label}</button>)}</div>
      <div className="page-body">
        {!hits ? <EmptyState icon={SearchIcon} title="Search your chats" body="Find messages, photos, links and files across every network." />
          : !hits.length ? <EmptyState icon={SearchIcon} title={busy ? "Searching…" : "No matches"} />
          : <ul className="plain">{hits.map((h) => { const c = getState().chats[h.roomId]; const name = c ? displayName(c, me()) : "Chat"; return (
            <li key={h.roomId + h.eventId + h.ts}><button className="list-btn" onClick={() => onOpen(h.roomId)}>
              <Avatar name={name} mxc={c?.avatarMxc} size={42} network={c?.network} />
              <div className="col"><small className="accent">{c ? nameOf(c, h.sender) : h.sender}{!roomId ? ` · ${name}` : ""}</small><span className="clip2">{h.text}</span><small>{new Date(h.ts).toLocaleString()}</small></div>
            </button></li>); })}</ul>}
      </div>
    </section>
  );
}
