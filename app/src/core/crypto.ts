// End-to-end encryption (Matrix Olm/Megolm) for the web and desktop apps, using the matrix-sdk-crypto Rust library compiled to WebAssembly.
// This file is the glue: it feeds sync data in, sends the library's own requests (keys, to-device messages), decrypts incoming events
// and encrypts outgoing ones. It knows nothing about the rest of the app, so two instances can be tested against each other.
import * as sdk from "@matrix-org/matrix-sdk-crypto-wasm";

type J = Record<string, any>;
/** How to talk to the homeserver. The app passes its HTTP client; tests pass a fake server. */
export type Transport = (method: "GET" | "POST" | "PUT", path: string, body?: unknown) => Promise<any>;

const enc = encodeURIComponent;
let wasmReady: Promise<void> | undefined;
/** Loads the WebAssembly once. (Under Node, as in tests, it is already loaded.) */
export function loadCryptoLibrary() {
  wasmReady ??= (async () => {
    if (typeof (sdk as J).initAsync !== "function") return;
    // The desktop app is loaded from disk, where fetch() cannot read the file: its shell hands us the bytes instead.
    const bytes = typeof window !== "undefined" ? await window.pagerDesktop?.readCryptoWasm?.() : undefined;
    if (bytes) {
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/wasm" }));
      try { await (sdk as J).initAsync(url); } finally { URL.revokeObjectURL(url); }
    } else await (sdk as J).initAsync();
  })();
  return wasmReady;
}

export const isEncryptedType = (t: unknown) => t === "m.room.encrypted";

export class Crypto {
  private constructor(readonly machine: sdk.OlmMachine, private tx: Transport, readonly userId: string, readonly deviceId: string) {}
  /** Called when a key arrives that may unlock messages we could not read before. */
  onKeys?: (roomIds: string[]) => void;

  /** Starts (or resumes) this device's encryption keys. With a store name the keys persist in the browser's IndexedDB. */
  static async create(tx: Transport, userId: string, deviceId: string, storeName?: string): Promise<Crypto> {
    await loadCryptoLibrary();
    const machine = await sdk.OlmMachine.initialize(new sdk.UserId(userId), new sdk.DeviceId(deviceId), storeName);
    const c = new Crypto(machine, tx, userId, deviceId);
    machine.registerRoomKeyUpdatedCallback(async (infos) => c.onKeys?.([...new Set(infos.map((i) => i.roomId.toString()))]));
    return c;
  }

  // ---- Requests the library wants sent ---------------------------------------------------------------------------------

  /** Sends everything the library has queued (key uploads, device queries, key sharing) and reports the answers back. */
  async pump(): Promise<void> {
    if (this.closed) return;
    for (let round = 0; round < 5; round++) {
      const requests = await this.machine.outgoingRequests();
      if (!requests.length) break;
      for (const r of requests) await this.send(r);
    }
    // Keys waiting to be saved to the recovery backup are fetched separately.
    if (await this.machine.isBackupEnabled()) {
      for (let i = 0; i < 20; i++) { const r = await this.machine.backupRoomKeys(); if (!r) break; await this.send(r); }
    }
  }

  private async send(r: any): Promise<void> {
    if (this.closed) return;
    let res: unknown;
    try {
      switch (r.type) {
        case sdk.RequestType.KeysUpload: res = await this.tx("POST", "/_matrix/client/v3/keys/upload", JSON.parse(r.body)); break;
        case sdk.RequestType.KeysQuery: res = await this.tx("POST", "/_matrix/client/v3/keys/query", JSON.parse(r.body)); break;
        case sdk.RequestType.KeysClaim: res = await this.tx("POST", "/_matrix/client/v3/keys/claim", JSON.parse(r.body)); break;
        case sdk.RequestType.ToDevice: res = await this.tx("PUT", `/_matrix/client/v3/sendToDevice/${enc(r.event_type)}/${enc(r.txn_id)}`, JSON.parse(r.body)); break;
        case sdk.RequestType.SignatureUpload: res = await this.tx("POST", "/_matrix/client/v3/keys/signatures/upload", JSON.parse(r.body)); break;
        case sdk.RequestType.KeysBackup: res = await this.tx("PUT", `/_matrix/client/v3/room_keys/keys?version=${enc(r.version)}`, JSON.parse(r.body)); break;
        case sdk.RequestType.RoomMessage: res = await this.tx("PUT", `/_matrix/client/v3/rooms/${enc(r.room_id)}/send/${enc(r.event_type)}/${enc(r.txn_id)}`, JSON.parse(r.content ?? r.body)); break;
        default: return; // cross-signing upload needs interactive sign-in; not used yet
      }
    } catch { return; /* the library will offer the request again */ }
    try { await this.machine.markRequestAsSent(r.id, r.type, JSON.stringify(res ?? {})); } catch { /* closed while the request was in flight */ }
  }

  // ---- Sync ------------------------------------------------------------------------------------------------------------

  /** Hands the encryption parts of a /sync response to the library. Call before decrypting that response's events. */
  async receiveSync(sync: J): Promise<void> {
    const toDevice = JSON.stringify(sync.to_device?.events ?? []);
    const lists = new sdk.DeviceLists((sync.device_lists?.changed ?? []).map((u: string) => new sdk.UserId(u)), (sync.device_lists?.left ?? []).map((u: string) => new sdk.UserId(u)));
    const counts = new Map<string, number>(Object.entries(sync.device_one_time_keys_count ?? {}) as [string, number][]);
    const fallback = new Set<string>((sync.device_unused_fallback_key_types ?? sync["org.matrix.msc2732.device_unused_fallback_key_types"] ?? []) as string[]);
    await this.machine.receiveSyncChanges(toDevice, lists, counts, fallback, new sdk.DecryptionSettings(sdk.TrustRequirement.Untrusted));
    await this.pump();
  }

  // ---- Reading ---------------------------------------------------------------------------------------------------------

  /** Decrypts one m.room.encrypted event. Returns the readable event, or undefined if we do not have the key (yet). */
  async decrypt(roomId: string, event: J): Promise<J | undefined> {
    if (!isEncryptedType(event.type)) return event;
    try {
      const r = await this.machine.decryptRoomEvent(JSON.stringify(event), new sdk.RoomId(roomId), new sdk.DecryptionSettings(sdk.TrustRequirement.Untrusted));
      const clear = JSON.parse(r.event);
      // Keep the envelope (id, sender, time, relations) and take what was hidden: the real type and content.
      return { ...event, type: clear.type, content: clear.content, pagerEncrypted: true };
    } catch { return undefined; }
  }

  // ---- Writing ---------------------------------------------------------------------------------------------------------

  /** Encrypts an event for a room. `members` is everyone in the room, so their devices all get the key. */
  async encrypt(roomId: string, type: string, content: J, members: string[]): Promise<J> {
    // The library takes ownership of the id objects it is given, so each call gets fresh ones.
    const users = () => members.map((u) => new sdk.UserId(u));
    await this.machine.updateTrackedUsers(users());
    await this.pump(); // learn their devices
    const claim = await this.machine.getMissingSessions(users());
    if (claim) await this.send(claim);
    const settings = new sdk.EncryptionSettings();
    settings.sharingStrategy = sdk.CollectStrategy.allDevices(); // the bridges' devices are not cross-signed, and they are the ones we write to
    const shares = await this.machine.shareRoomKey(new sdk.RoomId(roomId), users(), settings);
    for (const s of shares) await this.send(s);
    const encrypted = await this.machine.encryptRoomEvent(new sdk.RoomId(roomId), type, JSON.stringify(content));
    void this.pump().catch(() => {});
    return JSON.parse(encrypted);
  }

  // ---- Recovery key (online key backup) ----------------------------------------------------------------------------------
  // Your message keys are copied, themselves encrypted, to your server. Only the recovery key can open that copy, so a new device
  // (or a reinstall) with the recovery key gets its history back, and the server learns nothing.

  async backupVersion(): Promise<{ version: string; publicKey: string } | undefined> {
    try {
      const v = await this.tx("GET", "/_matrix/client/v3/room_keys/version");
      return v?.version ? { version: String(v.version), publicKey: v.auth_data?.public_key } : undefined;
    } catch { return undefined; }
  }

  /** True when this device is saving its keys to the backup. */
  async backupOn(): Promise<boolean> { return this.machine.isBackupEnabled(); }

  /** Starts a new backup and returns the recovery key to show the person once. */
  async createBackup(): Promise<string> {
    const key = sdk.BackupDecryptionKey.createRandomKey();
    const publicKey = key.megolmV1PublicKey.publicKeyBase64;
    const authData: J = { public_key: publicKey };
    const signed = JSON.parse((await this.machine.sign(canonicalJson(authData))).asJSON());
    const created = await this.tx("POST", "/_matrix/client/v3/room_keys/version", { algorithm: "m.megolm_backup.v1.curve25519-aes-sha2", auth_data: { ...authData, signatures: signed } });
    const version = String(created.version);
    // A new backup starts empty: turn the old one off so every key this device has is saved again under the new key.
    await this.machine.disableBackup();
    await this.machine.saveBackupDecryptionKey(key, version);
    await this.machine.enableBackupV1(publicKey, version);
    void this.pump().catch(() => {});
    return formatRecoveryKey(base64ToBytes(key.toBase64()));
  }

  /** Reads the backup with a recovery key, imports every key into this device, and keeps saving to that backup. */
  async restoreBackup(recoveryKey: string, onProgress?: (done: number, total: number) => void): Promise<number> {
    const raw = parseRecoveryKey(recoveryKey);
    const key = sdk.BackupDecryptionKey.fromBase64(bytesToBase64(raw));
    const info = await this.backupVersion();
    if (!info) throw new Error("There is no backup to restore from");
    if (info.publicKey !== key.megolmV1PublicKey.publicKeyBase64) throw new Error("That recovery key doesn't match this account's backup");
    const data = await this.tx("GET", `/_matrix/client/v3/room_keys/keys?version=${enc(info.version)}`);
    const rooms = new Map<sdk.RoomId, Map<string, any>>();
    let total = 0;
    for (const [roomId, room] of Object.entries<any>(data.rooms ?? {})) {
      const sessions = new Map<string, any>();
      for (const [sessionId, s] of Object.entries<any>(room.sessions ?? {})) {
        try {
          const sd = s.session_data;
          const clear = JSON.parse(key.decryptV1(sd.ephemeral, sd.mac, sd.ciphertext));
          sessions.set(sessionId, clear); total++;
        } catch { /* a key made by something else; skip it */ }
      }
      if (sessions.size) rooms.set(new sdk.RoomId(roomId), sessions);
    }
    await this.machine.importBackedUpRoomKeys(rooms, (done: bigint, all: bigint) => onProgress?.(Number(done), Number(all)), info.version);
    await this.machine.saveBackupDecryptionKey(sdk.BackupDecryptionKey.fromBase64(bytesToBase64(raw)), info.version);
    await this.machine.enableBackupV1(info.publicKey, info.version);
    void this.pump().catch(() => {});
    return total;
  }

  // ---- Key file (a second way back in) ----------------------------------------------------------------------------------
  // Every message key this device has, scrambled with a passphrase you choose, as text you can store anywhere. If the recovery key is
  // ever lost, this file and its passphrase read your history; and it works without the server.

  async exportKeys(passphrase: string): Promise<string> {
    const keys = await this.machine.exportRoomKeys(() => true);
    return sdk.OlmMachine.encryptExportedRoomKeys(keys, passphrase, 200_000);
  }

  /** Reads a key file made by exportKeys (or by Element). Returns how many keys were new to this device. */
  async importKeys(text: string, passphrase: string): Promise<number> {
    let json: string;
    try { json = sdk.OlmMachine.decryptExportedRoomKeys(text.trim(), passphrase); }
    catch { throw new Error("That passphrase doesn't open this file, or the file is damaged"); }
    const r = await this.machine.importExportedRoomKeys(json, () => {});
    void this.pump().catch(() => {}); // new keys also go into the backup
    return Number(r.importedCount);
  }

  private closed = false;
  close() { this.closed = true; try { this.machine.close(); } catch { /* already closed */ } }
}

// ---- Recovery key text --------------------------------------------------------------------------------------------------
// The standard Matrix format: 0x8B 0x01, the 32-byte key, one parity byte, written in base58 in groups of four.
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const bytesToBase64 = (b: Uint8Array) => { let s = ""; for (const x of b) s += String.fromCharCode(x); return btoa(s); };
const base64ToBytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function formatRecoveryKey(key: Uint8Array): string {
  const buf = new Uint8Array(35); buf.set([0x8b, 0x01]); buf.set(key, 2);
  buf[34] = buf.slice(0, 34).reduce((p, c) => p ^ c, 0);
  let n = 0n; for (const b of buf) n = (n << 8n) | BigInt(b);
  let out = ""; while (n > 0n) { out = ALPHABET[Number(n % 58n)] + out; n /= 58n; }
  for (const b of buf) { if (b === 0) out = ALPHABET[0] + out; else break; }
  return out.replace(/(.{4})/g, "$1 ").trim();
}

export function parseRecoveryKey(text: string): Uint8Array {
  const s = text.replace(/\s+/g, "");
  let n = 0n;
  for (const ch of s) { const i = ALPHABET.indexOf(ch); if (i < 0) throw new Error("That isn't a recovery key"); n = n * 58n + BigInt(i); }
  const bytes: number[] = []; while (n > 0n) { bytes.unshift(Number(n & 255n)); n >>= 8n; }
  for (const ch of s) { if (ch === ALPHABET[0]) bytes.unshift(0); else break; }
  const buf = Uint8Array.from(bytes);
  if (buf.length !== 35 || buf[0] !== 0x8b || buf[1] !== 0x01 || buf.slice(0, 34).reduce((p, c) => p ^ c, 0) !== buf[34]) throw new Error("That recovery key has a typo or is incomplete");
  return buf.slice(2, 34);
}

/** JSON with sorted keys and no spaces, the form Matrix signs. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as J).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson((v as J)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
