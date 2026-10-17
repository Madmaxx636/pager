import type { Network } from "./api";

/** A login (say your Google Messages) that stopped working: the other service ended it, or the bridge can't reach it. */
export const loginBroken = (state?: string) => state === "BAD_CREDENTIALS" || state === "LOGGED_OUT" || state === "UNKNOWN_ERROR";

export interface Lost { key: string; network: string; account: string; state: string }

/**
 * Compares the networks with the logins already reported as broken. Returns the new set to remember (logins that recovered drop out,
 * so a later failure alerts again) and the logins that just broke and have not been reported yet.
 */
export function newlyLost(reported: string[], nets: Network[]): { remembered: string[]; fresh: Lost[] } {
  const known = new Set(reported), now: Lost[] = [];
  for (const n of nets) for (const l of n.logins) if (loginBroken(l.state_event)) now.push({ key: `${n.id}/${l.id}`, network: n.name, account: l.name || l.profile?.name || "", state: l.state_event! });
  return { remembered: now.map((x) => x.key), fresh: now.filter((x) => !known.has(x.key)) };
}

export function lostText(l: Lost): { title: string; body: string } {
  const who = l.account ? ` (${l.account})` : "";
  const why = l.state === "BAD_CREDENTIALS" || l.state === "LOGGED_OUT" ? "The service ended the login, so Pager can't get your messages until you sign in again." : "Pager lost the connection and can't recover it on its own.";
  return { title: `${l.network} disconnected`, body: `${why}${who} Open Settings → Accounts to sign in again.` };
}

export interface BridgeUpdate { at: string; updated: string[]; putBack: string[] }
const DAY = 86_400_000;

/** The updates an admin has not been told about: newer than the last one reported, and not older than a day (a long-forgotten one is not news). */
export function freshUpdates(seenAt: string | undefined, entries: BridgeUpdate[], now = Date.now()): BridgeUpdate[] {
  const seen = seenAt ? Date.parse(seenAt) : 0;
  return entries.filter((e) => Date.parse(e.at) > seen && now - Date.parse(e.at) < DAY);
}

export function updateText(u: BridgeUpdate, nameOf: (id: string) => string): { title: string; body: string } {
  const names = (ids: string[]) => ids.map(nameOf).join(", ");
  const parts: string[] = [];
  if (u.updated.length) parts.push(`Updated to the newest version: ${names(u.updated)}.`);
  if (u.putBack.length) parts.push(`${names(u.putBack)} would not start on the new version and was put back.`);
  return { title: u.putBack.length ? "Bridge update needs a look" : "Bridges updated", body: parts.join(" ") };
}
