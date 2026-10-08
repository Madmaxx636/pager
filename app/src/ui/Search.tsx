import { useEffect, useState } from "react";
import { SearchHit } from "../core/api";
import { displayName, nameOf } from "../core/types";
import { getState, me, search } from "../core/store";

/** Search every chat (or one) for text. */
export function Search({ roomId, onBack, onOpen }: { roomId?: string; onBack: () => void; onOpen: (roomId: string) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) { setHits(undefined); return; }
    let live = true; setBusy(true);
    const t = setTimeout(() => void search(q.trim(), roomId).then((h) => { if (live) { setHits(h); setBusy(false); } }), 350);
    return () => { live = false; clearTimeout(t); };
  }, [q, roomId]);
  return (
    <section className="page">
      <header><button className="icon back always" onClick={onBack}>‹</button><input autoFocus className="grow" placeholder={roomId ? "Search this chat" : "Search all messages"} value={q} onChange={(e) => setQ(e.target.value)} /></header>
      <div className="page-body">
        {busy ? <p className="muted pad">Searching…</p> : !hits ? <p className="muted pad">Type at least two letters.</p> : !hits.length ? <p className="muted pad">No matches.</p> : (
          <ul className="plain">{hits.map((h) => { const c = getState().chats[h.roomId]; return (
            <li key={h.roomId + h.eventId}><button className="list-btn col" onClick={() => onOpen(h.roomId)}>
              <small className="accent">{c ? nameOf(c, h.sender) : h.sender}{!roomId && c ? ` · ${displayName(c, me())}` : ""}</small><span>{h.text}</span><small>{new Date(h.ts).toLocaleString()}</small>
            </button></li>); })}</ul>
        )}
      </div>
    </section>
  );
}
