import { useCallback, useEffect, useState } from "react";
import { AdminBridge, AdminInfo, AdminPerson, AdminSetting, pager } from "../core/api";
import { networkMeta } from "../core/emoji";
import { Group, Modal, Row, Select, Switch } from "./common";
import { stateLabel } from "./Accounts";

const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const nameOf = (u: { id: string; displayname?: string }) => u.displayname || u.id.replace(/^@/, "").split(":")[0];

/** Bridges Pager knows how to run. The ones that aren't on this server need a little setup there. */
const CATALOG: { id: string; name: string; how: string }[] = [
  { id: "whatsapp", name: "WhatsApp", how: "Built in." }, { id: "signal", name: "Signal", how: "Built in." }, { id: "gmessages", name: "Google Messages", how: "Built in." },
  { id: "messenger", name: "Messenger", how: "Built in." }, { id: "slack", name: "Slack", how: "Built in." }, { id: "twitter", name: "X (Twitter) DMs", how: "Built in." },
  { id: "bluesky", name: "Bluesky", how: "Built in." }, { id: "linkedin", name: "LinkedIn", how: "Built in." },
  { id: "telegram", name: "Telegram", how: "Get an API ID and hash at my.telegram.org, add TELEGRAM_API_ID and TELEGRAM_API_HASH to server/.env, then run ./scripts/setup.sh and docker compose up -d." },
  { id: "discord", name: "Discord", how: "Add ENABLE_DISCORD=1 to server/.env, run ./scripts/setup.sh and docker compose up -d. It signs in through its bot chat." },
];

type Tab = "accounts" | "bridges" | "server";

/** Administrator tools: the accounts on this server, the bridges that connect them to other apps, and who may sign up. The server decides who is allowed. */
export function AdminPage() {
  const [tab, setTab] = useState<Tab>("accounts");
  const [people, setPeople] = useState<AdminPerson[]>();
  const [err, setErr] = useState("");
  const loadPeople = useCallback(() => { pager.admin.overview().then(setPeople).catch((e) => setErr(e.message)); }, []);
  useEffect(loadPeople, [loadPeople]);
  return (
    <>
      <div className="tabs pad">
        {([["accounts", "Accounts"], ["bridges", "Bridges"], ["server", "Server"]] as [Tab, string][]).map(([id, label]) => <button key={id} className={"tab" + (tab === id ? " on" : "")} onClick={() => setTab(id)}>{label}{id === "accounts" && people ? ` (${people.length})` : ""}</button>)}
      </div>
      {err && <div className="error pad">{err}</div>}
      {tab === "accounts" && <Accounts people={people} reload={loadPeople} setErr={setErr} />}
      {tab === "bridges" && <Bridges people={people} setErr={setErr} />}
      {tab === "server" && <ServerTab setErr={setErr} />}
    </>
  );
}

// ---- Accounts ------------------------------------------------------------------------------------------

function Accounts({ people, reload, setErr }: { people?: AdminPerson[]; reload: () => void; setErr: (m: string) => void }) {
  const [open, setOpen] = useState<string>();
  if (!people) return <p className="muted pad"><span className="spinner" /> Loading accounts…</p>;
  return (
    <div className="admin-list">
      {people.map((u) => (
        <section key={u.id} className={"admin-card" + (u.deactivated ? " gone" : "")}>
          <button className="admin-head" onClick={() => setOpen(open === u.id ? undefined : u.id)}>
            <span className="admin-av" style={{ background: `linear-gradient(135deg, hsl(${hue(u.id)} 55% 52%), hsl(${(hue(u.id) + 28) % 360} 62% 38%))` }}>{nameOf(u)[0]?.toUpperCase()}</span>
            <span className="admin-who"><b>{nameOf(u)}</b><small>{u.id}</small></span>
            <span className="admin-badges">
              {u.admin && <span className="badge-pill admin">Admin</span>}{u.you && <span className="badge-pill">You</span>}{u.deactivated && <span className="badge-pill off">Deleted</span>}
              <span className="badge-pill">{u.networks.reduce((n, x) => n + x.logins.length, 0)} bridges</span>
            </span>
          </button>
          {open === u.id && <AccountDetails person={u} reload={reload} setErr={setErr} />}
        </section>
      ))}
    </div>
  );
}

function AccountDetails({ person: u, reload, setErr }: { person: AdminPerson; reload: () => void; setErr: (m: string) => void }) {
  const [info, setInfo] = useState<AdminInfo>();
  const [modal, setModal] = useState<"password" | "rename">();
  const load = useCallback(() => { pager.admin.info(u.id).then(setInfo).catch(() => {}); }, [u.id]);
  useEffect(load, [load]);
  const act = (fn: () => Promise<unknown>) => async () => { try { await fn(); load(); reload(); } catch (e) { setErr((e as Error).message); } };
  const when = (ts?: number) => (ts ? new Date(ts).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "never");
  const lastSeen = info?.devices.reduce((m, d) => Math.max(m, d.lastSeen || 0), 0);
  return (
    <div className="admin-body">
      <h4>Info</h4>
      <dl className="details">
        <dt>Name</dt><dd>{nameOf(u)} {!u.deactivated && <button className="link" onClick={() => setModal("rename")}>Change</button>}</dd>
        <dt>Username</dt><dd className="mono">{u.id}</dd>
        <dt>Joined</dt><dd>{u.created ? when(u.created) : "—"}</dd>
        <dt>Role</dt><dd>{u.admin ? "Admin" : "Member"}</dd>
        <dt>Status</dt><dd>{u.deactivated ? "Deleted" : info?.locked ? "Locked (can't sign in)" : "Active"}</dd>
        <dt>Last active</dt><dd>{info ? when(lastSeen) : "…"}</dd>
        <dt>Signed in on</dt><dd>{info ? (info.devices.length ? info.devices.map((d) => <div key={d.id}>{d.name || d.id}{d.lastSeen ? <small className="muted"> · {when(d.lastSeen)}</small> : null}</div>) : "no devices") : "…"}</dd>
      </dl>

      <h4>Connected bridges</h4>
      {!u.networks.some((n) => n.logins.length) && <p className="muted">Nothing connected.</p>}
      {u.networks.map((n) => n.logins.map((l) => {
        const [label, color] = stateLabel(l.state_event);
        const meta = networkMeta(n.id);
        return (
          <div key={n.id + l.id} className="admin-app">
            <i className="net-dot" style={{ background: meta.color }}>{meta.glyph}</i>
            <div><b>{n.name}</b><small>{l.name || l.profile?.name || l.id}</small></div>
            <span className="admin-state"><i className="dot" style={{ background: color }} />{label}</span>
            <button className="link danger" onClick={act(async () => { if (confirm(`Disconnect ${n.name} for ${nameOf(u)}?`)) await pager.admin.logout(u.id, n.id, l.id); })}>Disconnect</button>
          </div>
        );
      }))}

      {!u.deactivated && (
        <div className="admin-actions">
          <button className="pill" onClick={() => setModal("password")}>Reset password</button>
          {!u.you && <button className="pill" onClick={act(() => pager.admin.setAdmin(u.id, !u.admin))}>{u.admin ? "Remove admin" : "Make admin"}</button>}
          {!u.you && <button className="pill" onClick={act(() => pager.admin.lock(u.id, !info?.locked))}>{info?.locked ? "Unlock" : "Lock account"}</button>}
          <button className="pill" onClick={act(async () => { if (confirm(`Sign ${nameOf(u)} out of every device?`)) { const r = await pager.admin.logoutAll(u.id); setErr(`Signed out of ${r.signedOut} device(s).`); } })}>Sign out everywhere</button>
          {!u.you && <button className="pill danger" onClick={act(async () => { if (confirm(`Delete ${nameOf(u)}? This removes their account, disconnects their bridges and can't be undone.`)) await pager.admin.remove(u.id); })}>Delete account</button>}
        </div>
      )}
      {modal === "password" && <Modal title={`New password for ${nameOf(u)}`} onClose={() => setModal(undefined)}><TextForm label="New password (8+ characters)" type="password" min={8} cta="Set password" note="They will be signed out everywhere and must use this password next time." onDone={() => setModal(undefined)} onSubmit={(v) => pager.admin.resetPassword(u.id, v)} /></Modal>}
      {modal === "rename" && <Modal title="Change name" onClose={() => setModal(undefined)}><TextForm label="Name" initial={nameOf(u)} cta="Save" onDone={() => { setModal(undefined); load(); reload(); }} onSubmit={(v) => pager.admin.rename(u.id, v)} /></Modal>}
    </div>
  );
}

function TextForm({ label, type = "text", min = 1, cta, note, initial = "", onSubmit, onDone }: { label: string; type?: string; min?: number; cta: string; note?: string; initial?: string; onSubmit: (v: string) => Promise<unknown>; onDone: () => void }) {
  const [v, setV] = useState(initial);
  const [err, setErr] = useState("");
  return (
    <form className="stack" onSubmit={async (e) => { e.preventDefault(); try { await onSubmit(v.trim() === v || type === "password" ? v : v.trim()); onDone(); } catch (x) { setErr((x as Error).message); } }}>
      {note && <p className="muted">{note}</p>}
      <label>{label}<input type={type} value={v} onChange={(e) => setV(e.target.value)} autoFocus minLength={min} required /></label>
      {err && <div className="error">{err}</div>}
      <div className="row-end"><button type="button" className="link" onClick={onDone}>Cancel</button><button className="primary" disabled={v.length < min}>{cta}</button></div>
    </form>
  );
}

// ---- Bridges -------------------------------------------------------------------------------------------

function Bridges({ people, setErr }: { people?: AdminPerson[]; setErr: (m: string) => void }) {
  const [list, setList] = useState<{ bridges: AdminBridge[]; docker: boolean }>();
  const [ctl, setCtl] = useState<{ docker: boolean; settings: boolean }>();
  const [modal, setModal] = useState<{ kind: "logs" | "settings" | "add"; bridge?: AdminBridge }>();
  const [busy, setBusy] = useState("");
  const load = useCallback(() => { pager.admin.bridgeList().then(setList).catch((e) => setErr(e.message)); pager.admin.control().then(setCtl).catch(() => {}); }, [setErr]);
  useEffect(load, [load]);
  const counts = (id: string) => (people ?? []).reduce((n, p) => n + (p.networks.find((x) => x.id === id)?.logins.length ?? 0), 0);
  const run = async (b: AdminBridge, action: "restart" | "stop" | "start") => {
    if (action === "stop" && !confirm(`Stop ${b.name}? Everyone's ${b.name} accounts go offline until it starts again.`)) return;
    setBusy(b.id + action); setErr("");
    try { await pager.admin.bridgeAction(b.id, action); await new Promise((r) => setTimeout(r, 2500)); load(); } catch (e) { setErr((e as Error).message); }
    setBusy("");
  };
  return (
    <>
      {ctl && !ctl.docker && (
        <div className="admin-note">
          <b>Restart, stop and settings are switched off.</b>
          <p>To control bridges from here, run this once on the server (it lets the Pager API reach your container runtime and the bridges' settings; <code>--off</code> turns it back off):</p>
          <code className="copy" onClick={() => void navigator.clipboard?.writeText("cd ~/pager/server && ./scripts/enable-admin-control.sh")}>cd ~/pager/server && ./scripts/enable-admin-control.sh</code>
        </div>
      )}
      <div className="pad"><button className="primary" onClick={() => setModal({ kind: "add" })}>Add a bridge</button></div>
      {!list && <p className="muted pad"><span className="spinner" /> Checking bridges…</p>}
      <div className="admin-list">
        {list?.bridges.map((b) => {
          const running = b.container ? b.container.state === "running" : b.up;
          return (
            <section key={b.id} className="admin-card">
              <header className="admin-head static">
                <i className="net-dot" style={{ background: networkMeta(b.id).color }}>{networkMeta(b.id).glyph}</i>
                <span className="admin-who"><b>{b.name}</b><small>{b.container ? `${b.container.status}` : running ? "Running" : "Not responding"}{b.up ? "" : running ? " · not answering yet" : ""}</small></span>
                <span className="admin-badges"><span className="badge-pill">{counts(b.id)} account{counts(b.id) === 1 ? "" : "s"}</span><span className={"badge-pill " + (running && b.up ? "admin" : "off")}>{running && b.up ? "Running" : running ? "Starting" : "Stopped"}</span></span>
              </header>
              <footer>
                <button className="pill" disabled={!ctl?.docker || !!busy} onClick={() => run(b, "restart")}>{busy === b.id + "restart" ? "Restarting…" : "Restart"}</button>
                {running ? <button className="pill danger" disabled={!ctl?.docker || !!busy} onClick={() => run(b, "stop")}>Stop</button> : <button className="pill" disabled={!ctl?.docker || !!busy} onClick={() => run(b, "start")}>Start</button>}
                <button className="pill" disabled={!ctl?.docker} onClick={() => setModal({ kind: "logs", bridge: b })}>Log</button>
                <button className="pill" disabled={!ctl?.settings} onClick={() => setModal({ kind: "settings", bridge: b })}>Settings</button>
              </footer>
            </section>
          );
        })}
      </div>
      {modal?.kind === "logs" && modal.bridge && <LogModal bridge={modal.bridge} onClose={() => setModal(undefined)} />}
      {modal?.kind === "settings" && modal.bridge && <SettingsModal bridge={modal.bridge} onClose={() => { setModal(undefined); load(); }} />}
      {modal?.kind === "add" && (
        <Modal title="Add a bridge" onClose={() => setModal(undefined)} wide>
          <div className="stack">
            {CATALOG.map((c) => {
              const on = list?.bridges.some((b) => b.id === c.id);
              return <div key={c.id} className="admin-app"><i className="net-dot" style={{ background: networkMeta(c.id).color }}>{networkMeta(c.id).glyph}</i><div><b>{c.name}</b><small>{on ? "Installed" : c.how}</small></div><span /><span className="badge-pill">{on ? "Installed" : "Not installed"}</span></div>;
            })}
            <p className="muted">New bridges are added on the server so their secrets stay there. After running the commands, they show up here.</p>
          </div>
        </Modal>
      )}
    </>
  );
}

function LogModal({ bridge, onClose }: { bridge: AdminBridge; onClose: () => void }) {
  const [log, setLog] = useState("Loading…");
  const load = useCallback(() => { pager.admin.bridgeLogs(bridge.id).then(setLog).catch((e) => setLog((e as Error).message)); }, [bridge.id]);
  useEffect(load, [load]);
  return (
    <Modal title={`${bridge.name} log`} onClose={onClose} wide>
      <pre className="admin-log">{log}</pre>
      <div className="row-end"><button className="link" onClick={load}>Refresh</button><button className="primary" onClick={onClose}>Close</button></div>
    </Modal>
  );
}

function SettingsModal({ bridge, onClose }: { bridge: AdminBridge; onClose: () => void }) {
  const [rows, setRows] = useState<AdminSetting[]>();
  const [vals, setVals] = useState<Record<string, boolean | number>>({});
  const [err, setErr] = useState("");
  useEffect(() => { pager.admin.bridgeSettings(bridge.id).then((s) => { setRows(s); setVals(Object.fromEntries(s.map((x) => [x.key, x.value]))); }).catch((e) => setErr(e.message)); }, [bridge.id]);
  const dirty = rows?.some((r) => vals[r.key] !== r.value);
  return (
    <Modal title={`${bridge.name} settings`} onClose={onClose}>
      <div className="stack">
        {err && <div className="error">{err}</div>}
        {!rows && !err && <p className="muted">Loading…</p>}
        {rows?.length === 0 && <p className="muted">This bridge has no options to change here.</p>}
        {rows?.map((r) => (
          <div key={r.key} className="admin-set">
            <div><b>{r.label}</b>{r.hint && <small>{r.hint}</small>}</div>
            {r.kind === "bool" ? <Switch checked={!!vals[r.key]} onChange={(v) => setVals({ ...vals, [r.key]: v })} /> : <input type="number" min={0} value={Number(vals[r.key])} onChange={(e) => setVals({ ...vals, [r.key]: Number(e.target.value) })} />}
          </div>
        ))}
        <p className="muted">Saving restarts {bridge.name} for a few seconds.</p>
        <div className="row-end"><button className="link" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!dirty} onClick={async () => { try { await pager.admin.saveBridgeSettings(bridge.id, vals, true); onClose(); } catch (e) { setErr((e as Error).message); } }}>Save and restart</button></div>
      </div>
    </Modal>
  );
}

// ---- Server --------------------------------------------------------------------------------------------

function ServerTab({ setErr }: { setErr: (m: string) => void }) {
  const [server, setServer] = useState<{ domain: string; signup: "invite" | "open" | "closed"; inviteCode: string }>();
  const [copied, setCopied] = useState(false);
  useEffect(() => { pager.admin.server().then(setServer).catch((e) => setErr(e.message)); }, [setErr]);
  return (
    <Group title="Signups" footer="The invite code lets people create an account. Closing signups stops everyone except the admin code.">
      {!server && <Row title="Loading…" />}
      {server && <>
        <Row title="Address" hint={server.domain} />
        <Select title="Who can sign up" value={server.signup} options={[["invite", "Anyone with the invite code"], ["open", "Anyone"], ["closed", "No one"]]}
          onChange={(v) => pager.admin.setServer({ signup: v }).then(setServer).catch((e) => setErr(e.message))} />
        <Row title="Invite code" hint={server.inviteCode || "none"}>
          <button className="link" onClick={() => { void navigator.clipboard?.writeText(server.inviteCode); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy"}</button>
          <button className="link" onClick={() => { if (confirm("Make a new invite code? The old one stops working.")) pager.admin.setServer({ regenerateInvite: true }).then(setServer).catch((e) => setErr(e.message)); }}>New code</button>
        </Row>
      </>}
    </Group>
  );
}
