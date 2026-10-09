import { parseDocument } from "yaml";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** The few bridge options an admin can change from the app. Anything else is edited on the server. */
export const SETTINGS: { key: string; path: string[]; label: string; kind: "bool" | "number"; hint: string }[] = [
  { key: "backfill", path: ["backfill", "enabled"], label: "Download old messages", kind: "bool", hint: "Fetch history when a chat is first created" },
  { key: "backfillInitial", path: ["backfill", "max_initial_messages"], label: "Messages to download per new chat", kind: "number", hint: "" },
  { key: "backfillCatchup", path: ["backfill", "max_catchup_messages"], label: "Messages to catch up after a restart", kind: "number", hint: "" },
  { key: "deliveryReceipts", path: ["matrix", "delivery_receipts"], label: "Delivery receipts", kind: "bool", hint: "Show when a message reached the other app" },
  { key: "statusEvents", path: ["matrix", "message_status_events"], label: "Message status events", kind: "bool", hint: "" },
  { key: "typingPresence", path: ["network", "send_presence_on_typing"], label: "Show online while you type", kind: "bool", hint: "Lets you receive typing indicators" },
  { key: "fullHistory", path: ["network", "history_sync", "request_full_sync"], label: "Ask for a full history sync when linking", kind: "bool", hint: "" },
];

const file = (dir: string, id: string) => join(dir, id, "config.yaml");

export function readSettings(dir: string, id: string) {
  const f = file(dir, id);
  if (!existsSync(f)) return undefined;
  const doc = parseDocument(readFileSync(f, "utf8"));
  return SETTINGS.filter((s) => doc.hasIn(s.path)).map((s) => ({ ...s, value: doc.getIn(s.path) as boolean | number }));
}

/** Writes only the known keys, with the right type. Returns what changed. */
export function writeSettings(dir: string, id: string, values: Record<string, unknown>): string[] {
  const f = file(dir, id);
  if (!existsSync(f)) throw new Error("No config for that bridge");
  const doc = parseDocument(readFileSync(f, "utf8"));
  const changed: string[] = [];
  for (const [k, v] of Object.entries(values)) {
    const s = SETTINGS.find((x) => x.key === k);
    if (!s || !doc.hasIn(s.path)) continue;
    if (s.kind === "bool" && typeof v !== "boolean") throw new Error(`${s.label} must be on or off`);
    if (s.kind === "number" && !(typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100000)) throw new Error(`${s.label} must be a whole number`);
    if (doc.getIn(s.path) !== v) { doc.setIn(s.path, v); changed.push(k); }
  }
  if (changed.length) { writeFileSync(f + ".bak", readFileSync(f)); writeFileSync(f, String(doc)); }
  return changed;
}

/** What a bridge's registration file says about its bot: the token it acts with and the bot's name. */
export function readRegistration(dir: string, id: string): { asToken: string; bot: string } | undefined {
  const f = join(dir, id, "registration.yaml");
  if (!existsSync(f)) return undefined;
  const doc = parseDocument(readFileSync(f, "utf8"));
  const asToken = doc.get("as_token"), bot = doc.get("sender_localpart");
  return typeof asToken === "string" && typeof bot === "string" ? { asToken, bot } : undefined;
}
