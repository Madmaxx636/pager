// Fake Pager backend (Matrix + Pager API) for UI development without Docker.
//   node dev/mock-server.mjs   then   PAGER_SERVER=http://localhost:8008 npm run dev
// Any username/password is accepted. Listens on all interfaces so a phone on the same Wi-Fi can connect.
import { createServer } from "node:http";
import { deflateSync } from "node:zlib";

const ME = "@demo:pager.test";
const NOW = Date.now();
const MIN = 60000;

// --- tiny PNG generator (gradient) so image messages have real bytes -------------
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
function png(w, h, hue) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = (hue + (x * 120) / w) % 256; raw[o + 1] = (80 + (y * 150) / h) % 256; raw[o + 2] = (200 - (x * 100) / w) % 256;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

let n = 0;
const ev = (type, sender, content, extra = {}) => ({ type, sender, content, event_id: `$e${++n}`, origin_server_ts: NOW, ...extra });
const msg = (id, who, minsAgo, body, more = {}) => ({ type: "m.room.message", event_id: id, sender: who, origin_server_ts: NOW - minsAgo * MIN, content: { msgtype: "m.text", body, ...more } });
const state = (type, sender, content, key = "") => ({ type, sender, content, state_key: key, event_id: `$s${++n}`, origin_server_ts: NOW - 9999 * MIN });

const people = {
  "!a:pager.test": { name: "Mom", net: "whatsapp", who: "@wa_mom:pager.test" },
  "!b:pager.test": { name: "Design Team", net: "discord", who: "@dc_team:pager.test" },
  "!c:pager.test": { name: "Alex Rivera", net: "signal", who: "@sg_alex:pager.test" },
  "!d:pager.test": { name: "Bridge bot", net: "whatsapp", who: "@whatsappbot:pager.test" },
  "!e:pager.test": { name: "Sam (SMS)", net: "gmessages", who: "@gm_sam:pager.test" },
  "!f:pager.test": { name: "Product News", net: "discord", who: "@dc_news:pager.test" },
  "!g:pager.test": { name: "Priya", net: "whatsapp", who: "@wa_priya:pager.test" },
};
const roomState = (id) => {
  const p = people[id];
  return [
    state("m.room.member", ME, { membership: "join", displayname: "Demo" }, ME),
    state("m.room.member", p.who, { membership: "join", displayname: p.name }, p.who),
    ...(id === "!b:pager.test" ? [state("m.room.member", "@dc_priya:pager.test", { membership: "join", displayname: "Priya" }, "@dc_priya:pager.test")] : []),
    state("m.room.name", p.who, { name: p.name }),
    state("m.bridge", p.who, { protocol: { id: p.net } }, `bridge-${p.net}`),
  ];
};

const timelines = {
  "!a:pager.test": [
    msg("$a1", "@wa_mom:pager.test", 180, "Are you coming Sunday?"),
    msg("$a2", ME, 175, "Yes! What should I bring?"),
    msg("$a3", "@wa_mom:pager.test", 170, "Just yourself 😊"),
    { ...msg("$a4", "@wa_mom:pager.test", 60, "Here's the recipe", { msgtype: "m.image", body: "recipe.png", url: "mxc://pager.test/img1", info: { mimetype: "image/png", w: 640, h: 420, size: 48211 } }) },
    msg("$a5", ME, 55, "Looks delicious!", { "m.relates_to": { "m.in_reply_to": { event_id: "$a4" } } }),
    { type: "m.reaction", event_id: "$ar1", sender: "@wa_mom:pager.test", origin_server_ts: NOW - 54 * MIN, content: { "m.relates_to": { rel_type: "m.annotation", event_id: "$a5", key: "❤️" } } },
    { type: "m.reaction", event_id: "$ar2", sender: ME, origin_server_ts: NOW - 53 * MIN, content: { "m.relates_to": { rel_type: "m.annotation", event_id: "$a4", key: "😍" } } },
    msg("$a6", "@wa_mom:pager.test", 5, "See you at 5, bring the good wine 🍷"),
  ],
  "!b:pager.test": [
    msg("$b1", "@dc_team:pager.test", 1500, "Standup notes are in the doc"),
    msg("$b2", "@dc_priya:pager.test", 1490, "Thanks, will read"),
    msg("$b3", "@dc_team:pager.test", 90, "Shipping the new build tonight"),
    msg("$b4", ME, 80, "Nice, I'll test in the morning"),
    { ...msg("$b5", "@dc_priya:pager.test", 20, "spec-v3.pdf", { msgtype: "m.file", url: "mxc://pager.test/file1", info: { mimetype: "application/pdf", size: 523000 } }) },
  ],
  "!c:pager.test": [msg("$c1", "@sg_alex:pager.test", 30, "Dinner on Friday?"), msg("$c2", "@sg_alex:pager.test", 29, "I found a great Thai place")],
  "!d:pager.test": [msg("$d1", "@whatsappbot:pager.test", 5000, "Login successful")],
  "!f:pager.test": [msg("$f1", "@dc_news:pager.test", 600, "v2.4 is out: new inbox filters and sticker packs 🎉")],
  "!g:pager.test": [
    msg("$g1", "@wa_priya:pager.test", 45, "Are we still on for lunch?"),
    msg("$g2", ME, 44, "Yes! Same place?"),
    { type: "m.sticker", event_id: "$g3", sender: "@wa_priya:pager.test", origin_server_ts: NOW - 40 * MIN, content: { body: "thumbs up", url: "mxc://pager.test/stk1", info: { w: 200, h: 200, mimetype: "image/png" } } },
    { ...msg("$g4", "@wa_priya:pager.test", 38, "Priya Patel.vcf", { msgtype: "m.file", url: "mxc://pager.test/vcf1", info: { mimetype: "text/vcard", size: 140 } }) },
    msg("$g5", "@wa_priya:pager.test", 20, "**Heads up:** the reservation is at *12:30*. Menu: https://example.com", { format: "org.matrix.html", formatted_body: "<b>Heads up:</b> the reservation is at <i>12:30</i>. Menu: <a href=\"https://example.com\">example.com</a>" }),
    { type: "org.matrix.msc3381.poll.start", event_id: "$gp", sender: "@wa_priya:pager.test", origin_server_ts: NOW - 15 * MIN, content: { "org.matrix.msc3381.poll.start": { kind: "org.matrix.msc3381.poll.disclosed", max_selections: 1, question: { "org.matrix.msc1767.text": "Where should we eat?" }, answers: [{ id: "a1", "org.matrix.msc1767.text": "Thai place" }, { id: "a2", "org.matrix.msc1767.text": "Pizza" }, { id: "a3", "org.matrix.msc1767.text": "Sushi" }] } } },
    { type: "org.matrix.msc3381.poll.response", event_id: "$gv1", sender: "@wa_priya:pager.test", origin_server_ts: NOW - 14 * MIN, content: { "m.relates_to": { rel_type: "m.reference", event_id: "$gp" }, "org.matrix.msc3381.poll.response": { answers: ["a1"] } } },
    msg("$g6", "@wa_priya:pager.test", 10, "😂😂"),
  ],
  "!e:pager.test": [
    msg("$e1x", ME, 2900, "Running late"),
    { ...msg("$e2x", "@gm_sam:pager.test", 2880, "Voice note", { msgtype: "m.audio", url: "mxc://pager.test/aud1", info: { mimetype: "audio/ogg", duration: 14000 } }) },
  ],
};
const unread = { "!a:pager.test": 1, "!b:pager.test": 0, "!c:pager.test": 2, "!e:pager.test": 0, "!f:pager.test": 1, "!g:pager.test": 3 };
const tags = {
  "!b:pager.test": { "m.favourite": { order: 1 } },
  "!a:pager.test": { "m.favourite": { order: 2 }, "u.label.Family": {} },
  "!g:pager.test": { "u.label.Friends": {} },
  "!f:pager.test": { "m.lowpriority": {} },
  "!e:pager.test": { "u.archived": {} },
};
const receipts = { "!a:pager.test": { $a5: { "m.read": { "@wa_mom:pager.test": { ts: NOW } } } } };

const joinBlock = () => Object.fromEntries(Object.keys(people).map((id) => [id, {
  state: { events: roomState(id) },
  timeline: { limited: false, prev_batch: "older-0", events: timelines[id] },
  unread_notifications: { notification_count: unread[id] ?? 0 },
  ephemeral: { events: [{ type: "m.receipt", content: receipts[id] ?? {} }, ...(id === "!c:pager.test" ? [{ type: "m.typing", content: { user_ids: ["@sg_alex:pager.test"] } }] : [])] },
  account_data: { events: tags[id] ? [{ type: "m.tag", content: { tags: tags[id] } }] : [] },
  summary: { "m.joined_member_count": 2, "m.invited_member_count": 0 },
}]));

// Three pages of older history for Mom's chat.
const older = (page) => Array.from({ length: 20 }, (_, i) => {
  const k = page * 20 + i;
  return msg(`$old${k}`, k % 3 === 0 ? ME : "@wa_mom:pager.test", 200 + k * 30, `Older message #${k + 1}`);
});

let connected = [{ id: "15551234567", name: "+1 555 123 4567", state_event: "CONNECTED" }];
const json = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = decodeURIComponent(url.pathname);
  // Permissive CORS, like a real Synapse, so the desktop app (a local page) can call it.
  res.setHeader("access-control-allow-origin", "*"); res.setHeader("access-control-allow-headers", "authorization, content-type"); res.setHeader("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  let body = "";
  for await (const c of req) body += c;
  if (!p.startsWith("/_matrix/client/v1/media")) console.log(req.method, p, body.slice(0, 120));

  if (p === "/api/config") return json(res, 200, { domain: "pager.test", signup: "invite", inviteRequired: true, bridges: [] });
  if (p === "/api/signup") return json(res, 201, { user_id: ME });
  if (p === "/api/bridges") return json(res, 200, { networks: [
    { id: "whatsapp", name: "WhatsApp", logins: connected },
    { id: "signal", name: "Signal", logins: [{ id: "sig1", name: "+1 555 000 1111", state_event: "BAD_CREDENTIALS" }] },
    { id: "discord", name: "Discord", logins: [] },
  ] });
  if (p.endsWith("/login/flows")) return json(res, 200, { flows: [{ id: "qr", name: "QR code" }] });
  if (p.includes("/login/start/")) return json(res, 200, { login_id: "L1", step_id: "qr", type: "display_and_wait",
    instructions: "Open WhatsApp on your phone → Linked devices → Link a device, then scan this code.",
    display_and_wait: { type: "qr", data: "2@mock-qr-data-" + Date.now() } });
  if (p.includes("/login/step/")) {
    await new Promise((r) => setTimeout(r, 4000));
    connected = [{ id: "15551234567", name: "+1 555 123 4567", state_event: "CONNECTED" }, { id: "15559998888", name: "+1 555 999 8888", state_event: "CONNECTED" }];
    return json(res, 200, { login_id: "L1", step_id: "done", type: "complete", complete: { user_login_id: "15559998888" } });
  }
  if (p.endsWith("/contacts")) return json(res, 200, { contacts: [
    { id: "alex", name: "Alex Rivera", identifiers: ["tel:+15550001111"] }, { id: "mom", name: "Mom", identifiers: ["tel:+15550002222"] },
    { id: "jordan", name: "Jordan Lee", identifiers: ["tel:+15550003333"] }, { id: "sam", name: "Sam Okafor", identifiers: ["tel:+15550004444"] } ] });
  if (p.endsWith("/search_users")) { const q = (JSON.parse(body || "{}").query ?? "").toLowerCase(); return json(res, 200, { results: [
    { id: "jordan", name: "Jordan Lee", identifiers: ["tel:+15550003333"] }, { id: "jo", name: "Joanna Park", identifiers: ["tel:+15550005555"] } ].filter((c) => c.name.toLowerCase().includes(q)) }); }
  if (p.includes("/create_dm/")) return json(res, 200, { id: "x", dm_room_mxid: "!a:pager.test" });

  if (p.startsWith("/_matrix/client/v1/media/") && p.endsWith("/vcf1")) { res.writeHead(200, { "content-type": "text/vcard" }); return res.end("BEGIN:VCARD\nVERSION:3.0\nFN:Priya Patel\nTEL;TYPE=CELL:+1 555 010 4242\nEND:VCARD\n"); }
  if (p.startsWith("/_matrix/client/v1/media/")) {
    const thumb = p.includes("/thumbnail/");
    const id = p.split("/").pop();
    const hue = [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 200;
    res.writeHead(200, { "content-type": "image/png" });
    return res.end(thumb ? png(320, 210, hue) : png(1280, 840, hue));
  }
  if (p === "/_matrix/media/v3/upload") return json(res, 200, { content_uri: "mxc://pager.test/uploaded" });
  if (p === "/_matrix/client/versions") return json(res, 200, { versions: ["v1.1", "v1.5", "v1.11"], unstable_features: {} });
  if (p === "/_matrix/client/v3/login") return json(res, 200, { access_token: "tok", user_id: ME, device_id: "DEV" });
  if (p === "/_matrix/client/v3/sync") {
    const first = !url.searchParams.get("since");
    if (!first) await new Promise((r) => setTimeout(r, 8000));
    return json(res, 200, { next_batch: "s1", rooms: first ? { join: joinBlock() } : {}, account_data: { events: first ? [
      { type: "m.push_rules", content: { global: { override: [] } } },
      { type: "im.ponies.user_emotes", content: { pack: { display_name: "My stickers" }, images: { thumbs: { url: "mxc://pager.test/stk1", body: "thumbs up", usage: ["sticker"], info: { w: 200, h: 200, mimetype: "image/png" } }, party: { url: "mxc://pager.test/stk2", body: "party", usage: ["sticker"], info: { w: 200, h: 200, mimetype: "image/png" } }, heart: { url: "mxc://pager.test/stk3", body: "heart", usage: ["sticker"], info: { w: 200, h: 200, mimetype: "image/png" } } } } },
    ] : [] } });
  }
  if (p.endsWith("/messages")) {
    const from = url.searchParams.get("from") ?? "older-0";
    const page = Number(from.split("-")[1] ?? 0);
    return json(res, 200, { chunk: older(page).reverse(), start: from, ...(page < 2 ? { end: `older-${page + 1}` } : {}) });
  }
  if (p.endsWith("/search")) { const t = (JSON.parse(body || "{}").search_categories?.room_events?.search_term ?? "").toLowerCase(); const all = Object.entries(timelines).flatMap(([room, evs]) => evs.filter((e) => e.type === "m.room.message" && e.content.body?.toLowerCase().includes(t)).map((e) => ({ rank: 1, result: { ...e, room_id: room } })));
    return json(res, 200, { search_categories: { room_events: { results: all, count: all.length } } }); }
  if (p.endsWith("/preview_url")) return json(res, 200, { "og:title": "Example Domain", "og:description": "This domain is for use in illustrative examples in documents.", "og:site_name": "example.com", "og:image": "mxc://pager.test/img9" });
  if (p.endsWith("/joined_members")) return json(res, 200, { joined: { [ME]: { display_name: "Demo" }, "@wa_mom:pager.test": { display_name: "Mom" } } });
  if (p.includes("/send/")) return json(res, 200, url.searchParams.get("org.matrix.msc4140.delay") ? { delay_id: "d" + Date.now() } : { event_id: "$sent" + Date.now() });
  json(res, 200, {});
}).listen(8008, () => console.log("Mock Pager backend on http://localhost:8008"));
