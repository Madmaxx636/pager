import { Component, ReactNode } from "react";

const KEY = "pager.lastError", RELOADS = "pager.reloads";
/** Writes a problem down (on this device, and in the desktop app's log file) so there is something to look at afterwards. */
export function recordProblem(kind: string, e: unknown) {
  const err = e as { message?: string; stack?: string } | undefined;
  const entry = { at: new Date().toISOString(), kind, version: import.meta.env.VITE_APP_VERSION, message: String(err?.message ?? e).slice(0, 400), stack: String(err?.stack ?? "").split("\n").slice(0, 8).join("\n") };
  try { localStorage.setItem(KEY, JSON.stringify(entry)); } catch { /* storage may be unavailable */ }
  try { window.pagerDesktop?.log?.(`${kind}: ${entry.message}\n${entry.stack}`); } catch { /* the shell may be older */ }
}
export const lastProblem = (): unknown => { try { return JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { return null; } };

/**
 * If the screen's code throws, React would drop the whole page and leave only the background colour. This catches it, writes it down and starts
 * the app again by itself (at most three times a minute, so a problem that keeps coming back shows its message instead of flickering).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) {
    recordProblem("screen error", error);
    let recent: number[] = [];
    try { recent = (JSON.parse(sessionStorage.getItem(RELOADS) ?? "[]") as number[]).filter((t) => Date.now() - t < 60_000); } catch { /* none */ }
    if (recent.length < 3) {
      try { sessionStorage.setItem(RELOADS, JSON.stringify([...recent, Date.now()])); } catch { /* none */ }
      window.setTimeout(() => location.reload(), 800);
    }
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 24, textAlign: "center", color: "var(--text)", font: "16px system-ui" }}>
        <div style={{ maxWidth: 440 }}>
          <h2 style={{ margin: "0 0 8px" }}>Pager hit a problem</h2>
          <p style={{ color: "var(--muted)" }}>It is starting again. If this keeps happening, copy the message below and send it along.</p>
          <pre style={{ textAlign: "left", whiteSpace: "pre-wrap", fontSize: 12, background: "var(--panel-2)", padding: 10, borderRadius: 10 }}>{this.state.error.message}</pre>
          <button className="primary" onClick={() => location.reload()} style={{ padding: "10px 18px", borderRadius: 999 }}>Reload now</button>
        </div>
      </div>
    );
  }
}
