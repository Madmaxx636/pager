import type { BridgeConfig, Config } from "./config.ts";
import { HttpError } from "./synapse.ts";

/** Calls a mautrix (bridgev2) provisioning API on behalf of a Matrix user. */
export async function bridgeRequest(
  cfg: Config,
  bridge: BridgeConfig,
  userId: string,
  method: string,
  path: string,
  body?: unknown,
) {
  const url = new URL(`${bridge.url}/_matrix/provision/v3${path}`);
  url.searchParams.set("user_id", userId);
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${cfg.provisioningSecret}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    throw new HttpError(502, `${bridge.name} bridge is unreachable`);
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new HttpError(res.status, data.error ?? `${bridge.name} bridge error`, data);
  return data;
}
