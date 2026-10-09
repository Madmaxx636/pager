import { useEffect, useMemo, useRef, useState } from "react";
import { Contact, Network, pager } from "../core/api";
import { useInbox } from "../core/store";
import { addToPhonebook, parseVcf, phoneKey, prettyName, stripTag } from "../core/names";
import { networkMeta } from "../core/emoji";
import { ChevronLeft, Search, Upload, UserPlus } from "lucide-react";
import { Avatar, IconButton, Modal } from "./common";
import { Mascot } from "./Mascot";

/** One way to reach a person: a network, which of your accounts, and how that network names them. */
interface Way { net: Network; login?: string; id: string; detail?: string }
interface Person { key: string; name: string; detail?: string; ways: Way[] }

/** Page someone: everyone from every connected network in one list, one row per person, then pick how to reach them. */
export function NewChat({ onBack, onOpen }: { onBack: () => void; onOpen: (roomId: string) => void }) {
  const [networks, setNetworks] = useState<Network[]>();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<Person[]>([]);
  const [choose, setChoose] = useState<{ title: string; ways: Way[] }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const chats = useInbox();

  // Everyone, from every account on every network, merged by phone number (or name).
  useEffect(() => {
    let live = true;
    pager.networks().then(async (all) => {
      const list = all.filter((n) => n.logins.length);
      if (!live) return;
      setNetworks(list);
      const found = await Promise.all(list.flatMap((n) => n.logins.map((l) => pager.contacts(n.id, l.id).then((cs) => cs.map((c) => ({ c, way: { net: n, login: l.id, id: c.id, detail: c.detail } as Way }))).catch(() => []))));
      if (!live) return;
      const flat = found.flat();
      addToPhonebook(flat.filter(({ c }) => c.detail).map(({ c }) => ({ number: c.detail!, name: c.name })));
      setPeople(merge(flat));
      setLoading(false);
    }).catch((e) => { setError(e.message); setNetworks([]); setLoading(false); });
    return () => { live = false; };
  }, []);

  // Typing something that isn't in the list: ask the networks too (they can find people you've never talked to).
  const q = query.trim();
  useEffect(() => {
    setRemote([]);
    if (q.length < 3 || !networks) return;
    let live = true;
    const t = setTimeout(async () => {
      const found = await Promise.all(networks.flatMap((n) => n.logins.slice(0, 1).map((l) => pager.searchUsers(n.id, l.id, q).then((cs) => cs.map((c) => ({ c, way: { net: n, login: l.id, id: c.id, detail: c.detail } as Way }))).catch(() => []))));
      if (live) setRemote(merge(found.flat()));
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [q, networks]);

  // The network you already chat with someone on comes first.
  const usual = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of [...chats].sort((a, b) => b.ts - a.ts)) if (!c.isGroup && !m.has(c.name.toLowerCase())) m.set(c.name.toLowerCase(), c.network);
    return m;
  }, [chats]);

  const shown = useMemo(() => {
    const t = q.toLowerCase(), digits = q.replace(/\D/g, "");
    const local = people.filter((p) => !t || p.name.toLowerCase().includes(t) || (digits.length >= 3 && p.ways.some((w) => (w.detail ?? "").replace(/\D/g, "").includes(digits))));
    const seen = new Set(local.map((p) => p.key));
    return t ? [...local, ...remote.filter((p) => !seen.has(p.key))] : local;
  }, [people, remote, q]);

  const sorted = (ways: Way[], name: string) => {
    const first = usual.get(name.toLowerCase());
    return [...ways].sort((a, b) => Number(b.net.id === first) - Number(a.net.id === first));
  };

  async function start(w: Way) {
    setBusy(true); setError(""); setChoose(undefined);
    try { const room = await pager.createDm(w.net.id, w.login, w.id); room ? onOpen(room) : setError("Couldn't open that chat"); }
    catch (e) { setError((e as Error).message); }
    setBusy(false);
  }
  function pick(p: Person) {
    const ways = sorted(p.ways, p.name);
    ways.length === 1 ? void start(ways[0]) : setChoose({ title: p.name, ways });
  }
  async function importFile(f?: File) {
    if (!f) return;
    const n = parseVcf(await f.text());
    addToPhonebook(n, true);
    setPeople((cur) => [...cur]);
    setError(n.length ? "" : "No contacts found in that file");
  }

  return (
    <section className="page">
      <header><IconButton icon={ChevronLeft} label="Back" onClick={onBack} className="back always" /><h2>Page someone</h2></header>
      <div className="page-body">
        {!networks ? <p className="muted pad">Loading…</p> : !networks.length ? (
          <div className="page-hero"><Mascot size={120} mood="sleep" /><h3>Connect an account first</h3><p className="muted">Settings → Bridges & accounts</p></div>
        ) : (
          <>
            <div className="page-hero"><Mascot size={104} /><h3>Wanna Page someone?</h3></div>
            <div className="pill-search wide"><Search size={18} /><input autoFocus placeholder="Name, phone number or username" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
            {error && <div className="error pad">{error}</div>}
            <ul className="plain">
              {q && <li><button className="list-btn" disabled={busy} onClick={() => setChoose({ title: `Message “${q}”`, ways: networks.map((n) => ({ net: n, login: n.logins[0]?.id, id: q })) })}><span className="tile-icon"><UserPlus size={20} color="#fff" /></span><b>Message “{q}”</b></button></li>}
              {shown.map((p) => (
                <li key={p.key}><button className="list-btn" disabled={busy} onClick={() => pick(p)}>
                  <Avatar name={p.name} size={40} />
                  <div className="col"><b>{p.name}</b>{p.detail && <small>{p.detail}</small>}</div>
                  <span className="way-chips">{p.ways.map((w) => <i key={w.net.id + w.login} title={w.net.name} style={{ background: networkMeta(w.net.id).color }}>{networkMeta(w.net.id).label.slice(0, 2)}</i>)}</span>
                </button></li>
              ))}
            </ul>
            {loading && <p className="muted pad">Finding your contacts…</p>}
            {!loading && !shown.length && <p className="muted pad">{q ? "No one by that name yet. Use the row above to message a number or username." : "No contacts yet."}</p>}
            {busy && <p className="muted pad">Opening chat…</p>}
            <div className="pad"><button className="pill" onClick={() => file.current?.click()}><Upload size={15} /> Import contacts (.vcf)</button>
              <input ref={file} type="file" accept=".vcf,text/vcard,text/x-vcard" hidden onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ""; }} />
              <p className="muted small">Names from a contacts file replace phone numbers everywhere in Pager.</p></div>
          </>
        )}
      </div>
      {choose && (
        <Modal title={choose.title} onClose={() => setChoose(undefined)}>
          <div>
            <p className="muted">How do you want to message them?</p>
            <ul className="plain">
              {choose.ways.map((w) => (
                <li key={w.net.id + w.login}><button className="list-btn" onClick={() => void start(w)}>
                  <span className="way-dot" style={{ background: networkMeta(w.net.id).color }} />
                  <div className="col"><b>{w.net.name}</b>{w.detail && <small>{w.detail}</small>}</div>
                  {usual.get(choose.title.toLowerCase()) === w.net.id && <span className="muted small">Usual</span>}
                </button></li>
              ))}
            </ul>
          </div>
        </Modal>
      )}
    </section>
  );
}

/** Merge one person across networks: same phone number, else same name. */
function merge(found: { c: Contact; way: Way }[]): Person[] {
  const byKey = new Map<string, Person>();
  for (const { c, way } of found) {
    const name = prettyName(c.name);
    const num = c.detail ? phoneKey(c.detail) : "";
    const key = num || "n:" + stripTag(name).toLowerCase();
    let p = byKey.get(key);
    if (!p) byKey.set(key, (p = { key, name, detail: c.detail, ways: [] }));
    if (!p.ways.some((w) => w.net.id === way.net.id && w.login === way.login)) p.ways.push(way);
    if (!p.detail && c.detail) p.detail = c.detail;
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}
