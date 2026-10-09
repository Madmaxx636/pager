import { useCallback, useEffect, useState } from "react";
import { AdminPerson, AdminUser, pager } from "../core/api";
import { networkMeta } from "../core/emoji";
import { Group, Modal, Row, Select } from "./common";
import { stateLabel } from "./Accounts";

const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

/** Administrator tools: the server's signups and bridges, and every profile with everything it has connected. The server decides who is allowed. */
export function AdminPage() {
  const [people, setPeople] = useState<AdminPerson[]>();
  const [bridges, setBridges] = useState<{ id: string; name: string; up: boolean }[]>();
  const [server, setServer] = useState<{ domain: string; signup: "invite" | "open" | "closed"; inviteCode: string }>();
  const [reset, setReset] = useState<AdminUser>();
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    setErr("");
    pager.admin.overview().then(setPeople).catch((e) => setErr(e.message));
    pager.admin.bridges().then(setBridges).catch(() => {});
    pager.admin.server().then(setServer).catch(() => {});
  }, []);
  useEffect(load, [load]);
  const act = (fn: () => Promise<unknown>) => async () => { try { await fn(); load(); } catch (e) { setErr((e as Error).message); } };

  return (
    <>
      {err && <div className="error pad">{err}</div>}

      <Group title="Server" footer="The invite code lets people create an account. Closing signups stops everyone except the admin code.">
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

      <h3 className="sec">Bridges</h3>
      <div className="admin-bridges">
        {!bridges && <span className="muted">Checking…</span>}
        {bridges?.map((b) => <span key={b.id} className={"admin-bridge" + (b.up ? "" : " down")}><i style={{ background: b.up ? "#22c55e" : "#ef4444" }} />{b.name}<small>{b.up ? "running" : "not responding"}</small></span>)}
      </div>

      <h3 className="sec">Profiles{people ? ` (${people.length})` : ""}</h3>
      {!people && <p className="muted pad"><span className="spinner" /> Loading everyone…</p>}
      <div className="admin-list">
        {people?.map((u) => {
          const name = u.displayname || u.id.replace(/^@/, "").split(":")[0];
          const total = u.networks.reduce((n, x) => n + x.logins.length, 0);
          return (
            <section key={u.id} className={"admin-card" + (u.deactivated ? " gone" : "")}>
              <header>
                <span className="admin-av" style={{ background: `linear-gradient(135deg, hsl(${hue(u.id)} 55% 52%), hsl(${(hue(u.id) + 28) % 360} 62% 38%))` }}>{name[0]?.toUpperCase()}</span>
                <div className="admin-who">
                  <b>{name}</b>
                  <small>{u.id}{u.created ? ` · joined ${new Date(u.created).toLocaleDateString()}` : ""}</small>
                </div>
                <div className="admin-badges">
                  {u.admin && <span className="badge-pill admin">Admin</span>}
                  {u.you && <span className="badge-pill">You</span>}
                  {u.deactivated && <span className="badge-pill off">Deleted</span>}
                </div>
              </header>

              <div className="admin-apps">
                {total === 0 && !u.networks.length && <p className="muted">{u.deactivated ? "Account deleted." : "Nothing connected yet."}</p>}
                {u.networks.map((n) => n.logins.map((l) => {
                  const [label, color] = stateLabel(l.state_event);
                  const meta = networkMeta(n.id);
                  return (
                    <div key={n.id + l.id} className="admin-app">
                      <i className="net-dot" style={{ background: meta.color }}>{meta.glyph}</i>
                      <div><b>{n.name}</b><small>{l.name || l.profile?.name || l.id}</small></div>
                      <span className="admin-state"><i className="dot" style={{ background: color }} />{label}</span>
                      <button className="link danger" onClick={act(async () => { if (confirm(`Disconnect this ${n.name} account for ${name}?`)) await pager.admin.logout(u.id, n.id, l.id); })}>Disconnect</button>
                    </div>
                  );
                }))}
                {u.networks.filter((n) => n.error && !n.logins.length).map((n) => <p key={n.id} className="warn">{n.name}: couldn't check ({n.error})</p>)}
              </div>

              {!u.deactivated && (
                <footer>
                  {!u.you && <button className="pill" onClick={act(() => pager.admin.setAdmin(u.id, !u.admin))}>{u.admin ? "Remove admin" : "Make admin"}</button>}
                  <button className="pill" onClick={() => setReset(u)}>Reset password</button>
                  {!u.you && <button className="pill danger" onClick={act(async () => { if (confirm(`Delete ${name}? This removes their account, disconnects their apps and can't be undone.`)) await pager.admin.remove(u.id); })}>Delete profile</button>}
                </footer>
              )}
            </section>
          );
        })}
      </div>

      {reset && (
        <Modal title={`New password for ${reset.id}`} onClose={() => setReset(undefined)}>
          <ResetPassword user={reset} onDone={() => setReset(undefined)} />
        </Modal>
      )}
    </>
  );
}

function ResetPassword({ user, onDone }: { user: AdminUser; onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  return (
    <form className="stack" onSubmit={async (e) => { e.preventDefault(); try { await pager.admin.resetPassword(user.id, pw); onDone(); } catch (x) { setErr((x as Error).message); } }}>
      <p className="muted">They will be signed out everywhere and must use this password next time.</p>
      <label>New password (8+ characters)<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus minLength={8} required /></label>
      {err && <div className="error">{err}</div>}
      <div className="row-end"><button type="button" className="link" onClick={onDone}>Cancel</button><button className="primary" disabled={pw.length < 8}>Set password</button></div>
    </form>
  );
}
