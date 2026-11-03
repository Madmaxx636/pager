import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** One problem the server's log watcher kept (see server/logwatch/logwatch.py): the line, the lines just before it and the lines after it. */
export interface Incident {
  id: string;
  fp: string;
  service: string;
  severity: "crash" | "error" | "attention" | "warning";
  message: string;
  first: number;
  last: number;
  count: number;
  before: string[];
  after: string[];
}
export type Level = "important" | "errors" | "all";

const SHOWN: Record<Level, Incident["severity"][]> = {
  errors: ["crash", "error"],
  important: ["crash", "error", "attention"],
  all: ["crash", "error", "attention", "warning"],
};

const SEVERITIES = new Set(["crash", "error", "attention", "warning"]);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const lines = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 60).map((x) => x.slice(0, 400)) : []);

/** Reads what the watcher wrote. Anything odd (a half-written file, a wrong shape) gives an empty list, never an error. */
export function readIncidents(dir: string): { updated: number; incidents: Incident[] } {
  try {
    const doc = JSON.parse(readFileSync(join(dir, "incidents.json"), "utf8"));
    const incidents: Incident[] = (Array.isArray(doc.incidents) ? doc.incidents : [])
      .filter((r: any) => r && typeof r.fp === "string" && SEVERITIES.has(r.severity))
      .map((r: any) => ({
        id: text(r.id, 40), fp: text(r.fp, 40), service: text(r.service, 40), severity: r.severity, message: text(r.message, 400),
        first: Number(r.first) || 0, last: Number(r.last) || 0, count: Math.max(1, Number(r.count) || 1), before: lines(r.before), after: lines(r.after),
      }));
    return { updated: Number(doc.updated) || 0, incidents };
  } catch {
    return { updated: 0, incidents: [] };
  }
}

function readAcks(dir: string): Record<string, number> {
  try { const a = JSON.parse(readFileSync(join(dir, "acks.json"), "utf8")); return a && typeof a === "object" ? a : {}; } catch { return {}; }
}

/** The incidents to show: newest first, of the chosen kinds, leaving out those that were dismissed and have not happened again since. */
export function listIncidents(dir: string, level: Level = "important", limit = 200) {
  const { updated, incidents } = readIncidents(dir);
  const acks = readAcks(dir);
  const open = incidents.filter((i) => !(acks[i.fp] >= i.last));
  const counts = { crash: 0, error: 0, attention: 0, warning: 0 };
  for (const i of open) counts[i.severity]++;
  const kinds = SHOWN[level] ?? SHOWN.important;
  const shown = open.filter((i) => kinds.includes(i.severity)).sort((a, b) => b.last - a.last).slice(0, Math.max(1, Math.min(limit, 500)));
  return { updated, counts, incidents: shown };
}

/** Dismisses incidents by their fingerprint (or all of them): they come back only if the same thing happens again. */
export function ackIncidents(dir: string, fps: string[] | "all"): number {
  const { incidents } = readIncidents(dir);
  const acks = readAcks(dir);
  const now = Date.now() / 1000;
  let n = 0;
  for (const i of incidents) if (fps === "all" ? i.severity !== "warning" : fps.includes(i.fp)) { acks[i.fp] = Math.max(now, i.last); n++; }
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = join(dir, "acks.json.tmp");
  writeFileSync(tmp, JSON.stringify(acks));
  renameSync(tmp, join(dir, "acks.json"));
  return n;
}
