import { createHmac } from "node:crypto";
import type { Config } from "./config.ts";

export class HttpError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

/** Create a user via Synapse's shared-secret admin registration. */
export async function registerUser(cfg: Config, username: string, password: string, admin = false) {
  const url = `${cfg.synapseUrl}/_synapse/admin/v1/register`;
  const nonceRes = await fetch(url);
  if (!nonceRes.ok) throw new HttpError(502, "Homeserver unavailable");
  const { nonce } = (await nonceRes.json()) as { nonce: string };
  const mac = createHmac("sha1", cfg.registrationSecret)
    .update(`${nonce}\0${username}\0${password}\0${admin ? "admin" : "notadmin"}`)
    .digest("hex");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nonce, username, password, admin, mac }),
  });
  const body = (await res.json()) as { errcode?: string; error?: string };
  if (!res.ok) {
    if (body.errcode === "M_USER_IN_USE") throw new HttpError(409, "That username is taken");
    throw new HttpError(400, body.error ?? "Could not create account");
  }
  return body;
}

/** Resolve a Matrix access token to a user ID. */
export async function whoami(cfg: Config, accessToken: string): Promise<string> {
  const res = await fetch(`${cfg.synapseUrl}/_matrix/client/v3/account/whoami`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new HttpError(401, "Not signed in");
  return ((await res.json()) as { user_id: string }).user_id;
}

/**
 * Calls Synapse's admin API with the caller's own token, so Synapse itself decides whether they are allowed:
 * a non-admin gets a 403 here no matter what they ask for.
 */
export async function synapseAdmin(cfg: Config, token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${cfg.synapseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => { throw new HttpError(502, "Homeserver unavailable"); });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new HttpError(res.status === 401 ? 401 : res.status === 403 ? 403 : res.status, data.error ?? "Homeserver error", data);
  return data;
}

/** Checks someone's password the way Synapse does, without leaving a signed-in device behind. Throws 403 if it is wrong. */
export async function verifyPassword(cfg: Config, userId: string, password: string): Promise<void> {
  if (typeof password !== "string" || !password) throw new HttpError(400, "Enter your password to continue");
  const res = await fetch(`${cfg.synapseUrl}/_matrix/client/v3/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "m.login.password", identifier: { type: "m.id.user", user: userId }, password, initial_device_display_name: "Pager password check" }),
  }).catch(() => { throw new HttpError(502, "Homeserver unavailable"); });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (res.status === 429) throw new HttpError(429, "Too many tries. Wait a minute and try again");
  if (!res.ok || !data.access_token) throw new HttpError(403, "That isn't your password");
  // The check made a device: remove it again.
  await fetch(`${cfg.synapseUrl}/_matrix/client/v3/logout`, { method: "POST", headers: { authorization: `Bearer ${data.access_token}` } }).catch(() => {});
}

/** Acts as another user for one call (an admin power in Synapse), then forgets the token. */
export async function asUser<T>(cfg: Config, adminToken: string, userId: string, fn: (userToken: string) => Promise<T>): Promise<T> {
  const r = await synapseAdmin(cfg, adminToken, "POST", `/_synapse/admin/v1/users/${encodeURIComponent(userId)}/login`, {});
  try { return await fn(r.access_token as string); }
  finally { await fetch(`${cfg.synapseUrl}/_matrix/client/v3/logout`, { method: "POST", headers: { authorization: `Bearer ${r.access_token}` } }).catch(() => {}); }
}
