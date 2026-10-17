/** Automatic bridge restarts: an admin picks how often per bridge; the API restarts it when the time comes. Times are UTC. */
export type Every = "off" | "6h" | "12h" | "daily";
export interface Sched { every: Every; /** HH:MM, UTC (daily only) */ at: string; /** When it last restarted or was set up, ms */ last: number; /** How the last automatic restart went */ result?: "ok" | "failed" }
export const EVERIES: Every[] = ["off", "6h", "12h", "daily"];
const HOUR = 3_600_000, DAY = 24 * HOUR;

export const parseAt = (at: unknown): { h: number; m: number } | undefined => {
  const x = typeof at === "string" ? /^([01]\d|2[0-3]):([0-5]\d)$/.exec(at) : null;
  return x ? { h: Number(x[1]), m: Number(x[2]) } : undefined;
};

/** Cleans what came from a request or an old file; anything odd becomes "off". */
export function clean(x: unknown, now: number): Sched {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const every = EVERIES.includes(o.every as Every) ? (o.every as Every) : "off";
  return { every, at: parseAt(o.at) ? (o.at as string) : "04:00", last: typeof o.last === "number" && Number.isFinite(o.last) ? o.last : now, ...(o.result === "ok" || o.result === "failed" ? { result: o.result } : {}) };
}

/** True when a restart is owed: the period has passed, or today's (or yesterday's) set time has passed since the last one. */
export function isDue(s: Sched, now: number): boolean {
  if (s.every === "off") return false;
  if (s.every === "6h") return now - s.last >= 6 * HOUR;
  if (s.every === "12h") return now - s.last >= 12 * HOUR;
  const t = parseAt(s.at); if (!t) return false;
  const d = new Date(now);
  let occ = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), t.h, t.m);
  if (occ > now) occ -= DAY;
  return occ > s.last;
}

/** Restarts every bridge that is due. [restart] says whether it worked. Returns the ids it tried. */
export async function runDue(all: Record<string, Sched>, now: number, restart: (id: string) => Promise<boolean>): Promise<string[]> {
  const tried: string[] = [];
  for (const [id, s] of Object.entries(all)) {
    if (!isDue(s, now)) continue;
    tried.push(id);
    s.result = await restart(id).catch(() => false) ? "ok" : "failed";
    s.last = now;
  }
  return tried;
}
