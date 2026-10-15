import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Login, LoginFlow, LoginStep, Network, pager, parseCookies } from "../core/api";
import { networkMeta } from "../core/emoji";
import { refreshBridges, setTag, useStore } from "../core/store";
import { advance, currentImport, fraction, importBusy, linked, setImport, stuck, useImport } from "../core/importjob";
import { updateSettings, useSettings } from "../core/settings";
import { Eye, EyeOff, MoreVertical } from "lucide-react";
import { IconButton, Modal } from "./common";
import { isArchived } from "../core/types";

export const needsAttention = (state?: string) => state === "BAD_CREDENTIALS" || state === "LOGGED_OUT" || state === "UNKNOWN_ERROR";
export function stateLabel(state?: string): [string, string] {
  switch (state) {
    case "CONNECTED": return ["Connected", "#22c55e"];
    case "CONNECTING": case "TRANSIENT_DISCONNECT": return ["Reconnecting…", "#f59e0b"];
    case "BAD_CREDENTIALS": case "LOGGED_OUT": return ["Sign in again", "#ef4444"];
    case "UNKNOWN_ERROR": return ["Error", "#ef4444"];
    case undefined: case "": return ["Unknown", "#8a94a6"];
    default: return [state.toLowerCase().replace(/_/g, " "), "#8a94a6"];
  }
}

function Qr({ data }: { data: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) void QRCode.toCanvas(ref.current, data, { width: 240, margin: 1 }); }, [data]);
  return <canvas ref={ref} className="qr" />;
}

/** Walks one bridge login: start → (QR / form / wait)* → complete. */
/** Browser sign-in: the desktop app opens a sign-in window; anywhere else, paste the cookies. */
function CookieStep({ step, busy, onValues, onError }: { step: LoginStep; busy: boolean; onValues: (v: Record<string, string>) => void; onError: (m: string) => void }) {
  const [paste, setPaste] = useState("");
  const desktop = window.pagerDesktop;
  async function viaWindow() {
    onError("");
    try {
      const v = await desktop!.cookieLogin(step.cookies);
      if (v) onValues(v);
    } catch (e) { onError((e as Error).message); }
  }
  const [blocked, setBlocked] = useState(false);
  const missing = (step.cookies?.fields ?? []).filter((f) => f.required).map((f) => f.id).filter((id) => !parseCookies(paste)[id]);
  return (
    <div className="stack">
      {desktop?.cookieLogin ? (
        <>
          {!blocked && <>
            <p className="instructions">Sign in to your account in a separate window. Pager only reads the sign-in cookies it needs, and closes the window when it has them.</p>
            <button className="primary" disabled={busy} onClick={viaWindow}>{busy ? "Connecting…" : "Open sign-in window"}</button>
            <button className="link" onClick={() => setBlocked(true)}>Google says "this browser is not secure"?</button>
          </>}
          {blocked && <>
            <p className="instructions">Google doesn't allow sign-in inside other apps, so use your normal browser instead:</p>
            {browserSteps()}
          </>}
        </>
      ) : (
        <>
          <p className="instructions">This network needs you to sign in with your normal browser, then copy your sign-in details here:</p>
          {browserSteps()}
        </>
      )}
    </div>
  );
  function browserSteps() {
    return (
      <>
        <ol className="steps">
          <li><a className="link" href={step.cookies?.url} target="_blank" rel="noreferrer">Open the Google sign-in page</a> in Chrome or Firefox and sign in until you see Google Messages.</li>
          <li>Press <b>F12</b>, open the <b>Network</b> tab, then press <b>F5</b> to reload.</li>
          <li>Right-click the first request in the list (named <b>config</b> or <b>web</b>) → <b>Copy</b> → <b>Copy as cURL</b>.</li>
          <li>Paste it below.</li>
        </ol>
        {pasteBox()}
      </>
    );
  }
  function pasteBox() {
    return (
      <>
        <textarea rows={5} placeholder="Paste a cURL command, a Cookie header, or a JSON object" value={paste} onChange={(e) => setPaste(e.target.value)} />
        {paste && missing.length > 0 && <p className="muted">Still missing: {missing.join(", ")}</p>}
        <button className="primary" disabled={busy || !paste || missing.length > 0} onClick={() => onValues(parseCookies(paste))}>Connect</button>
      </>
    );
  }
}

export function LoginFlowView({ network, onDone, onCancel }: { network: { id: string }; onDone: () => void; onCancel: () => void }) {
  const [flows, setFlows] = useState<LoginFlow[]>();
  const [step, setStep] = useState<LoginStep>();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const cancelled = useRef(false);
  const meta = networkMeta(network.id);

  useEffect(() => () => void (cancelled.current = true), []);
  useEffect(() => {
    pager.flows(network.id).then((f) => (f.length === 1 ? begin(f[0].id) : setFlows(f))).catch((e) => setError(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const advance = (next: LoginStep) => {
    if (cancelled.current) return;
    setValues({}); setStep(next);
    if (next.type === "complete") setTimeout(onDone, 900);
    else if (next.type === "display_and_wait") pager.step(network.id, next).then(advance).catch((e) => !cancelled.current && setError(e.message)); // blocks until the user acts on their phone
  };
  async function begin(flowId: string) {
    setBusy(true); setError("");
    try { advance(await pager.start(network.id, flowId)); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!step) return;
    setBusy(true); setError("");
    try { advance(await pager.step(network.id, step, values)); } catch (err) { setError((err as Error).message); }
    setBusy(false);
  }
  const dw = step?.display_and_wait;
  return (
    <div className="flow">
      <div className="flow-head"><i className="net-dot" style={{ background: meta.color }}>{meta.glyph}</i><h3>Connect {meta.label}</h3></div>
      {flows && !step && <div className="stack"><p className="muted">How would you like to sign in?</p>{flows.map((f) => <button key={f.id} className="row-btn" onClick={() => begin(f.id)}><b>{f.name}</b>{f.description && <small>{f.description}</small>}</button>)}</div>}
      {step?.type === "display_and_wait" && (
        <div className="stack center">
          {step.instructions && <p className="instructions">{step.instructions}</p>}
          {dw?.type === "qr" && dw.data && <Qr data={dw.data} />}
          {(dw?.type === "code" || dw?.type === "emoji") && <div className="code">{dw.data}</div>}
          <p className="muted"><span className="spinner" /> Waiting for you…</p>
        </div>
      )}
      {step?.type === "user_input" && (
        <form className="stack" onSubmit={submit}>
          {step.instructions && <p className="instructions">{step.instructions}</p>}
          {step.user_input?.fields.map((f) => (
            <label key={f.id}>{f.name}<input type={f.type === "password" || f.type === "2fa_code" ? "password" : "text"} value={values[f.id] ?? ""} onChange={(e) => setValues({ ...values, [f.id]: e.target.value })} placeholder={f.description} autoFocus required /></label>
          ))}
          <button className="primary" disabled={busy}>{busy ? "Checking…" : "Continue"}</button>
        </form>
      )}
      {step?.type === "cookies" && <CookieStep step={step} busy={busy} onValues={async (v) => {
        setBusy(true); setError("");
        try { advance(await pager.step(network.id, step, v)); } catch (err) { setError((err as Error).message); }
        setBusy(false);
      }} onError={setError} />}
      {step?.type === "complete" && <div className="stack center"><div className="check">✓</div><p>{meta.label} is connected. Your chats will appear shortly.</p></div>}
      {error && <div className="error">{error}</div>}
      {!flows && !step && !error && <p className="muted"><span className="spinner" /> Starting…</p>}
      {step?.type !== "complete" && <button className="link" onClick={onCancel}>Cancel</button>}
    </div>
  );
}


/** How far back each network can be asked to go when an account is linked. Other networks offer no choice. */
const REACH: Record<string, { key: string; label: string; options: [string, number][] }> = {
  whatsapp: { key: "historyDays", label: "How far back", options: [["Last month", 30], ["Last 3 months", 90], ["Last 6 months", 180], ["Last year", 365], ["Everything the phone sends", 36500]] },
  gmessages: { key: "chatCount", label: "How many chats", options: [["Latest 25", 25], ["Latest 100", 100], ["Latest 500", 500], ["All of them", 10000]] },
};

/** Asked before linking an account: everything or pick chats afterwards, and how far back where the network allows it. */
function ImportOptions({ network, onStart, onCancel }: { network: Network; onStart: (mode: "all" | "choose") => void; onCancel: () => void }) {
  const meta = networkMeta(network.id);
  const reach = REACH[network.id];
  const [mode, setMode] = useState<"all" | "choose">("all");
  const [current, setCurrent] = useState<number>();
  const [picked, setPicked] = useState<number>();
  const [canSet, setCanSet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!reach) return;
    pager.admin.bridgeSettings(network.id).then((rows) => {
      const row = rows.find((r) => r.key === reach.key);
      if (row) { setCanSet(true); setCurrent(Number(row.value)); setPicked(Number(row.value)); }
    }).catch(() => {});
  }, [network.id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function go() {
    setBusy(true); setError("");
    try {
      if (reach && canSet && picked != null && picked !== current) await pager.admin.saveBridgeSettings(network.id, { [reach.key]: picked }, true);
      onStart(mode);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  const sel = reach && canSet ? reach.options.some(([, v]) => v === picked) ? picked : "" : undefined;
  return (
    <div className="flow">
      <div className="flow-head"><i className="net-dot" style={{ background: meta.color }}>{meta.glyph}</i><h3>Import from {meta.label}</h3></div>
      <div className="stack">
        <label className="choice"><input type="radio" checked={mode === "all"} onChange={() => setMode("all")} /> <span><b>Import all chats</b><small>Everything {meta.label} offers comes in.</small></span></label>
        <label className="choice"><input type="radio" checked={mode === "choose"} onChange={() => setMode("choose")} /> <span><b>Let me choose chats</b><small>Everything comes in, then you tick the chats to keep. The rest go to the archive; nothing is deleted.</small></span></label>
        {reach && canSet && <label>{reach.label}<select value={sel} onChange={(e) => setPicked(Number(e.target.value))}>{sel === "" && <option value="">Custom ({picked})</option>}{reach.options.map(([l, v]) => <option key={v} value={v}>{l}</option>)}</select></label>}
        {reach && canSet && picked !== current && <p className="muted">{meta.label}'s connection restarts for a moment when you continue.</p>}
        {!reach && <p className="muted">{meta.label} doesn't send older messages, so only new ones will show up after linking.</p>}
        {reach && !canSet && <p className="muted">Only an admin can change how far back {meta.label} imports.</p>}
        {error && <div className="error">{error}</div>}
        <p className="muted">Only one account can be imported at a time. The next one unlocks when this import has finished.</p>
        <button className="primary" disabled={busy} onClick={go}>{busy ? "Applying…" : "Continue and link"}</button>
        <button className="link" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/** Keeps the running import up to date, whichever screen is open. Rendered once for the whole app. */
export function ImportWatcher() {
  const job = useImport();
  const count = useStore((s) => { let c = 0, m = 0; for (const x of Object.values(s.chats)) if (job && x.network === job.network) { c++; m += x.messages.length; } return `${c}:${m}`; });
  useEffect(() => {
    if (!job || job.phase === "done" || job.phase === "choosing") return;
    const [c, m] = count.split(":").map(Number);
    const tick = () => { const cur = job; const next = advance(cur, Math.max(0, c - cur.baseChats), m, Date.now()); if (next !== cur) setImport(next); };
    tick();
    const t = window.setInterval(tick, 5000);
    return () => window.clearInterval(t);
  }, [job, count]);
  return null;
}

/** The progress of the import in flight, with the chat picker once the chats have arrived. */
export function ImportProgress() {
  const job = useImport();
  const chats = useStore((s) => s.chats);
  const [now, setNow] = useState(Date.now());
  const [keep, setKeep] = useState<Set<string>>();
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 2000); return () => window.clearInterval(t); }, []);
  if (!job) return null;
  const mine = Object.values(chats).filter((c) => c.network === job.network && !isArchived(c)).sort((a, b) => a.name.localeCompare(b.name));
  const chosen = keep ?? new Set(mine.map((c) => c.id));
  const pct = Math.round(fraction(job, now) * 100);
  const label = job.phase === "linking" ? "Waiting for you to finish linking…" : job.phase === "importing" ? (job.chats === 0 ? "Linked. Checking for chats…" : "Importing…") : job.phase === "choosing" ? "Choose the chats to keep" : job.chats === 0 ? "Linked. Your existing chats are kept" : "Done";
  return (
    <div className="import-card">
      <div className="import-head"><b>{job.name}</b><span className="muted">{label}</span></div>
      <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${job.phase === "linking" || job.chats === 0 ? 4 : pct}%` }} /></div>
      <small className="muted">{job.chats === 0 && job.linkedAt ? "No new chats needed: your existing ones carry on" : `${job.chats} new chats, ${job.messages.toLocaleString()} messages so far`}</small>
      {job.phase === "choosing" && <>
        <ul className="sync-list">
          {mine.map((c) => <li key={c.id}><label><input type="checkbox" checked={chosen.has(c.id)} onChange={(e) => { const n = new Set(chosen); e.target.checked ? n.add(c.id) : n.delete(c.id); setKeep(n); }} /> {c.name}</label></li>)}
        </ul>
        <div className="row-end">
          <button className="link" onClick={() => setKeep(new Set(chosen.size === mine.length ? [] : mine.map((c) => c.id)))}>{chosen.size === mine.length ? "Select none" : "Select all"}</button>
          <button className="primary" onClick={() => { mine.forEach((c) => { if (!chosen.has(c.id)) setTag(c.id, "u.archived", true); }); setImport({ ...job, phase: "done" }); }}>Keep {chosen.size} chat{chosen.size === 1 ? "" : "s"}</button>
        </div>
      </>}
      {job.phase !== "choosing" && job.phase !== "done" && <p className="muted">You can add another account once this one finishes.</p>}
      {(stuck(job, now) || job.phase === "done") && <button className="link" onClick={() => setImport(undefined)}>{job.phase === "done" ? "Dismiss" : "Nothing is coming in: stop waiting"}</button>}
    </div>
  );
}

/** Pick an app to connect, or manage the ones already connected. */
export function AccountsModal({ onClose, initial }: { onClose: () => void; initial?: Network }) {
  const networks = useStore((s) => s.bridges);
  const [active, setActive] = useState<Network | undefined>(initial);
  const [asked, setAsked] = useState(false);
  const job = useImport();
  const busy = importBusy(job);
  const chats = useStore((s) => s.chats);
  const begin = (n: Network, mode: "all" | "choose") => {
    setImport({ network: n.id, name: n.name, mode, startedAt: Date.now(), baseChats: Object.values(chats).filter((c) => c.network === n.id).length, chats: 0, messages: 0, changedAt: Date.now(), phase: "linking" });
    setAsked(true);
  };
  const abandon = () => { if (job?.phase === "linking") setImport(undefined); };
  const [error, setError] = useState("");
  useEffect(() => { void refreshBridges(); }, []);

  async function disconnect(n: Network, l: Login) {
    if (!confirm(`Disconnect this ${n.name} account? Its pages will stop syncing.`)) return;
    try { await pager.logout(n.id, l.id); } catch (e) { setError((e as Error).message); }
    void refreshBridges();
  }
  return (
    <Modal onClose={onClose}>
      {active && !asked ? (
        <ImportOptions network={active} onStart={(mode) => begin(active, mode)} onCancel={() => (initial ? onClose() : setActive(undefined))} />
      ) : active ? (
        <LoginFlowView network={active} onCancel={() => { abandon(); setAsked(false); if (initial) onClose(); else setActive(undefined); }} onDone={() => { const j = currentImport(); if (j) setImport(linked(j, Date.now())); setAsked(false); setActive(undefined); void refreshBridges(); if (initial) onClose(); }} />
      ) : (
        <>
          <h2>Accounts</h2>
          <p className="muted">Connect the apps you use. You can add more than one account per app.</p>
          {busy && <ImportProgress />}
          {error && <div className="error">{error}</div>}
          <ul className="net-list">
            {networks.map((n) => {
              const meta = networkMeta(n.id);
              return (
                <li key={n.id}>
                  <i className="net-dot" style={{ background: meta.color }}>{meta.glyph}</i>
                  <div className="net-info">
                    <b>{n.name}</b>
                    {n.error && (n.id === "discord" ? <small className="muted">No connect screen: send "help" to @discordbot in a chat to log in</small> : <small className="warn">Unavailable right now</small>)}
                    {n.logins.map((l) => <small key={l.id}>{l.name || l.profile?.name || l.id}<button className="link inline" onClick={() => disconnect(n, l)}>Disconnect</button></small>)}
                  </div>
                  <button className="pill" disabled={(!!n.error && n.id !== "discord") || busy || n.id === "discord"} title={busy ? "Wait for the import in progress to finish" : undefined} onClick={() => setActive(n)}>{n.logins.length ? "Add another" : "Connect"}</button>
                </li>
              );
            })}
            {!networks.length && <li className="muted">Loading…</li>}
          </ul>
          <p className="fine">WhatsApp, Instagram and similar apps don't officially support third-party clients. It works fine for most people, but it's not endorsed by those companies.</p>
        </>
      )}
    </Modal>
  );
}

/** Settings → Bridges & accounts */
export function BridgesPage() {
  const [note, setNote] = useState("");
  const [syncing, setSyncing] = useState("");
  const [askSync, setAskSync] = useState<{ n: Network; l: Login }>();
  async function sync(n: Network, l: Login) {
    setSyncing(l.id); setNote("");
    try {
      const made = await pager.syncChats(n.id, l.id, (d, tot) => setSyncing(`${l.id}:${d}/${tot}`));
      setNote(`Synced ${made} pages. Old message history isn't available from ${n.name}; new messages will appear as they arrive.`);
    } catch (e) { setNote((e as Error).message); }
    setSyncing("");
  }
  const networks = useStore((s) => s.bridges);
  const st = useSettings();
  const [relogin, setRelogin] = useState<Network>();
  const [adding, setAdding] = useState(false);
  const job = useImport();
  const [menuFor, setMenuFor] = useState("");
  useEffect(() => { void refreshBridges(); }, []);
  return (
    <>
      <div className="bridge-head"><p className="muted">Apps connected through your own server.</p><button className="primary" disabled={importBusy(job)} title={importBusy(job) ? "Wait for the import in progress to finish" : undefined} onClick={() => setAdding(true)}>Add account</button></div>
      {note && <p className="muted pad">{note}</p>}
      {askSync && <Modal title={`Start chats with every ${askSync.n.name} contact?`} onClose={() => setAskSync(undefined)}>
        <p>This opens a new, empty chat with <b>each contact</b> on {askSync.n.name}, which can be hundreds. It won't bring old messages in. Chats you already have are untouched.</p>
        <p className="muted">To message just one person, use "Page someone" instead.</p>
        <div className="row-end"><button className="link" onClick={() => setAskSync(undefined)}>Cancel</button><button className="primary" onClick={() => { const a = askSync; setAskSync(undefined); void sync(a.n, a.l); }}>Start them all</button></div>
      </Modal>}
      {!networks.length && <p className="muted pad">Loading…</p>}
      {job && <div className="pad"><ImportProgress /></div>}
      {networks.length > 0 && !networks.some((n) => n.logins.length) && <p className="muted pad">Nothing connected yet.</p>}
      <div className="bridge-list">
        {networks.filter((n) => n.logins.length > 0).flatMap((n) => n.logins.map((l) => {
          const meta = networkMeta(n.id);
          const [label, color] = stateLabel(l.state_event);
          const hidden = st.hiddenNetworks.includes(n.id);
          const key = n.id + "/" + l.id;
          return (
            <div key={key} className={"bridge-row" + (hidden ? " off" : "")}>
              <i className="net-dot" style={{ background: meta.color }}>{meta.glyph}</i>
              <div className="bridge-name"><b>{l.name || l.profile?.name || l.id}</b><small>{n.name}{n.error ? " · not responding" : ""}</small></div>
              <span className="bridge-state" style={{ color }}><i className="dot" style={{ background: color }} />{label}</span>
              {needsAttention(l.state_event) && <button className="pill" onClick={() => setRelogin(n)}>Sign in</button>}
              <IconButton icon={hidden ? EyeOff : Eye} label={hidden ? `Show ${meta.label} pages in the inbox` : `Hide ${meta.label} pages from the inbox`} onClick={() => updateSettings({ hiddenNetworks: hidden ? st.hiddenNetworks.filter((x) => x !== n.id) : [...st.hiddenNetworks, n.id] })} />
              <div className="menu-wrap">
                <IconButton icon={MoreVertical} label="More" onClick={() => setMenuFor(menuFor === key ? "" : key)} />
                {menuFor === key && (
                  <div className="menu" onMouseLeave={() => setMenuFor("")} onClick={() => setMenuFor("")}>
                    <button disabled={importBusy(job)} onClick={() => setRelogin(n)}>Add another {meta.label} account</button>
                    {n.id !== "gmessages" && <button disabled={!!syncing} onClick={() => setAskSync({ n, l })}>{syncing.startsWith(l.id) ? `Syncing ${syncing.split(":")[1] ?? ""}` : "Start chats with contacts"}</button>}
                    <button className="danger" onClick={async () => { if (confirm("Disconnect this account?")) { await pager.logout(n.id, l.id).catch(() => {}); void refreshBridges(); } }}>Disconnect</button>
                  </div>
                )}
              </div>
            </div>
          );
        }))}
      </div>
      {relogin && <AccountsModal initial={relogin} onClose={() => setRelogin(undefined)} />}
      {adding && <AccountsModal onClose={() => { setAdding(false); void refreshBridges(); }} />}
    </>
  );
}
