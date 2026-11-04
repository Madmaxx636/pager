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
