// Encrypted attachments (Matrix "EncryptedFile"): AES-256-CTR with a random key, and a SHA-256 of the encrypted bytes.
// The key travels inside the (encrypted) message; the server only ever stores the scrambled file.

export interface EncFile { url: string; key: { kty: "oct"; key_ops: string[]; alg: "A256CTR"; k: string; ext: true }; iv: string; hashes: { sha256: string }; v: "v2" }

const b64 = (b: ArrayBuffer | Uint8Array) => { const u = new Uint8Array(b); let s = ""; for (const x of u) s += String.fromCharCode(x); return btoa(s); };
const unb64 = (s: string) => { const t = s.replace(/-/g, "+").replace(/_/g, "/"); const bin = atob(t + "=".repeat((4 - (t.length % 4)) % 4)); return Uint8Array.from(bin, (c) => c.charCodeAt(0)); };
const unpadded = (s: string) => s.replace(/=+$/, "");
const b64url = (b: Uint8Array) => unpadded(b64(b)).replace(/\+/g, "-").replace(/\//g, "_");

/** Scrambles a file for sending. Upload `data`; put `file` (with the real mxc url) in the message. */
export async function encryptAttachment(blob: Blob): Promise<{ data: Blob; file: Omit<EncFile, "url"> }> {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const iv = new Uint8Array(16); iv.set(crypto.getRandomValues(new Uint8Array(8))); // the counter half stays zero
  const k = await crypto.subtle.importKey("raw", key, "AES-CTR", false, ["encrypt"]);
  const cipher = await crypto.subtle.encrypt({ name: "AES-CTR", counter: iv, length: 64 }, k, await blob.arrayBuffer());
  const hash = await crypto.subtle.digest("SHA-256", cipher);
  return {
    data: new Blob([cipher], { type: "application/octet-stream" }),
    file: { key: { kty: "oct", key_ops: ["encrypt", "decrypt"], alg: "A256CTR", k: b64url(key), ext: true }, iv: unpadded(b64(iv)), hashes: { sha256: unpadded(b64(hash)) }, v: "v2" },
  };
}

/** Unscrambles a downloaded file. Throws if it was tampered with. */
export async function decryptAttachment(cipher: ArrayBuffer, file: Pick<EncFile, "key" | "iv" | "hashes">): Promise<ArrayBuffer> {
  const hash = unpadded(b64(await crypto.subtle.digest("SHA-256", cipher)));
  if (hash !== unpadded(file.hashes.sha256)) throw new Error("This file does not match its checksum");
  const k = await crypto.subtle.importKey("raw", unb64(file.key.k), "AES-CTR", false, ["decrypt"]);
  return crypto.subtle.decrypt({ name: "AES-CTR", counter: unb64(file.iv), length: 64 }, k, cipher);
}

// Messages that carry encrypted files register them here by mxc url, so any place that shows media (pictures, audio, downloads)
// goes through one place that knows to decrypt.
const known = new Map<string, EncFile & { mime?: string }>();
export const registerEncrypted = (f: EncFile, mime?: string) => { if (f?.url) known.set(f.url, { ...f, mime }); };
export const encryptedInfo = (mxc: string) => known.get(mxc);

/** After a restart, saved messages still carry their file keys: teach the registry about them again. */
export function registerAllEncrypted(chats: Record<string, { messages: { enc?: EncFile; mime?: string }[] }>) {
  for (const c of Object.values(chats)) for (const m of c.messages) if (m.enc) registerEncrypted(m.enc, m.mime);
}
