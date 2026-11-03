/**
 * What this device did and what went wrong, kept on the device so a problem can be looked at afterwards (Settings > Logs).
 * Breadcrumbs are short lines about what the app was doing (sync, encryption, network). An incident is a problem with the
 * breadcrumbs from just before it and just after it. Never in here: message text, names, keys, tokens (they are scrubbed).
 */
export type Crumb = { t: number; area: string; text: string };
export type AppIncident = { id: string; kind: string; message: string; stack: string; first: number; last: number; count: number; version: string; before: Crumb[]; after: Crumb[] };

const CRUMBS = "pager.applog.crumbs", INCIDENTS = "pager.applog.incidents";
export const MAX_CRUMBS = 200, MAX_INCIDENTS = 40, BEFORE = 25, AFTER = 10, AFTER_WINDOW_MS = 60_000;

let crumbs: Crumb[] | undefined, incidents: AppIncident[] | undefined, saveTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

const read = <T,>(k: string): T[] => { try { const v = JSON.parse(localStorage.getItem(k) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage may be full or unavailable */ } };
const loadCrumbs = () => (crumbs ??= read<Crumb>(CRUMBS));
const loadIncidents = () => (incidents ??= read<AppIncident>(INCIDENTS));
const changed = () => { for (const f of listeners) f(); };
function scheduleSave() {
  if (saveTimer !== undefined) return;
  saveTimer = setTimeout(() => { saveTimer = undefined; write(CRUMBS, loadCrumbs()); write(INCIDENTS, loadIncidents()); }, 2000);
}
/** Written out right away: used when the page is about to go. */
export function flushLog() { if (saveTimer !== undefined) { clearTimeout(saveTimer); saveTimer = undefined; } write(CRUMBS, loadCrumbs()); write(INCIDENTS, loadIncidents()); }

/** Takes out what must never be kept: access tokens, bearer headers, recovery keys, long secrets, email addresses. */
export function scrub(s: string): string {
  return s
    .replace(/(access_token|password|token|secret|recovery[ _-]?key)(["']?\s*[:=]\s*["']?)[^\s"',&}]+/gi, "$1$2[removed]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [removed]")
    .replace(/\b(syt|mat)_[A-Za-z0-9_-]{10,}/g, "[removed]")
    .replace(/\bE[sS][A-Za-z0-9]{2}(?:\s[A-Za-z0-9]{4}){10,}\b/g, "[recovery key removed]")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[address removed]");
}

/** One short line about what the app is doing. */
export function crumb(area: string, text: string) {
  const c: Crumb = { t: Date.now(), area, text: scrub(text).slice(0, 200) };
  const all = loadCrumbs(); all.push(c); if (all.length > MAX_CRUMBS) all.splice(0, all.length - MAX_CRUMBS);
  const now = c.t;
  for (const i of loadIncidents()) if (i.after.length < AFTER && now - i.last < AFTER_WINDOW_MS && now >= i.last) i.after.push(c);
  scheduleSave(); changed();
}

const fingerprint = (kind: string, message: string) => `${kind}|${message.replace(/[0-9a-f]{8,}|\d+/gi, "#").slice(0, 120)}`;

/** A problem. The same problem again is counted, not listed again. */
export function recordIncident(kind: string, message: string, stack = "") {
  const msg = scrub(message).slice(0, 400), id = fingerprint(kind, msg), now = Date.now();
  const all = loadIncidents();
  const old = all.find((i) => i.id === id);
  if (old) { old.count++; old.last = now; old.after = []; }
  else {
    all.push({ id, kind, message: msg, stack: scrub(stack).split("\n").slice(0, 8).join("\n"), first: now, last: now, count: 1, version: String(import.meta.env?.VITE_APP_VERSION ?? ""), before: loadCrumbs().slice(-BEFORE), after: [] });
    if (all.length > MAX_INCIDENTS) { all.sort((a, b) => b.last - a.last); all.length = MAX_INCIDENTS; }
  }
  crumb("problem", `${kind}: ${msg.split("\n")[0]}`);
}

export const getCrumbs = (): Crumb[] => [...loadCrumbs()];
export const getIncidents = (): AppIncident[] => [...loadIncidents()].sort((a, b) => b.last - a.last);
export function dismissIncident(id: string) { incidents = loadIncidents().filter((i) => i.id !== id); scheduleSave(); changed(); }
export function clearLog() { crumbs = []; incidents = []; scheduleSave(); changed(); }
export function onLogChange(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }

const hms = (t: number) => new Date(t).toLocaleTimeString([], { hour12: false });
const line = (c: Crumb) => `  ${hms(c.t)}  ${c.area}: ${c.text}`;
/** One incident as plain text, to copy or send. */
export function appIncidentText(i: AppIncident): string {
  const when = (t: number) => new Date(t).toLocaleString();
  return [`${i.kind} (${i.count === 1 ? "once" : `${i.count} times`}), first ${when(i.first)}, last ${when(i.last)}${i.version ? `, app ${i.version}` : ""}`, "", ...(i.before.length ? ["Before:", ...i.before.map(line), ""] : []), "Problem:", "  " + i.message, ...(i.stack ? i.stack.split("\n").map((l) => "  " + l) : []), ...(i.after.length ? ["", "After:", ...i.after.map(line)] : [])].join("\n");
}
/** Everything, as text: the problems then the latest breadcrumbs. */
export function logText(): string {
  const inc = getIncidents().map(appIncidentText);
  return [`Pager ${String(import.meta.env?.VITE_APP_VERSION ?? "")}  ${navigator.userAgent}`, "", `== Problems (${inc.length}) ==`, inc.join("\n\n") || "none", "", `== Recent activity (${loadCrumbs().length}) ==`, loadCrumbs().map(line).join("\n") || "none"].join("\n");
}

/** Resets the in-memory copy (tests). */
export function resetLogForTests() { crumbs = undefined; incidents = undefined; if (saveTimer !== undefined) { clearTimeout(saveTimer); saveTimer = undefined; } }
