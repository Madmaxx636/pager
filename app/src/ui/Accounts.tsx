import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Login, LoginFlow, LoginStep, Network, pager } from "../core/api";
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
      {step?.type === "cookies" && <p className="muted">This network needs a browser sign-in, which Pager doesn't support yet.</p>}
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
    if (!confirm(`Disconnect this ${n.name} account? Its chats will stop syncing.`)) return;
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
  const networks = useStore((s) => s.bridges);
  const st = useSettings();
  const [relogin, setRelogin] = useState<Network>();
  useEffect(() => { void refreshBridges(); }, []);
  return (
    <>
      <p className="muted pad">Each app you connect is bridged through your own server. Pager shows if a connection needs attention.</p>
      {!networks.length && <p className="muted pad">Loading…</p>}
      {networks.map((n) => {
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
                  <button className="link danger" onClick={async () => { if (confirm("Disconnect this account?")) { await pager.logout(n.id, l.id).catch(() => {}); void refreshBridges(); } }}>Disconnect</button>
                </Row>
              );
            })}
            {!n.logins.length && <p className="muted pad">Not connected</p>}
            <div className="pad"><button className="link" onClick={() => setRelogin(n)}>{n.logins.length ? `Add another ${meta.label} account` : `Connect ${meta.label}`}</button></div>
            <SwitchRow title={`Show ${meta.label} chats in inbox`} checked={!st.hiddenNetworks.includes(n.id)} onChange={(on) => updateSettings({ hiddenNetworks: on ? st.hiddenNetworks.filter((x) => x !== n.id) : [...st.hiddenNetworks, n.id] })} />
          </section>
        );
      })}
      {relogin && <AccountsModal initial={relogin} onClose={() => setRelogin(undefined)} />}
    </>
  );
}
