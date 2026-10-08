import { readFileSync } from "node:fs";
export interface BridgeConfig {
  id: string;
  name: string;
  url: string;
}

export interface Config {
  port: number;
  domain: string;
  synapseUrl: string;
  registrationSecret: string;
  provisioningSecret: string;
  signup: { mode: "invite" | "open" | "closed"; inviteCode: string };
  bridges: BridgeConfig[];
}

const DEFAULT_BRIDGES: BridgeConfig[] = [
  { id: "whatsapp", name: "WhatsApp", url: "http://whatsapp:29318" },
  { id: "signal", name: "Signal", url: "http://signal:29318" },
  { id: "discord", name: "Discord", url: "http://discord:29318" },
];

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const need = (k: string) => {
    const v = env[k];
    if (!v) throw new Error(`Missing required env var ${k}`);
    return v;
  };
  const mode = (env.SIGNUP_MODE ?? "invite") as Config["signup"]["mode"];
  if (!["invite", "open", "closed"].includes(mode)) throw new Error(`Bad SIGNUP_MODE: ${mode}`);
  return {
    port: Number(env.PORT ?? 8080),
    domain: need("PAGER_DOMAIN"),
    synapseUrl: env.SYNAPSE_URL ?? "http://synapse:8008",
    registrationSecret: need("REGISTRATION_SECRET"),
    provisioningSecret: need("PROVISIONING_SECRET"),
    signup: { mode, inviteCode: env.INVITE_CODE ?? "" },
    bridges: env.BRIDGES_FILE ? JSON.parse(readFileSync(env.BRIDGES_FILE, "utf8")) : DEFAULT_BRIDGES,
  };
}
