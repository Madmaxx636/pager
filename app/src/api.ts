// Client for the Pager API (signup and in-app bridge login).
let token = "";
export const setApiToken = (t: string) => (token = t);

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export interface ServerConfig {
  domain: string;
  signup: "invite" | "open" | "closed";
  inviteRequired: boolean;
  bridges: { id: string; name: string }[];
}
export interface BridgeLogin { id: string; name?: string; profile?: { name?: string; phone?: string; username?: string } }
export interface NetworkStatus { id: string; name: string; logins: BridgeLogin[]; error?: string }

export interface LoginFlow { id: string; name: string; description?: string }
export interface LoginField { id: string; type: string; name: string; description?: string; pattern?: string }
export interface LoginStep {
  login_id: string;
  step_id: string;
  type: "display_and_wait" | "user_input" | "cookies" | "complete";
  instructions?: string;
  display_and_wait?: { type: "qr" | "emoji" | "code" | "nothing"; data?: string; image_url?: string };
  user_input?: { fields: LoginField[] };
  complete?: { user_login_id?: string };
}

export const getConfig = () => call<ServerConfig>("GET", "/config");
export const signup = (username: string, password: string, invite: string) =>
  call<{ user_id: string }>("POST", "/signup", { username, password, invite });
export const listNetworks = () => call<{ networks: NetworkStatus[] }>("GET", "/bridges");
export const loginFlows = (net: string) => call<{ flows: LoginFlow[] }>("GET", `/bridges/${net}/login/flows`);
export const loginStart = (net: string, flow: string) => call<LoginStep>("POST", `/bridges/${net}/login/start/${flow}`, {});
export const loginStep = (net: string, s: LoginStep, body: unknown = {}) =>
  call<LoginStep>("POST", `/bridges/${net}/login/step/${s.login_id}/${s.step_id}/${s.type}`, body);
export const logout = (net: string, loginId: string) => call<unknown>("POST", `/bridges/${net}/logout/${encodeURIComponent(loginId)}`, {});
