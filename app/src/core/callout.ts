import type { ChatState } from "./types";
import { isPhone, stripTag } from "./names";

/** A way to start a call with this person outside Pager: opens the other app, or the phone's dialler. */
export type CallOption = { id: string; label: string; url: string };

/** A bridge puts the number of a person in the id it gives them: @whatsapp_15551234567:server. (Signal and others use ids that hold no number.) */
const GHOST_NUMBER = /^@(?:whatsapp|gmessages|gvoice|googlevoice|sms)_\+?(\d{7,15})(?::|$)/;
const GHOST_MESSENGER = /^@(?:messenger|facebook|meta)_(\d{5,20})(?::|$)/;

/** "+1 (555) 123-4567" -> "+15551234567". A number written without a country code and shorter than 11 digits is kept as it is (a dialler can use it, WhatsApp and Signal cannot). */
export function normalizeNumber(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 7 || digits.length > 15) return "";
  return raw.trim().startsWith("+") || digits.length >= 11 ? "+" + digits : digits;
}

type Who = Pick<ChatState, "name" | "heroes" | "joined" | "network">;
const others = (c: Who, me: string) => [...new Set([...c.heroes, ...c.joined])].filter((u) => u !== me);

/**
 * The other person's number(s) in a one-to-one chat, as far as Pager can tell: from their bridge id; else the chat's name when it is a bare number; else every
 * number your own contacts list for a person with that name (a contact can have two).
 */
export function numbersFor(c: Who, me: string, contacts: [string, string][] = []): string[] {
  for (const u of others(c, me)) { const m = GHOST_NUMBER.exec(u); if (m) return ["+" + m[1]]; }
  const name = stripTag(c.name).trim();
  if (isPhone(name)) return [normalizeNumber(name)].filter(Boolean);
  const seen = new Set<string>(), out: string[] = [];
  for (const [num, n] of contacts) {
    if (n.trim().toLowerCase() !== name.toLowerCase()) continue;
    const v = normalizeNumber(num), key = v.replace(/\D/g, "").slice(-10);
    if (v && !seen.has(key)) { seen.add(key); out.push(v); }
  }
  return out;
}
/** The first of them (see numbersFor). */
export const numberFor = (c: Who, me: string, contacts: [string, string][] = []): string => numbersFor(c, me, contacts)[0] ?? "";

/** The Messenger id of the other person, when the bridge gave it in their id. */
export const messengerId = (c: Who, me: string): string => { for (const u of others(c, me)) { const m = GHOST_MESSENGER.exec(u); if (m) return m[1]; } return ""; };

/**
 * What can be offered for a one-to-one chat. None of these calls go through Pager: the network's own app (or the phone) makes the call, because bridges
 * carry messages, not calls. WhatsApp and Signal links open the conversation, where the call button is one tap away.
 * [canDial] is true on a phone, where a tel: link opens the dialler.
 */
export function callOptions(c: Who & { isGroup?: boolean }, me: string, contacts: [string, string][], canDial: boolean): CallOption[] {
  if (c.isGroup || c.network === "matrix") return [];
  const numbers = numbersFor(c, me, contacts), number = numbers[0] ?? "";
  const international = number.startsWith("+");
  const out: CallOption[] = [];
  if (c.network === "whatsapp" && international) out.push({ id: "whatsapp", label: "Open in WhatsApp (then tap the call button)", url: `https://wa.me/${number.slice(1)}` });
  if (c.network === "signal" && international) out.push({ id: "signal", label: "Open in Signal (then tap the call button)", url: `https://signal.me/#p/${number}` });
  if (c.network === "messenger") { const id = messengerId(c, me); if (id) out.push({ id: "messenger", label: "Open in Messenger (then tap the call button)", url: `https://www.messenger.com/t/${id}` }); }
  if (canDial) for (const n of numbers) out.push({ id: `phone-${n}`, label: `Call ${n} with your phone`, url: `tel:${n}` });
  return out;
}

/** One list for a person who has several chats (a merged page): what each of them offers, without repeats. */
export function callOptionsFor(chats: (Who & { isGroup?: boolean })[], me: string, contacts: [string, string][], canDial: boolean): CallOption[] {
  const seen = new Set<string>();
  return chats.flatMap((c) => callOptions(c, me, contacts, canDial)).filter((o) => !seen.has(o.url) && !!seen.add(o.url));
}
