// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Crypto, Transport, formatRecoveryKey, parseRecoveryKey } from "./crypto";

/** A tiny pretend homeserver: stores device keys, one-time keys and to-device messages, enough for two devices to talk. */
class FakeServer {
  deviceKeys: Record<string, Record<string, any>> = {};
  otks: Record<string, Record<string, Record<string, any>>> = {};
  fallback: Record<string, Record<string, Record<string, any>>> = {};
  inbox: Record<string, Record<string, any[]>> = {};
  tx(user: string, device: string): Transport {
    return async (method, path, body: any) => {
      if (path.endsWith("/keys/upload")) {
        if (body.device_keys) (this.deviceKeys[user] ??= {})[device] = body.device_keys;
        for (const [id, key] of Object.entries(body.one_time_keys ?? {})) ((this.otks[user] ??= {})[device] ??= {})[id] = key;
        for (const [id, key] of Object.entries(body.fallback_keys ?? {})) ((this.fallback[user] ??= {})[device] ??= {})[id] = key;
        return { one_time_key_counts: { signed_curve25519: Object.keys(this.otks[user]?.[device] ?? {}).length } };
      }
      if (path.endsWith("/keys/query")) {
        const out: Record<string, any> = {};
        for (const u of Object.keys(body.device_keys ?? {})) out[u] = this.deviceKeys[u] ?? {};
        return { device_keys: out, failures: {} };
      }
      if (path.endsWith("/keys/claim")) {
        const out: Record<string, any> = {};
        for (const [u, devs] of Object.entries<any>(body.one_time_keys)) for (const d of Object.keys(devs)) {
          const pool = this.otks[u]?.[d] ?? {}; const id = Object.keys(pool)[0];
          const pick = id ? { [id]: pool[id] } : this.fallback[u]?.[d];
          if (id) delete pool[id];
          if (pick) (out[u] ??= {})[d] = pick;
        }
        return { one_time_keys: out, failures: {} };
      }
      const td = /sendToDevice\/([^/]+)\//.exec(path);
      if (td) {
        const type = decodeURIComponent(td[1]);
        for (const [u, devs] of Object.entries<any>(body.messages)) for (const [d, content] of Object.entries(devs)) ((this.inbox[u] ??= {})[d] ??= []).push({ type, sender: user, content });
        return {};
      }
      return {};
    };
  }
  backup: { version?: string; auth?: any; keys: Record<string, any> } = { keys: {} };
  backupTx(base: Transport): Transport {
    return async (method, path, body: any) => {
      if (path.includes("/room_keys/version")) {
        if (method === "POST") { this.backup = { version: "1", auth: body.auth_data, keys: {} }; return { version: "1" }; }
        return this.backup.version ? { version: this.backup.version, auth_data: this.backup.auth, algorithm: "m.megolm_backup.v1.curve25519-aes-sha2" } : (() => { throw new Error("none"); })();
      }
      if (path.includes("/room_keys/keys")) {
        if (method === "PUT") { for (const [r, v] of Object.entries<any>(body.rooms)) for (const [s, d] of Object.entries<any>(v.sessions)) ((this.backup.keys[r] ??= { sessions: {} }).sessions)[s] = d; return { count: 1, etag: "x" }; }
        return { rooms: this.backup.keys };
      }
      return base(method, path, body);
    };
  }
  takeInbox(user: string, device: string) { const m = this.inbox[user]?.[device] ?? []; if (this.inbox[user]) this.inbox[user][device] = []; return m; }
}

describe("end-to-end encryption", () => {
  it("two devices exchange an encrypted message", async () => {
    const server = new FakeServer();
    const alice = await Crypto.create(server.tx("@alice:x", "A"), "@alice:x", "A");
    const bob = await Crypto.create(server.tx("@bob:x", "B"), "@bob:x", "B");
    await alice.receiveSync({ device_one_time_keys_count: { signed_curve25519: 0 } });
    await bob.receiveSync({ device_one_time_keys_count: { signed_curve25519: 0 } });

    const sent = await alice.encrypt("!room:x", "m.room.message", { msgtype: "m.text", body: "hello bob" }, ["@alice:x", "@bob:x"]);
    expect(sent.algorithm).toBe("m.megolm.v1.aes-sha2");
    expect(JSON.stringify(sent)).not.toContain("hello bob");

    await bob.receiveSync({ to_device: { events: server.takeInbox("@bob:x", "B") } });
    const clear = await bob.decrypt("!room:x", { type: "m.room.encrypted", event_id: "$1", sender: "@alice:x", origin_server_ts: 1, content: sent });
    expect(clear?.type).toBe("m.room.message");
    expect(clear?.content.body).toBe("hello bob");
    expect(clear?.event_id).toBe("$1");

    // and a message that arrives before its key cannot be read yet, then can
    const later = await alice.encrypt("!room:x", "m.room.message", { msgtype: "m.text", body: "second" }, ["@alice:x", "@bob:x"]);
    const ev = { type: "m.room.encrypted", event_id: "$2", sender: "@alice:x", origin_server_ts: 2, content: later };
    expect((await bob.decrypt("!room:x", ev))?.content.body).toBe("second"); // same megolm session: key already shared
    const stranger = await Crypto.create(server.tx("@carol:x", "C"), "@carol:x", "C");
    expect(await stranger.decrypt("!room:x", ev)).toBeUndefined();
    alice.close(); bob.close(); stranger.close();
  }, 30000);

  it("recovery key: a brand new device gets old messages back", async () => {
    const server = new FakeServer();
    const alice = await Crypto.create(server.tx("@alice:x", "A"), "@alice:x", "A");
    const bob1 = await Crypto.create(server.backupTx(server.tx("@bob:x", "B1")), "@bob:x", "B1");
    await alice.receiveSync({}); await bob1.receiveSync({});
    const sent = await alice.encrypt("!room:x", "m.room.message", { msgtype: "m.text", body: "from before" }, ["@alice:x", "@bob:x"]);
    await bob1.receiveSync({ to_device: { events: server.takeInbox("@bob:x", "B1") } });
    const ev = { type: "m.room.encrypted", event_id: "$1", sender: "@alice:x", origin_server_ts: 1, content: sent };
    expect((await bob1.decrypt("!room:x", ev))?.content.body).toBe("from before");

    const recovery = await bob1.createBackup();
    expect(recovery).toMatch(/^[1-9A-HJ-NP-Za-km-z ]+$/);
    await bob1.pump(); await bob1.pump();
    expect(Object.keys(server.backup.keys).length).toBe(1); // the key was saved, scrambled, on the server

    const bob2 = await Crypto.create(server.backupTx(server.tx("@bob:x", "B2")), "@bob:x", "B2");
    expect(await bob2.decrypt("!room:x", ev)).toBeUndefined(); // a new device cannot read it...
    await expect(bob2.restoreBackup(formatRecoveryKey(new Uint8Array(32)))).rejects.toThrow(/doesn't match/);
    expect(await bob2.restoreBackup(recovery)).toBe(1);
    expect((await bob2.decrypt("!room:x", ev))?.content.body).toBe("from before"); // ...until it has the recovery key
    alice.close(); bob1.close(); bob2.close();
  }, 30000);

  it("recovery key text round-trips and catches typos", () => {
    const key = Uint8Array.from({ length: 32 }, (_, i) => i * 7);
    const text = formatRecoveryKey(key);
    expect(parseRecoveryKey(text)).toEqual(key);
    expect(parseRecoveryKey(text.toLowerCase().length ? text.replace(/ /g, "") : text)).toEqual(key);
    expect(() => parseRecoveryKey(text.slice(0, -2) + "zz")).toThrow();
  });
});
