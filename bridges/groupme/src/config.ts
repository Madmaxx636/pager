import { readFileSync } from "node:fs";
import { parse } from "yaml";

export interface Config {
  port: number;
  /** The Matrix server name, e.g. example.com. */
  domain: string;
  homeserverUrl: string;
  asToken: string;
  hsToken: string;
  botLocalpart: string;
  /** Ghost users (people on GroupMe) are @<ghostPrefix><groupme user id>:<domain>. */
  ghostPrefix: string;
  provisioningSecret: string;
  dataDir: string;
  groupmeApi: string;
  groupmeImageApi: string;
  groupmePush: string;
  /** How many old messages to copy into a chat when it first appears. */
  backfill: number;
}

/** Reads the settings from the environment and the appservice registration file Synapse also reads. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const need = (k: string) => { const v = env[k]; if (!v) throw new Error(`Missing required setting ${k}`); return v; };
  const dataDir = env.DATA_DIR ?? "/data";
  const reg = parse(readFileSync(env.REGISTRATION_FILE ?? `${dataDir}/registration.yaml`, "utf8")) as { as_token: string; hs_token: string; sender_localpart: string };
  return {
    port: Number(env.PORT ?? 29318),
    domain: need("PAGER_DOMAIN"),
    homeserverUrl: (env.SYNAPSE_URL ?? "http://synapse:8008").replace(/\/+$/, ""),
    asToken: reg.as_token,
    hsToken: reg.hs_token,
    botLocalpart: reg.sender_localpart,
    ghostPrefix: env.GHOST_PREFIX ?? "groupme_",
    provisioningSecret: need("PROVISIONING_SECRET"),
    dataDir,
    groupmeApi: (env.GROUPME_API ?? "https://api.groupme.com/v3").replace(/\/+$/, ""),
    groupmeImageApi: (env.GROUPME_IMAGE_API ?? "https://image.groupme.com").replace(/\/+$/, ""),
    groupmePush: env.GROUPME_PUSH ?? "https://push.groupme.com/faye",
    backfill: Number(env.BACKFILL ?? 20),
  };
}
