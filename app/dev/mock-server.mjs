// Fake Pager backend (Matrix + Pager API) for UI development without Docker.
//   node dev/mock-server.mjs   then   PAGER_SERVER=http://localhost:8008 npm run dev
import { createServer } from "node:http";

const ME = "@demo:pager.test";
const ts = Date.now();
const ev = (type, sender, content, state_key, n = 0) => ({
  type, sender, content, event_id: `$${type}${sender}${n}${Math.random().toString(36).slice(2)}`,
  origin_server_ts: ts - n * 60000, ...(state_key !== undefined ? { state_key } : {}),
});
const room = (id, name, proto, other, msgs, unread = 0) => ({
  state: { events: [
    ev("m.room.create", other, { room_version: "10" }, ""),
    ev("m.room.member", ME, { membership: "join", displayname: "Demo" }, ME),
    ev("m.room.member", other, { membership: "join", displayname: name }, other),
    ev("m.room.name", other, { name }, ""),
    ev("m.bridge", other, { protocol: { id: proto } }, `bridge-${proto}`),
  ] },
  timeline: { limited: false, prev_batch: "p0", events: msgs.map(([who, body], i) =>
    ev("m.room.message", who ? other : ME, { msgtype: "m.text", body }, undefined, msgs.length - i)) },
  unread_notifications: { notification_count: unread, highlight_count: 0 },
  summary: { "m.joined_member_count": 2, "m.invited_member_count": 0 },
});

const rooms = {
  "!a:pager.test": room("a", "Mom", "whatsapp", "@wa_mom:pager.test", [[1, "Are you coming Sunday?"], [0, "Yes! What should I bring?"], [1, "Just yourself 😊"]], 1),
  "!b:pager.test": room("b", "Design Team", "discord", "@dc_team:pager.test", [[1, "Shipping the new build tonight"], [0, "Nice, I'll test in the morning"]]),
  "!c:pager.test": room("c", "Alex Rivera", "signal", "@sg_alex:pager.test", [[1, "Dinner on Friday?"]], 3),
  "!d:pager.test": room("d", "Pager bot DM", "whatsapp", "@whatsappbot:pager.test", [[1, "Login successful"]]),
};

let connected = [];
let qrPolls = 0;
const send = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  let body = "";
  for await (const c of req) body += c;
  console.log(req.method, p);

  if (p === "/api/config") return send(res, 200, { domain: "pager.test", signup: "invite", inviteRequired: true, bridges: [] });
  if (p === "/api/signup") return send(res, 201, { user_id: ME });
  if (p === "/api/bridges") return send(res, 200, { networks: [
    { id: "whatsapp", name: "WhatsApp", logins: connected },
    { id: "signal", name: "Signal", logins: [] },
    { id: "discord", name: "Discord", logins: [] },
  ] });
  if (p.endsWith("/login/flows")) return send(res, 200, { flows: [{ id: "qr", name: "QR code" }] });
  if (p.includes("/login/start/")) return send(res, 200, { login_id: "L1", step_id: "qr", type: "display_and_wait",
    instructions: "Open WhatsApp on your phone → Linked devices → Link a device, then scan this code.",
    display_and_wait: { type: "qr", data: "2@mock-qr-data-" + Date.now() } });
  if (p.includes("/login/step/")) {
    await new Promise((r) => setTimeout(r, 4000));
    connected = [{ id: "15551234567", name: "+1 555 123 4567" }];
    return send(res, 200, { login_id: "L1", step_id: "done", type: "complete", complete: { user_login_id: "15551234567" } });
  }

  if (p === "/_matrix/client/versions") return send(res, 200, { versions: ["v1.1", "v1.5", "v1.11"], unstable_features: {} });
  if (p === "/_matrix/client/v3/login") return send(res, 200, { access_token: "tok", user_id: ME, device_id: "DEV" });
  if (p === "/_matrix/client/v3/account/whoami") return send(res, 200, { user_id: ME, device_id: "DEV" });
  if (p === "/_matrix/client/v3/sync") {
    const first = !url.searchParams.get("since");
    if (!first) await new Promise((r) => setTimeout(r, 8000));
    return send(res, 200, { next_batch: first ? "s1" : "s1", rooms: first ? { join: rooms } : {}, account_data: { events: [] }, presence: { events: [] } });
  }
  if (p.includes("/send/")) return send(res, 200, { event_id: "$sent" + Date.now() });
  if (p.includes("/capabilities")) return send(res, 200, { capabilities: {} });
  if (p.includes("/filter")) return send(res, 200, { filter_id: "1" });
  send(res, 200, {});
}).listen(8008, () => console.log("Mock Pager backend on http://localhost:8008"));
