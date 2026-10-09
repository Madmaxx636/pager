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
