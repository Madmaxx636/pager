import { useCallback, useEffect, useState } from "react";
import { AdminUser, Network, pager } from "../core/api";
import { Group, Modal, Row, Select } from "./common";
import { stateLabel } from "./Accounts";

/** Administrator tools: every profile, what each has connected, the bridges, and who may sign up. The server decides who is allowed. */
export function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>();
  const [bridges, setBridges] = useState<{ id: string; name: string; up: boolean }[]>();
  const [server, setServer] = useState<{ domain: string; signup: "invite" | "open" | "closed"; inviteCode: string }>();
  const [open, setOpen] = useState<string>();
  const [logins, setLogins] = useState<Network[]>();
  const [reset, setReset] = useState<AdminUser>();
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    setErr("");
    pager.admin.users().then(setUsers).catch((e) => setErr(e.message));
    pager.admin.bridges().then(setBridges).catch(() => {});
    pager.admin.server().then(setServer).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function toggleOpen(u: AdminUser) {
    if (open === u.id) return setOpen(undefined);
    setOpen(u.id); setLogins(undefined);
    pager.admin.logins(u.id).then(setLogins).catch(() => setLogins([]));
  }
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

      <Group title="Bridges">
        {!bridges && <Row title="Checking…" />}
        {bridges?.map((b) => <Row key={b.id} title={b.name} hint={b.up ? "Running" : "Not responding"}><i className="dot" style={{ background: b.up ? "#22c55e" : "#ef4444" }} /></Row>)}
      </Group>

      <Group title={`Profiles${users ? ` (${users.length})` : ""}`}>
        {!users && <Row title="Loading…" />}
        {users?.map((u) => (
          <div key={u.id}>
            <Row title={`${u.id}${u.you ? " (you)" : ""}`} hint={[u.admin ? "Admin" : "", u.deactivated ? "Deleted" : "", u.created ? `joined ${new Date(u.created).toLocaleDateString()}` : ""].filter(Boolean).join(" · ")} onClick={() => toggleOpen(u)} chevron />
            {open === u.id && (
              <div className="admin-user">
                <h4>Connected apps</h4>
                {!logins && <p className="muted">Loading…</p>}
                {logins?.length === 0 && <p className="muted">Nothing connected.</p>}
                {logins?.map((n) => n.logins.map((l) => (
                  <Row key={n.id + l.id} title={`${n.name}: ${l.name || l.profile?.name || l.id}`} hint={stateLabel(l.state_event)[0]}>
                    <button className="link danger" onClick={act(async () => { if (confirm(`Disconnect this ${n.name} account for ${u.id}?`)) { await pager.admin.logout(u.id, n.id, l.id); setLogins(await pager.admin.logins(u.id)); } })}>Disconnect</button>
                  </Row>
                )))}
                <div className="admin-actions">
                  {!u.you && <button className="pill" onClick={act(() => pager.admin.setAdmin(u.id, !u.admin))}>{u.admin ? "Remove admin" : "Make admin"}</button>}
                  <button className="pill" onClick={() => setReset(u)}>Reset password</button>
                  {!u.you && <button className="pill danger" onClick={act(async () => { if (confirm(`Delete ${u.id}? This removes their account, disconnects their apps and can't be undone.`)) await pager.admin.remove(u.id); })}>Delete profile</button>}
                </div>
              </div>
            )}
          </div>
        ))}
      </Group>

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
