import { request } from "node:http";
import { existsSync, statSync } from "node:fs";

/** A tiny Docker Engine client over its unix socket, used only for the admin's bridge controls. Off unless the socket is mounted. */
const SOCK = () => process.env.DOCKER_SOCKET_PATH ?? "/var/run/docker.sock";

export function dockerAvailable(): boolean {
  try { return existsSync(SOCK()) && statSync(SOCK()).isSocket(); } catch { return false; }
}

function call(method: string, path: string): Promise<{ status: number; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = request({ socketPath: SOCK(), path, method, timeout: 30_000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }));
    });
    req.on("timeout", () => req.destroy(new Error("Docker timed out")));
    req.on("error", reject);
    req.end();
  });
}

export interface ContainerInfo { id: string; name: string; state: string; status: string; image: string }

/** The container that runs one compose service (e.g. "signal"). */
export async function findContainer(service: string): Promise<ContainerInfo | undefined> {
  const filters = encodeURIComponent(JSON.stringify({ label: [`com.docker.compose.service=${service}`] }));
  const r = await call("GET", `/containers/json?all=true&filters=${filters}`);
  if (r.status !== 200) throw new Error(`Docker said ${r.status}`);
  const list = JSON.parse(r.body.toString()) as { Id: string; Names: string[]; State: string; Status: string; Image: string }[];
  const c = list[0];
  return c ? { id: c.Id, name: (c.Names[0] ?? "").replace(/^\//, ""), state: c.State, status: c.Status, image: c.Image } : undefined;
}

export async function control(id: string, action: "restart" | "stop" | "start") {
  const r = await call("POST", `/containers/${id}/${action}${action === "start" ? "" : "?t=10"}`);
  if (![204, 304].includes(r.status)) throw new Error(`Docker said ${r.status}`);
}

/** Docker multiplexes stdout and stderr into 8-byte-framed chunks; this returns the plain text. */
export function demux(buf: Buffer): string {
  let out = "", i = 0;
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i + 4);
    if (buf[i] > 2 || i + 8 + len > buf.length + 1) return buf.toString(); // not framed (a TTY): it's already text
    out += buf.subarray(i + 8, i + 8 + len).toString();
    i += 8 + len;
  }
  return out || buf.toString();
}

export async function logs(id: string, tail = 200): Promise<string> {
  const r = await call("GET", `/containers/${id}/logs?stdout=1&stderr=1&tail=${Math.max(1, Math.min(2000, tail))}`);
  if (r.status !== 200) throw new Error(`Docker said ${r.status}`);
  return demux(r.body).replace(/\x1b\[[0-9;]*m/g, "");
}
