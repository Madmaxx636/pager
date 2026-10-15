import { useSyncExternalStore } from "react";

/** One bridge import at a time: from linking an account until its chats have stopped arriving. Kept on this device. */
export interface ImportJob {
  network: string;
  name: string;
  /** "all" brings everything in; "choose" lets the user pick the chats to keep once they have arrived. */
  mode: "all" | "choose";
  startedAt: number;
  /** Chats of this network that existed before linking, so only new ones count. */
  baseChats: number;
  /** Chats and messages seen so far, and when either last grew. */
  chats: number;
  messages: number;
  changedAt: number;
  phase: "linking" | "importing" | "choosing" | "done";
  /** When the account finished linking. After that the import can end even if no new chat ever turns up (linking an account again brings none). */
  linkedAt?: number;
}

/** The import counts as finished when nothing new has arrived for this long. */
export const QUIET_MS = 2 * 60_000;
/** Longest the screen waits without any chats showing up before it lets the user move on. */
export const NOTHING_MS = 10 * 60_000;

const KEY = "pager.importJob";
let job: ImportJob | undefined;
const listeners = new Set<() => void>();
try { const raw = localStorage.getItem(KEY); if (raw) job = JSON.parse(raw) as ImportJob; } catch { /* none */ }

export const currentImport = () => job;
export function setImport(next: ImportJob | undefined) {
  job = next;
  try { next ? localStorage.setItem(KEY, JSON.stringify(next)) : localStorage.removeItem(KEY); } catch { /* private mode */ }
  listeners.forEach((l) => l());
}
export function useImport(): ImportJob | undefined {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => job);
}
/** True while another bridge may not be added. */
export const importBusy = (j: ImportJob | undefined) => j != null && j.phase !== "done";

/** Advances a job given how many chats and messages the network has now. Pure, so it can be tested. */
export function advance(j: ImportJob, chats: number, messages: number, now: number): ImportJob {
  if (j.phase === "choosing" || j.phase === "done") return j;
  let next = j;
  if (chats !== j.chats || messages !== j.messages) next = { ...j, chats, messages, changedAt: now, phase: chats > 0 || j.linkedAt ? "importing" : j.phase };
  const quiet = now - next.changedAt >= QUIET_MS;
  // Chats came in: wait for the quiet spell, then let you choose (or finish). Linked but nothing new came in (an account linked again): finish too.
  if (next.phase === "importing" && quiet) return { ...next, phase: next.mode === "choose" && next.chats > 0 ? "choosing" : "done" };
  return next;
}

/** True when the wait for chats to show up has gone on for too long, so the user is offered a way out. */
export const stuck = (j: ImportJob, now: number) => j.phase !== "done" && j.chats === 0 && !j.linkedAt && now - j.startedAt >= NOTHING_MS;

/** The account finished linking: from here the import is counted as running. */
export const linked = (j: ImportJob, now: number): ImportJob => ({ ...j, linkedAt: now, changedAt: now, phase: j.phase === "linking" ? "importing" : j.phase });

/** A rough fraction for the bar: the bridges never say how much is coming, so it fills as the pace slows down. */
export function fraction(j: ImportJob, now: number): number {
  if (j.phase === "done" || j.phase === "choosing") return 1;
  if (j.phase === "linking") return 0;
  if (j.chats === 0 && !j.linkedAt) return 0;
  return Math.min(0.95, Math.max(0.05, (now - j.changedAt) / QUIET_MS));
}
