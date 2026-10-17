import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface BridgeUpdate { at: string; updated: string[]; putBack: string[] }

/** What the weekly bridge update did, newest last. The update script writes the file next to the API's other saved settings. */
export function readBridgeUpdates(stateFile?: string): BridgeUpdate[] {
  if (!stateFile) return [];
  try {
    const raw = JSON.parse(readFileSync(join(dirname(stateFile), "bridge-updates.json"), "utf8"));
    const list = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : []);
    return (Array.isArray(raw) ? raw : []).filter((r) => r && typeof r.at === "string" && !Number.isNaN(Date.parse(r.at))).map((r) => ({ at: r.at as string, updated: list(r.updated), putBack: list(r.putBack) })).slice(-20);
  } catch { return []; }
}
