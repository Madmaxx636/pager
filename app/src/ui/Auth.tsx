import { Mascot } from "./Mascot";
import { useEffect, useState } from "react";
import { http, pager, ServerConfig } from "../core/api";
import { normalizeServer, signIn } from "../core/store";

/** On the web the server is whoever served the page; the desktop app asks for one. */
export const needsServerField = () => window.location.protocol === "file:" || window.location.protocol === "app:" || !!window.pagerDesktop;

export function Auth() {
  const [server, setServer] = useState(() => localStorage.getItem("pager.server") ?? "");
  const [cfg, setCfg] = useState<ServerConfig>();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const remote = needsServerField();

  useEffect(() => {
    if (remote && !server.trim()) return;
    http.base = remote ? normalizeServer(server) : "";
    const t = setTimeout(() => pager.config().then((c) => { setCfg(c); setError(""); }).catch(() => setError("Can't reach that server.")), remote ? 500 : 0);
    return () => clearTimeout(t);
  }, [server, remote]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      http.base = remote ? normalizeServer(server) : "";
      const name = username.trim().toLowerCase();
      if (mode === "up") await pager.signup(name, password, invite.trim());
      if (remote) localStorage.setItem("pager.server", server.trim());
      await signIn(remote ? server : window.location.origin, name, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <form className="auth-card" onSubmit={submit}>
        <div className="logo"><Mascot size={64} /><b>Pager</b></div>
        <h1>{mode === "in" ? "Welcome back" : "Create your account"}</h1>
        <p className="muted">All your chats, one inbox, on your own server.</p>
        {remote && <label>Server<input value={server} onChange={(e) => setServer(e.target.value)} placeholder="matrix.example.com" autoFocus autoCapitalize="none" required /></label>}
        <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus={!remote} autoCapitalize="none" required />
          {cfg && <small>@{username.trim().toLowerCase() || "you"}:{cfg.domain}</small>}</label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === "up" ? 8 : undefined} /></label>
        {mode === "up" && cfg?.inviteRequired && <label>Invite code<input value={invite} onChange={(e) => setInvite(e.target.value)} required /></label>}
        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={busy}>{busy ? "One moment…" : mode === "in" ? "Sign in" : "Create account"}</button>
        {cfg && cfg.signup !== "closed" && (
          <button type="button" className="link" onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(""); }}>
            {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
          </button>
        )}
      </form>
    </main>
  );
}
