// Tidy names. Bridges add their tag to every name ("Sam (WA)") and show a bare phone number for anyone they have no name for.
// We drop the tag and look numbers up in a phone book built from your bridges' contact lists (and a contacts file you import).

const TAGS = "wa|whatsapp|signal|sms|rcs|gm|gmessages|google messages|messenger|fb|facebook|ig|instagram|tg|telegram|dc|discord|slack|twitter|x|bsky|bluesky|li|linkedin|imessage";
const tagSuffix = new RegExp(`\\s*[(\\[]\\s*(?:${TAGS})\\s*[)\\]]\\s*$`, "i");
const phoneLike = /^\+?[\d\s().-]{7,20}$/;

/** "Sam (WA)" -> "Sam". */
export const stripTag = (n: string) => n.replace(tagSuffix, "").trim();
export const isPhone = (n: string) => phoneLike.test(n.trim()) && n.replace(/\D/g, "").length >= 7;
/** Digits only, matched on the last 10 so "+1 (555) 123-4567" and "5551234567" are the same person. */
export const phoneKey = (n: string) => { const d = n.replace(/\D/g, ""); return d.length >= 7 ? d.slice(-10) : ""; };

let book: Record<string, string> = (() => { try { return JSON.parse(localStorage.getItem("pager.phonebook") ?? "{}"); } catch { return {}; } })();
let listener: (() => void) | undefined;
export const onPhonebookChange = (fn: () => void) => { listener = fn; };

/** Add names to the phone book. Later entries win only when the number had no name yet, unless `override` (your own contacts file). */
export function addToPhonebook(entries: { number: string; name: string }[], override = false) {
  let changed = false;
  for (const { number, name } of entries) {
    const k = phoneKey(number), nm = stripTag(name ?? "").trim();
    if (!k || !nm || isPhone(nm)) continue;
    if (book[k] === nm || (book[k] && !override)) continue;
    book[k] = nm; changed = true;
  }
  if (changed) { try { localStorage.setItem("pager.phonebook", JSON.stringify(book)); } catch { /* quota */ } listener?.(); }
  return changed;
}
export const lookup = (number: string) => book[phoneKey(number)];
export const phonebookSize = () => Object.keys(book).length;

/** A name fit to show: no network tag, and a contact's name instead of a bare number when we know it. */
export function prettyName(raw: string): string {
  const n = stripTag(raw);
  if (isPhone(n)) return lookup(n) ?? n;
  return n || raw;
}

/** Parse a .vcf export (Google Contacts, iPhone, Android) into name + number pairs. */
export function parseVcf(text: string): { number: string; name: string }[] {
  const out: { number: string; name: string }[] = [];
  for (const card of text.replace(/\r/g, "").replace(/\n[ \t]/g, "").split(/BEGIN:VCARD/i).slice(1)) {
    const fn = /^FN[^:]*:(.+)$/im.exec(card)?.[1]?.trim()
      ?? (() => { const n = /^N[^:]*:(.+)$/im.exec(card)?.[1]?.split(";"); return n ? `${n[1] ?? ""} ${n[0] ?? ""}`.trim() : ""; })();
    if (!fn) continue;
    for (const m of card.matchAll(/^TEL[^:]*:(.+)$/gim)) out.push({ number: m[1].trim(), name: fn });
  }
  return out;
}
