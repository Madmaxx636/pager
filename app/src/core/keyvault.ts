/**
 * The master password: a copy of the recovery key, locked with a password you choose, kept in your account on your server.
 * A new device (or a signed-in one) that knows the password can read the recovery key back, so the key can be shown, copied, or
 * used to restore a history without having to find the file you saved. Same format on web, desktop and Android (KeyVault.kt).
 *
 * The server holds only the locked copy, but whoever runs the server could try passwords against it offline: the key derivation
 * is slow on purpose, and a long password (several random words) is what keeps it safe.
 */
export const VAULT_TYPE = "app.pager.key_vault";
export const MIN_PASSWORD = 10;
const ITERATIONS = 600_000;
const AAD = new TextEncoder().encode("pager-key-vault-v1");

/** What is stored in the account. `backup` is the recovery backup version it unlocks: a newer backup makes it out of date. */
export type Vault = { v: 1; kdf: "pbkdf2-sha256"; iter: number; salt: string; iv: string; ct: string; backup: string; at: number };

const b64 = (b: Uint8Array) => { let s = ""; for (const x of b) s += String.fromCharCode(x); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const subtle = () => { const s = globalThis.crypto?.subtle; if (!s) throw new Error("This browser can't do the encryption a master password needs"); return s; };

async function aesKey(password: string, salt: Uint8Array, iter: number) {
  const base = await subtle().importKey("raw", new TextEncoder().encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: iter }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** Locks [recoveryKey] with [password]. [salt] and [iv] are for tests only. */
export async function sealRecoveryKey(recoveryKey: string, password: string, backup: string, salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12))): Promise<Vault> {
  if (password.length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters`);
  const key = await aesKey(password, salt, ITERATIONS);
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: AAD as BufferSource }, key, new TextEncoder().encode(recoveryKey)));
  return { v: 1, kdf: "pbkdf2-sha256", iter: ITERATIONS, salt: b64(salt), iv: b64(iv), ct: b64(ct), backup, at: Date.now() };
}

/** Reads the recovery key back. Throws "wrong password" when the password does not open it. */
export async function openRecoveryKey(vault: Vault, password: string): Promise<string> {
  if (!vault || vault.v !== 1 || vault.kdf !== "pbkdf2-sha256" || !vault.ct) throw new Error("This master password was made by a newer Pager. Update the app");
  if (!(vault.iter >= 100_000 && vault.iter <= 5_000_000)) throw new Error("The master password on your server looks damaged");
  try {
    const key = await aesKey(password, unb64(vault.salt), vault.iter);
    const clear = await subtle().decrypt({ name: "AES-GCM", iv: unb64(vault.iv) as BufferSource, additionalData: AAD as BufferSource }, key, unb64(vault.ct) as BufferSource);
    return new TextDecoder().decode(clear);
  } catch { throw new Error("That master password isn't right"); }
}

/** A stored vault is only usable when it is well formed. */
export function asVault(v: unknown): Vault | undefined {
  const o = v as Vault | undefined;
  return o && o.v === 1 && typeof o.ct === "string" && typeof o.salt === "string" && typeof o.iv === "string" && typeof o.backup === "string" ? o : undefined;
}

/** Quick check shown while typing: long enough, and not just one repeated or sequential run. */
export function passwordProblem(p: string): string | undefined {
  if (p.length < MIN_PASSWORD) return `At least ${MIN_PASSWORD} characters. Four or more random words works well`;
  if (new Set(p.toLowerCase()).size < 5) return "Too repetitive. Use a longer, less predictable password";
  return undefined;
}

/**
 * Finds the recovery key in what a person pasted or picked: the key itself, or the text file Pager saved ("Pager recovery key", a blank line,
 * the key). Returns undefined when nothing in it is a valid key.
 */
export function findRecoveryKey(text: string, parse: (s: string) => unknown): string | undefined {
  const tries = [text, ...text.split(/\r?\n/)].map((s) => s.trim()).filter(Boolean);
  for (const t of tries) { try { parse(t); return t; } catch { /* not this one */ } }
  return undefined;
}
