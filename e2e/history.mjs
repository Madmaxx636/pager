// Months of chat history for the test server, to see how the app copes with a real, long conversation: bursts of messages, long quiet gaps, several messages in
// the same minute, pictures, videos, voice messages, music, replies, edits and reactions. Everything is dated in the past (through an application service, the
// way a bridge does it) and written oldest first, so the server holds it the way a bridge's backfill would.
//   node e2e/stack.mjs up && node e2e/stack.mjs history        (about two minutes; needs ffmpeg)
// Writes e2e/.state/history.json: for each chat, every message in order, so a test can compare what the app shows with what the server holds.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DOMAIN, PORTS, register } from "./lib.mjs";

const here = import.meta.dirname, state = resolve(here, ".state"), media = resolve(state, "media");
const hs = `http://127.0.0.1:${PORTS.synapse}`, v3 = `${hs}/_matrix/client/v3`;
const AS = "e2e_as_token", id = (u) => `@${u}:${DOMAIN}`;
const DAY = 86_400_000;

// ---- a repeatable stream of "random" numbers, so every run builds the same history ----
let seedState = 20261108;
const rnd = () => { seedState = (seedState + 0x6d2b79f5) | 0; let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));

// ---- the media: real files made with ffmpeg (a few of each, used again and again) ----
function ff(...args) { execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" }); }
function makeMedia() {
  mkdirSync(media, { recursive: true });
  const f = (n) => resolve(media, n);
  const sizes = [[640, 480], [480, 640], [800, 450], [320, 320], [1024, 768], [360, 640]];
  sizes.forEach(([w, h], i) => { if (!existsSync(f(`img${i}.jpg`))) ff("-f", "lavfi", "-i", `testsrc2=size=${w}x${h}:rate=1:duration=1`, "-frames:v", "1", "-q:v", "6", f(`img${i}.jpg`)); });
  [[480, 270, 4], [270, 480, 3], [640, 360, 6]].forEach(([w, h, d], i) => { if (!existsSync(f(`vid${i}.mp4`))) ff("-f", "lavfi", "-i", `testsrc=size=${w}x${h}:rate=15:duration=${d}`, "-f", "lavfi", "-i", `sine=frequency=${300 + i * 150}:duration=${d}`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast", "-c:a", "aac", "-shortest", f(`vid${i}.mp4`)); });
  [2, 5, 9, 14, 31].forEach((d, i) => { if (!existsSync(f(`voice${i}.ogg`))) ff("-f", "lavfi", "-i", `sine=frequency=${220 + i * 90}:duration=${d}`, "-c:a", "libopus", "-b:a", "24k", f(`voice${i}.ogg`)); });
  [["Evening Drive", "The Night Owls", 22], ["Slow Mornings", "Kite & Co", 31], ["Paper Planes", "Juno Reed", 18], ["Long Way Home", "The Night Owls", 40]].forEach(([title, artist, d], i) => {
    if (!existsSync(f(`song${i}.mp3`))) ff("-f", "lavfi", "-i", `sine=frequency=${330 + i * 60}:duration=${d}`, "-metadata", `title=${title}`, "-metadata", `artist=${artist}`, "-c:a", "libmp3lame", "-b:a", "96k", f(`song${i}.mp3`));
  });
  return { sizes, vids: [[480, 270, 4], [270, 480, 3], [640, 360, 6]], voices: [2, 5, 9, 14, 31], songs: [["Evening Drive", 22], ["Slow Mornings", 31], ["Paper Planes", 18], ["Long Way Home", 40]], dir: media };
}

async function call(method, path, body, { token, user, ts, raw } = {}) {
  const q = new URLSearchParams(); if (user) q.set("user_id", id(user)); if (ts) q.set("ts", String(ts));
  const res = await fetch(`${raw ? hs : v3}${path}${q.size ? (path.includes("?") ? "&" : "?") + q : ""}`, { method, headers: { authorization: `Bearer ${token ?? AS}`, ...(body && !(body instanceof Uint8Array) ? { "content-type": "application/json" } : {}) }, body: body instanceof Uint8Array ? body : body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(json)}`);
  return json;
}
const login = async (u) => (await fetch(`${v3}/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "m.login.password", identifier: { type: "m.id.user", user: u }, password: `pw-${u}` }) }).then((r) => r.json())).access_token;
async function upload(file, mime, alice) {
  const bytes = new Uint8Array(readFileSync(file));
  const r = await fetch(`${hs}/_matrix/media/v3/upload?filename=${encodeURIComponent(file.split("/").pop())}`, { method: "POST", headers: { authorization: `Bearer ${alice}`, "content-type": mime }, body: bytes });
  return (await r.json()).content_uri;
}

// ---- words ----
const OPENERS = ["ok", "yeah", "lol", "haha", "wait", "so", "honestly", "btw", "omg", "right", "hmm", "fine", "sure", "anyway", "also", "thanks", "no way", "true", "same", "nice"];
const SENTENCES = ["are you still coming tonight", "I forgot my keys again", "the meeting moved to three", "can you send me that photo", "did you see the game", "running about ten minutes late", "let me check and get back to you", "that was the best pizza I've had in ages", "I'll call you after work", "do we need anything from the store", "she said it's fine either way", "the train was cancelled so I walked", "can't believe it's already Friday", "I put it on the table by the door", "remind me to pay the electric bill", "happy birthday!! hope it's a great one", "what time works for you", "I'm at the airport, heading home tomorrow", "we should plan something for the weekend", "is the wifi down for you too"];
const URLS = ["https://example.com/articles/2026/long-read?utm_source=chat&utm_medium=share", "https://maps.example.org/place/Central+Station", "www.example.net/photos/album-with-a-rather-long-name-and-no-spaces-at-all"];
const EMOJI = ["😂", "❤️", "👍", "🙏", "😭", "🔥", "🎉", "😅", "🤔", "👀"];
function text() {
  const r = rnd();
  if (r < 0.28) return pick(OPENERS) + (rnd() < 0.3 ? "!" : "");
  if (r < 0.55) return `${pick(OPENERS)} ${pick(SENTENCES)}`;
  if (r < 0.70) return `${pick(SENTENCES)}. ${pick(SENTENCES)}.`;
  if (r < 0.78) return Array.from({ length: between(2, 4) }, () => pick(SENTENCES)).join("\n");
  if (r < 0.85) return Array.from({ length: between(4, 9) }, () => pick(SENTENCES)).join(". ") + ".";
  if (r < 0.90) return `${pick(SENTENCES)} ${pick(URLS)}`;
  if (r < 0.95) return pick(EMOJI) + (rnd() < 0.4 ? pick(EMOJI) : "");
  return `${pick(SENTENCES)} ${"a".repeat(between(40, 120))}`;     // a long word nothing can break
}

/**
 * One chat's whole history: sessions of messages (a few seconds apart) with long gaps between, over [days] days, ending a minute ago.
 * Returns the events in order, each { sender, ts, kind, ... }.
 */
function plan({ days, people, perDay }) {
  const now = Date.now(), start = now - days * DAY, out = [];
  for (let d = 0; d < days; d++) {
    const dayStart = start + d * DAY, busy = rnd() < 0.12 ? 3 : rnd() < 0.2 ? 0 : 1;      // some days are very busy, some are silent
    const count = Math.round(perDay * busy * (0.3 + rnd() * 1.4));
    let left = count;
    while (left > 0) {
      const sessionAt = dayStart + between(7, 23) * 3_600_000 + between(0, 59) * 60_000, size = Math.min(left, between(3, 22));
      let t = sessionAt, who = pick(people);
      for (let i = 0; i < size; i++) {
        if (rnd() < 0.35) who = pick(people);
        t += between(2, 75) * 1000;
        out.push({ sender: who, ts: Math.min(t, now - 60_000 + out.length), ...kindOf() });
      }
      left -= size;
    }
  }
  out.sort((a, b) => a.ts - b.ts);
  // keep the last stretch dense and recent: the newest messages are the ones the app shows first
  let last = now - 90_000; for (let i = out.length - 1; i >= out.length - 25 && i >= 0; i--) { out[i].ts = last; last -= between(20, 90) * 1000; }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}
function kindOf() {
  const r = rnd();
  if (r < 0.70) return { kind: "text" };
  if (r < 0.80) return { kind: "image", n: between(0, 5), caption: rnd() < 0.3 };
  if (r < 0.83) return { kind: "video", n: between(0, 2), caption: rnd() < 0.3 };
  if (r < 0.90) return { kind: "voice", n: between(0, 4) };
  if (r < 0.93) return { kind: "music", n: between(0, 3) };
  if (r < 0.97) return { kind: "reply" };
  return { kind: "edit" };
}

export async function history({ scale = 1 } = {}) {
  mkdirSync(state, { recursive: true });
  const m = makeMedia();
  const alice = await login("alice");
  const mxc = {};
  for (let i = 0; i < m.sizes.length; i++) mxc[`img${i}`] = await upload(resolve(media, `img${i}.jpg`), "image/jpeg", alice);
  for (let i = 0; i < m.vids.length; i++) mxc[`vid${i}`] = await upload(resolve(media, `vid${i}.mp4`), "video/mp4", alice);
  for (let i = 0; i < m.voices.length; i++) mxc[`voice${i}`] = await upload(resolve(media, `voice${i}.ogg`), "audio/ogg", alice);
  for (let i = 0; i < m.songs.length; i++) mxc[`song${i}`] = await upload(resolve(media, `song${i}.mp3`), "audio/mpeg", alice);

  for (const [u, n] of [["bob", "Bob"], ["carol", "Carol"], ["taylor", "Taylor Brooks"], ["maya", "Maya (Family)"], ["leo", "Leo (Family)"]]) await register(u, `pw-${u}`, u === "alice", n);
  const tokens = { alice };
  for (const u of ["bob", "carol", "taylor", "maya", "leo"]) tokens[u] = await login(u);

  const chats = [
    { name: "Taylor Brooks", network: "signal", group: false, others: ["taylor"], days: 150, perDay: 24 },
    { name: "Family group", network: "whatsapp", group: true, others: ["maya", "leo", "carol"], days: 110, perDay: 22 },
    { name: "Work friends", network: "matrix", group: true, others: ["bob", "carol"], days: 60, perDay: 18 },
  ];
  const summary = [];
  for (const c of chats) {
    const people = ["alice", ...c.others];
    const bridge = c.network === "matrix" ? [] : [{ type: "uk.half-shot.bridge", state_key: `org.matrix.test://${c.network}/${c.name}`, content: { protocol: { id: c.network, displayname: c.network }, channel: { id: c.name, displayname: c.name }, "com.beeper.room_type": c.group ? "group" : "dm" } }];
    const { room_id } = await call("POST", "/createRoom", { name: c.name, is_direct: !c.group, preset: "private_chat", invite: c.others.map(id), initial_state: bridge }, { token: alice });
    for (const o of c.others) await call("POST", `/join/${encodeURIComponent(room_id)}`, {}, { token: tokens[o] });
    const events = plan({ days: Math.max(2, Math.round(c.days * scale)), people, perDay: c.perDay });
    const sent = [];                                         // { id, sender, ts, kind, body } in the order the server holds them
    let n = 0;
    for (const ev of events) {
      const content = bodyFor(ev, m, mxc, sent);
      const txn = `h${Date.now()}x${n++}`;
      const r = await call("PUT", `/rooms/${encodeURIComponent(room_id)}/send/${content.type ?? "m.room.message"}/${txn}`, content.body, { user: ev.sender, ts: ev.ts });
      if (content.visible) sent.push({ id: r.event_id, sender: ev.sender, ts: ev.ts, kind: ev.kind, body: content.body.body });
      if (content.react && rnd() < 0.5) await call("PUT", `/rooms/${encodeURIComponent(room_id)}/send/m.reaction/r${txn}`, { "m.relates_to": { rel_type: "m.annotation", event_id: r.event_id, key: pick(EMOJI) } }, { user: pick(people), ts: ev.ts + 5000 });
      if (n % 500 === 0) console.log(`  ${c.name}: ${n} / ${events.length}`);
    }
    // Alice has read up to about a third of the way from the end, so a good stretch is unread (the page opens at "unread" in the app).
    const readAt = sent[Math.max(0, sent.length - Math.round(sent.length * 0.04))];
    await call("POST", `/rooms/${encodeURIComponent(room_id)}/receipt/m.read/${encodeURIComponent(readAt.id)}`, {}, { token: alice });
    summary.push({ name: c.name, room: room_id, network: c.network, count: sent.length, first: sent[0].ts, last: sent.at(-1).ts, readAt: readAt.id, messages: sent });
    console.log(`${c.name}: ${sent.length} messages over ${Math.round((sent.at(-1).ts - sent[0].ts) / DAY)} days`);
  }
  writeFileSync(resolve(state, "history.json"), JSON.stringify(summary));
  console.log("history written: .state/history.json");
}

/** The Matrix message for a planned event. [sent] lets replies and edits point at something that exists. */
function bodyFor(ev, m, mxc, sent) {
  const file = (msgtype, body, key, info, extra = {}) => ({ visible: true, react: true, body: { msgtype, body, url: mxc[key], info, ...extra } });
  switch (ev.kind) {
    case "image": { const [w, h] = m.sizes[ev.n]; const c = file("m.image", ev.caption ? text() : `IMG_${ev.n}${between(1000, 9999)}.jpg`, `img${ev.n}`, { mimetype: "image/jpeg", w, h, size: 30000 }); if (ev.caption) c.body.filename = `IMG_${ev.n}.jpg`; return c; }
    case "video": { const [w, h, d] = m.vids[ev.n]; const c = file("m.video", ev.caption ? text() : `VID_${ev.n}${between(1000, 9999)}.mp4`, `vid${ev.n}`, { mimetype: "video/mp4", w, h, duration: d * 1000, size: 90000 }); if (ev.caption) c.body.filename = `VID_${ev.n}.mp4`; return c; }
    case "voice": { const d = m.voices[ev.n]; const wave = Array.from({ length: 48 }, () => between(0, 1000)); return file("m.audio", "Voice message", `voice${ev.n}`, { mimetype: "audio/ogg", duration: d * 1000, size: d * 3000 }, { "org.matrix.msc3245.voice": {}, "org.matrix.msc1767.audio": { duration: d * 1000, waveform: wave } }); }
    case "music": { const [title, d] = m.songs[ev.n]; return file("m.audio", `${title}.mp3`, `song${ev.n}`, { mimetype: "audio/mpeg", duration: d * 1000, size: d * 12000 }); }
    case "reply": { const t = sent.length ? sent[Math.max(0, sent.length - between(1, Math.min(12, sent.length)))] : undefined; const b = { msgtype: "m.text", body: text() }; if (t) b["m.relates_to"] = { "m.in_reply_to": { event_id: t.id } }; return { visible: true, react: true, body: b }; }
    case "edit": { const mine = [...sent].reverse().find((s) => s.sender === ev.sender && s.kind === "text"); if (!mine) return { visible: true, react: false, body: { msgtype: "m.text", body: text() } }; const nb = text(); return { visible: false, body: { msgtype: "m.text", body: `* ${nb}`, "m.new_content": { msgtype: "m.text", body: nb }, "m.relates_to": { rel_type: "m.replace", event_id: mine.id } } }; }
    default: return { visible: true, react: true, body: { msgtype: "m.text", body: text() } };
  }
}
