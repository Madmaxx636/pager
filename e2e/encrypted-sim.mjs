// A stand-in for an encrypted bridge, for the test bench: the other person is a real encrypting device (the app's own encryption code), so what alice's app receives is what it
// receives from an encrypted chat: scrambled messages, with the keys to read them delivered separately. Run through tsx (it reads the app's TypeScript):
//   node --import ../api/node_modules/tsx/dist/loader.mjs bench.mjs      (bench.mjs does this by itself when BENCH_ENCRYPTED=1)
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { DOMAIN, PORTS, register } from "./lib.mjs";
import { Crypto } from "../app/src/core/crypto.ts";
import { encryptAttachment } from "../app/src/core/mediacrypt.ts";
import { createEncryptedRoom } from "./lib.mjs";

const hs = `http://127.0.0.1:${PORTS.synapse}`, media = resolve(import.meta.dirname, ".state/media");
let n = 0;

export async function encryptedSim(name = "Secure Sam", other = "sam") {
  await register(other, `pw-${other}`, false, "Sam (encrypted)");
  const lg = await (await fetch(`${hs}/_matrix/client/v3/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "m.login.password", identifier: { type: "m.id.user", user: other }, password: `pw-${other}` }) })).json();
  const user = `@${other}:${DOMAIN}`, token = lg.access_token;
  const tx = async (method, path, body) => {
    const r = await fetch(`${hs}${path}`, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${JSON.stringify(j)}`); return j;
  };
  const crypto = await Crypto.create(tx, user, lg.device_id);
  await crypto.pump();
  const room = await createEncryptedRoom(other, "alice", name);
  const members = [user, `@alice:${DOMAIN}`], enc = encodeURIComponent;
  const sendEnc = async (type, content) => {
    const sealed = await crypto.encrypt(room, type, content, members);
    return (await tx("PUT", `/_matrix/client/v3/rooms/${enc(room)}/send/m.room.encrypted/e${Date.now()}x${n++}`, sealed)).event_id;
  };
  const upload = async (bytes, mime = "application/octet-stream") => (await (await fetch(`${hs}/_matrix/media/v3/upload`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": mime }, body: bytes })).json()).content_uri;
  const sealFile = async (path) => { const s = await encryptAttachment(new Blob([readFileSync(path)])); return { file: { url: await upload(s.data), ...s.file } }; };
  const sizes = [[640, 480], [480, 640], [800, 450], [320, 320], [1024, 768], [360, 640]];
  return {
    room, user,
    text: (body) => sendEnc("m.room.message", { msgtype: "m.text", body }),
    reply: (to, body) => sendEnc("m.room.message", { msgtype: "m.text", body, "m.relates_to": { "m.in_reply_to": { event_id: to } } }),
    image: async (i = 0, { size = true } = {}) => { const [w, h] = sizes[i]; return sendEnc("m.room.message", { msgtype: "m.image", body: `IMG_${i}.jpg`, ...(await sealFile(resolve(media, `img${i}.jpg`))), info: { mimetype: "image/jpeg", size: 30000, ...(size ? { w, h } : {}) } }); },
    voice: async (i = 1) => sendEnc("m.room.message", { msgtype: "m.audio", body: "Voice message", ...(await sealFile(resolve(media, `voice${i}.ogg`))), info: { mimetype: "audio/ogg", duration: 5000, size: 15000 }, "org.matrix.msc3245.voice": {}, "org.matrix.msc1767.audio": { duration: 5000, waveform: Array.from({ length: 48 }, (_, k) => (k * 37) % 1000) } }),
    react: (target, key = "👍") => sendEnc("m.reaction", { "m.relates_to": { rel_type: "m.annotation", event_id: target, key } }),
    edit: (target, body) => sendEnc("m.room.message", { msgtype: "m.text", body: `* ${body}`, "m.new_content": { msgtype: "m.text", body }, "m.relates_to": { rel_type: "m.replace", event_id: target } }),
    typing: (on) => tx("PUT", `/_matrix/client/v3/rooms/${enc(room)}/typing/${enc(user)}`, { typing: on, timeout: 20000 }),
    read: (eventId) => tx("POST", `/_matrix/client/v3/rooms/${enc(room)}/receipt/m.read/${enc(eventId)}`, {}),
    /** a new encryption key for the room (what a bridge does every so often): the next messages use a key the app has not got yet until it arrives */
    close: () => crypto.close(),
  };
}
