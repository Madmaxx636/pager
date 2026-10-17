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
