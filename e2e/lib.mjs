// Shared by stack.mjs and seed.mjs.
import { createHmac } from "node:crypto";

export const PORTS = { synapse: 18008, api: 18080, web: 18081 };
export const DOMAIN = "test.local", SECRET = "e2e-registration-secret";
export const WEB = `http://127.0.0.1:${PORTS.web}`;

/** Makes (or finds) an account through the server's shared-secret registration. */
export async function register(user, password, admin = false, displayname) {
  const base = `http://127.0.0.1:${PORTS.synapse}/_synapse/admin/v1/register`;
  const { nonce } = await (await fetch(base)).json();
  const mac = createHmac("sha1", SECRET).update(`${nonce}\0${user}\0${password}\0${admin ? "admin" : "notadmin"}`).digest("hex");
  const res = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nonce, username: user, password, admin, displayname, mac }) });
  const body = await res.json();
  if (!res.ok && body.errcode !== "M_USER_IN_USE") throw new Error(`could not register ${user}: ${JSON.stringify(body)}`);
}

// ---- Plain Matrix calls for setting things up (the tests themselves drive the real app in a browser) ----
const client = `http://127.0.0.1:${PORTS.synapse}/_matrix/client/v3`;
export async function api(token, method, path, body) {
  const res = await fetch(client + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${JSON.stringify(json)}`);
  return json;
}
/** A separate sign-in (its own device) for set-up and checks; the password is pw-<name>. */
export async function login(user) {
  return (await api(null, "POST", "/login", { type: "m.login.password", identifier: { type: "m.id.user", user }, password: `pw-${user}`, initial_device_display_name: "e2e setup" })).access_token;
}
/** An encrypted room that both people are in. Nobody has sent anything yet. */
export async function createEncryptedRoom(creator, other, name) {
  const t = await login(creator);
  const { room_id } = await api(t, "POST", "/createRoom", { name, preset: "private_chat", invite: [`@${other}:${DOMAIN}`], initial_state: [{ type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }] });
  await api(await login(other), "POST", `/join/${encodeURIComponent(room_id)}`, {});
  return room_id;
}
/** How many message keys the person's recovery backup holds on the server right now. */
export async function backedUpSessions(user) {
  const t = await login(user);
  const v = await api(t, "GET", "/room_keys/version").catch(() => null);
  if (!v) return 0;
  const keys = await api(t, "GET", `/room_keys/keys?version=${v.version}`);
  return Object.values(keys.rooms ?? {}).reduce((n, r) => n + Object.keys(r.sessions ?? {}).length, 0);
}
