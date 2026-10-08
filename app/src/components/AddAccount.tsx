import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import * as api from "../api";
import { networkMeta } from "../networks";

function Qr({ data }: { data: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) QRCode.toCanvas(ref.current, data, { width: 240, margin: 1 });
  }, [data]);
  return <canvas ref={ref} className="qr" />;
}

/** Walks one bridge login: start → (QR / form / wait)* → complete. */
function LoginFlow({ network, onDone, onCancel }: { network: api.NetworkStatus; onDone: () => void; onCancel: () => void }) {
  const [flows, setFlows] = useState<api.LoginFlow[]>();
  const [step, setStep] = useState<api.LoginStep>();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const cancelled = useRef(false);
  const meta = networkMeta(network.id);

  useEffect(() => () => void (cancelled.current = true), []);
  useEffect(() => {
    api.loginFlows(network.id)
      .then(({ flows }) => (flows.length === 1 ? begin(flows[0].id) : setFlows(flows)))
      .catch((e) => setError(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const advance = (next: api.LoginStep) => {
    if (cancelled.current) return;
    setValues({});
    setStep(next);
    if (next.type === "complete") setTimeout(onDone, 900);
    // QR codes and similar block server-side until the user acts on their phone.
    else if (next.type === "display_and_wait") {
      api.loginStep(network.id, next).then(advance).catch((e) => !cancelled.current && setError(e.message));
    }
  };

  async function begin(flowId: string) {
    setBusy(true);
    setError("");
    try {
      advance(await api.loginStart(network.id, flowId));
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!step) return;
    setBusy(true);
    setError("");
    try {
      advance(await api.loginStep(network.id, step, values));
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  const dw = step?.display_and_wait;
  return (
    <div className="flow">
      <div className="flow-head">
        <i className="net-dot" style={{ background: meta.color }}>{meta.glyph}</i>
        <h3>Connect {meta.label}</h3>
      </div>

      {flows && !step && (
        <div className="stack">
          <p className="muted">How would you like to sign in?</p>
          {flows.map((f) => (
            <button key={f.id} className="row-btn" onClick={() => begin(f.id)}>
              <b>{f.name}</b>
              {f.description && <small>{f.description}</small>}
            </button>
          ))}
        </div>
      )}

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
            <label key={f.id}>
              {f.name}
              <input
                type={f.type === "password" || f.type === "2fa_code" ? "password" : "text"}
                value={values[f.id] ?? ""}
                onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
                placeholder={f.description}
                autoFocus
                required
              />
            </label>
          ))}
          <button className="primary" disabled={busy}>{busy ? "Checking…" : "Continue"}</button>
        </form>
      )}

      {step?.type === "cookies" && (
        <p className="muted">This network needs a browser sign-in, which Pager doesn't support yet.</p>
      )}

      {step?.type === "complete" && (
        <div className="stack center">
          <div className="check">✓</div>
          <p>{meta.label} is connected. Your chats will appear shortly.</p>
        </div>
      )}

      {error && <div className="error">{error}</div>}
      {!flows && !step && !error && <p className="muted"><span className="spinner" /> Starting…</p>}
      {step?.type !== "complete" && <button className="link" onClick={onCancel}>Cancel</button>}
    </div>
  );
}

export function AddAccount({ onClose }: { onClose: () => void }) {
  const [networks, setNetworks] = useState<api.NetworkStatus[]>();
  const [active, setActive] = useState<api.NetworkStatus>();
  const [error, setError] = useState("");

  const refresh = () => api.listNetworks().then((r) => setNetworks(r.networks)).catch((e) => setError(e.message));
  useEffect(() => void refresh(), []);

  async function disconnect(net: api.NetworkStatus, loginId: string) {
    if (!confirm(`Disconnect this ${net.name} account? Its chats will stop syncing.`)) return;
    await api.logout(net.id, loginId).catch((e) => setError(e.message));
    refresh();
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <button className="icon close" onClick={onClose} aria-label="Close">✕</button>
        {active ? (
          <LoginFlow network={active} onCancel={() => setActive(undefined)} onDone={() => { setActive(undefined); refresh(); }} />
        ) : (
          <>
            <h2>Accounts</h2>
            <p className="muted">Connect the apps you use. You can add more than one account per app.</p>
            {error && <div className="error">{error}</div>}
            <ul className="net-list">
              {networks?.map((n) => {
                const meta = networkMeta(n.id);
                return (
                  <li key={n.id}>
                    <i className="net-dot" style={{ background: meta.color }}>{meta.glyph}</i>
                    <div className="net-info">
                      <b>{n.name}</b>
                      {n.error && <small className="warn">Unavailable right now</small>}
                      {n.logins.map((l) => (
                        <small key={l.id}>
                          {l.name || l.profile?.name || l.profile?.phone || l.profile?.username || l.id}
                          <button className="link inline" onClick={() => disconnect(n, l.id)}>Disconnect</button>
                        </small>
                      ))}
                    </div>
                    <button className="pill" disabled={!!n.error} onClick={() => setActive(n)}>
                      {n.logins.length ? "Add another" : "Connect"}
                    </button>
                  </li>
                );
              })}
              {!networks && !error && <li className="muted">Loading…</li>}
            </ul>
            <p className="fine">
              WhatsApp, Instagram and similar apps don't officially support third-party clients. It works fine for most
              people, but it's not endorsed by those companies.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
