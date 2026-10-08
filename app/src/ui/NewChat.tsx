import { useEffect, useState } from "react";
import { Contact, Network, pager } from "../core/api";
import { useStore } from "../core/store";
import { Avatar } from "./common";

/** Start a chat with someone on a connected network: pick a network, search contacts, or type a phone number/username. */
export function NewChat({ onBack, onOpen }: { onBack: () => void; onOpen: (roomId: string) => void }) {
  const [networks, setNetworks] = useState<Network[]>();
  const [selected, setSelected] = useState<Network>();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Contact[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useStore((s) => s.session);

  useEffect(() => {
    pager.networks().then((all) => { const list = all.filter((n) => n.logins.length); setNetworks(list); setSelected(list[0]); }).catch((e) => { setError(e.message); setNetworks([]); });
  }, []);
  useEffect(() => {
    if (!selected) return;
    let live = true;
    const t = setTimeout(() => {
      const login = selected.logins[0]?.id;
      (query.trim() ? pager.searchUsers(selected.id, login, query.trim()) : pager.contacts(selected.id, login))
        .then((r) => live && (setResults(r), setError(""))).catch((e) => live && (setResults([]), query.trim() && setError(e.message)));
    }, query ? 300 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [selected, query]);

  async function start(identifier: string) {
    if (!selected) return;
    setBusy(true); setError("");
    try { const room = await pager.createDm(selected.id, selected.logins[0]?.id, identifier); room ? onOpen(room) : setError("Couldn't open that chat"); }
    catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  return (
    <section className="page">
      <header><button className="icon back always" onClick={onBack}>‹</button><h2>New chat</h2></header>
      <div className="page-body">
        {!networks ? <p className="muted pad">Loading…</p> : !networks.length ? <p className="muted pad">Connect an account first (Settings → Bridges &amp; accounts).</p> : (
          <>
            <div className="chips pad">{networks.map((n) => <button key={n.id} className={n.id === selected?.id ? "chip on" : "chip"} onClick={() => { setSelected(n); setResults([]); }}>{n.name}</button>)}</div>
            <div className="pad"><input autoFocus placeholder="Name, phone number or username" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
            {error && <div className="error pad">{error}</div>}
            <ul className="plain">
              {query.trim() && <li><button className="list-btn" disabled={busy} onClick={() => start(query.trim())}><Avatar name="+" size={40} /><b>Message “{query.trim()}”</b></button></li>}
              {results.map((c) => <li key={c.id}><button className="list-btn" disabled={busy} onClick={() => start(c.id)}><Avatar name={c.name} size={40} network={selected?.id} /><div><b>{c.name}</b>{c.detail && <small>{c.detail}</small>}</div></button></li>)}
            </ul>
            {busy && <p className="muted pad">Opening chat…</p>}
          </>
        )}
      </div>
    </section>
  );
}
