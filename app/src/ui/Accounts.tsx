import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Login, LoginFlow, LoginStep, Network, pager, parseCookies } from "../core/api";
import { networkMeta } from "../core/emoji";
import { refreshBridges, useStore } from "../core/store";
import { updateSettings, useSettings } from "../core/settings";
import { Modal, Row, SwitchRow } from "./common";

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

/** Pick an app to connect, or manage the ones already connected. */
export function AccountsModal({ onClose, initial }: { onClose: () => void; initial?: Network }) {
  const networks = useStore((s) => s.bridges);
  const [active, setActive] = useState<Network | undefined>(initial);
  const [error, setError] = useState("");
  useEffect(() => { void refreshBridges(); }, []);

  async function disconnect(n: Network, l: Login) {
    if (!confirm(`Disconnect this ${n.name} account? Its pages will stop syncing.`)) return;
    try { await pager.logout(n.id, l.id); } catch (e) { setError((e as Error).message); }
    void refreshBridges();
  }
  return (
    <Modal onClose={onClose}>
      {active ? (
        <LoginFlowView network={active} onCancel={() => (initial ? onClose() : setActive(undefined))} onDone={() => { setActive(undefined); void refreshBridges(); if (initial) onClose(); }} />
      ) : (
        <>
          <h2>Accounts</h2>
          <p className="muted">Connect the apps you use. You can add more than one account per app.</p>
          {error && <div className="error">{error}</div>}
          <ul className="net-list">
            {networks.map((n) => {
              const meta = networkMeta(n.id);
              return (
                <li key={n.id}>
                  <i className="net-dot" style={{ background: meta.color }}>{meta.glyph}</i>
                  <div className="net-info">
                    <b>{n.name}</b>
                    {n.error && <small className="warn">Unavailable right now</small>}
                    {n.logins.map((l) => <small key={l.id}>{l.name || l.profile?.name || l.id}<button className="link inline" onClick={() => disconnect(n, l)}>Disconnect</button></small>)}
                  </div>
                  <button className="pill" disabled={!!n.error} onClick={() => setActive(n)}>{n.logins.length ? "Add another" : "Connect"}</button>
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
  useEffect(() => { void refreshBridges(); }, []);
  return (
    <>
      <p className="muted pad">Each app you connect is bridged through your own server. Pager shows if a connection needs attention.</p>
      {note && <p className="muted pad">{note}</p>}
      {!networks.length && <p className="muted pad">Loading…</p>}
      {networks.length > 0 && !networks.some((n) => n.logins.length) && <p className="muted pad">Nothing connected yet.</p>}
      <div className="pad"><button className="primary" onClick={() => setAdding(true)}>Add account</button></div>
      {networks.filter((n) => n.logins.length > 0).map((n) => {
        const meta = networkMeta(n.id);
        return (
          <section key={n.id}>
            <h3 className="sec">{n.name}</h3>
            {n.error && <p className="warn pad">This bridge isn't responding right now.</p>}
            {n.logins.map((l) => {
              const [label, color] = stateLabel(l.state_event);
              return (
                <Row key={l.id} title={l.name || l.profile?.name || l.id} hint={label}>
                  <i className="dot" style={{ background: color }} />
                  {needsAttention(l.state_event) && <button className="pill" onClick={() => setRelogin(n)}>Sign in</button>}
                  <button className="link" disabled={!!syncing} onClick={() => sync(n, l)}>{syncing.startsWith(l.id) ? `Syncing ${syncing.split(":")[1] ?? ""}` : "Sync pages"}</button>
                  <button className="link danger" onClick={async () => { if (confirm("Disconnect this account?")) { await pager.logout(n.id, l.id).catch(() => {}); void refreshBridges(); } }}>Disconnect</button>
                </Row>
              );
            })}
            <div className="pad"><button className="link" onClick={() => setRelogin(n)}>{`Add another ${meta.label} account`}</button></div>
            <SwitchRow title={`Show ${meta.label} pages in inbox`} checked={!st.hiddenNetworks.includes(n.id)} onChange={(on) => updateSettings({ hiddenNetworks: on ? st.hiddenNetworks.filter((x) => x !== n.id) : [...st.hiddenNetworks, n.id] })} />
          </section>
        );
      })}
      {relogin && <AccountsModal initial={relogin} onClose={() => setRelogin(undefined)} />}
      {adding && <AccountsModal onClose={() => { setAdding(false); void refreshBridges(); }} />}
    </>
  );
}
