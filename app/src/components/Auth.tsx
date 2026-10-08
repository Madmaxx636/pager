import { useEffect, useState } from "react";
import { getConfig, signup, type ServerConfig } from "../api";
import { signIn } from "../matrix";

export function Auth() {
  const [cfg, setCfg] = useState<ServerConfig>();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getConfig().then(setCfg).catch(() => setError("Can't reach the Pager server."));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const name = username.trim().toLowerCase();
      if (mode === "up") await signup(name, password, invite.trim());
      await signIn(name, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  const canSignUp = cfg && cfg.signup !== "closed";

  return (
    <main className="auth">
      <form className="auth-card" onSubmit={submit}>
        <div className="logo">
          <span className="logo-mark" />
          <b>Pager</b>
        </div>
        <h1>{mode === "in" ? "Welcome back" : "Create your account"}</h1>
        <p className="muted">All your chats, one inbox, on your own server.</p>

        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoCapitalize="none" required />
          {cfg && <small>@{username.trim().toLowerCase() || "you"}:{cfg.domain}</small>}
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === "up" ? 8 : undefined} />
        </label>
        {mode === "up" && cfg?.inviteRequired && (
          <label>
            Invite code
            <input value={invite} onChange={(e) => setInvite(e.target.value)} required />
          </label>
        )}

        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={busy}>
          {busy ? "One moment…" : mode === "in" ? "Sign in" : "Create account"}
        </button>
        {canSignUp && (
          <button type="button" className="link" onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(""); }}>
            {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
          </button>
        )}
      </form>
    </main>
  );
}
