// The test stack: a Matrix server (Synapse in a container), the real Pager API, and serve.mjs putting the web app and both under one address.
//   node e2e/stack.mjs up        start everything (the first time it also makes the server's config and the test accounts)
//   node e2e/stack.mjs seed      fill it with fake chats (see seed.mjs)
//   node e2e/stack.mjs status    what is running
//   node e2e/stack.mjs down      stop everything (the data stays)
//   node e2e/stack.mjs reset     stop everything and delete all test data
// Needs docker or podman, node 22, and the web app built (cd app && npm run build). Nothing here touches a real Pager server.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, openSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { userInfo } from "node:os";
import { DOMAIN, PORTS, SECRET, WEB, register } from "./lib.mjs";

const root = resolve(import.meta.dirname, ".."), here = import.meta.dirname, state = resolve(here, ".state");
const NAME = "pager-e2e-synapse";
// The same pinned version as a new real install (server/docker-compose.yml).
const IMAGE = /docker\.io\/matrixdotorg\/synapse:latest@sha256:[0-9a-f]{64}/.exec(readFileSync(resolve(root, "server/docker-compose.yml"), "utf8"))?.[0] ?? "docker.io/matrixdotorg/synapse:latest";
// Rootless podman (which answers to "docker" here) needs --userns=keep-id so the container can write the folder; real docker does not know the flag.
const isPodman = (() => { try { return /podman/i.test(execFileSync("readlink", ["-f", execFileSync("which", ["docker"], { encoding: "utf8" }).trim()], { encoding: "utf8" })); } catch { return false; } })();
const ns = isPodman ? ["--userns=keep-id"] : [];
const docker = (...a) => execFileSync("docker", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pidFile = (n) => resolve(state, n + ".pid");
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const running = (n) => existsSync(pidFile(n)) && alive(Number(readFileSync(pidFile(n), "utf8")));
const stop = (n) => { if (running(n)) { try { process.kill(Number(readFileSync(pidFile(n), "utf8"))); } catch { /* gone */ } } rmSync(pidFile(n), { force: true }); };
const start = (n, cmd, args, opts) => {
  if (running(n)) return;
  const log = openSync(resolve(state, n + ".log"), "a");
  const p = spawn(cmd, args, { ...opts, detached: true, stdio: ["ignore", log, log] }); p.unref();
  writeFileSync(pidFile(n), String(p.pid));
};
async function waitFor(url, what, tries = 90) {
  for (let i = 0; i < tries; i++) { try { if ((await fetch(url)).ok) return; } catch { /* not yet */ } await sleep(1000); }
  throw new Error(`${what} did not come up (${url}); see ${state}`);
}

function makeConfig() {
  const data = resolve(state, "synapse");
  if (existsSync(resolve(data, "homeserver.yaml"))) return;
  mkdirSync(data, { recursive: true });
  const { uid, gid } = userInfo();
  docker("run", "--rm", ...ns, "-u", `${uid}:${gid}`, "-v", `${data}:/data`, "-e", `SYNAPSE_SERVER_NAME=${DOMAIN}`, "-e", "SYNAPSE_REPORT_STATS=no", IMAGE, "generate");
  // Test settings: no rate limits (the tests log in and send a lot), registration by the shared secret only.
  appendFileSync(resolve(data, "homeserver.yaml"), `
registration_shared_secret: "${SECRET}"
suppress_key_server_warning: true
rc_message: { per_second: 1000, burst_count: 1000 }
rc_registration: { per_second: 1000, burst_count: 1000 }
rc_login: { address: { per_second: 1000, burst_count: 1000 }, account: { per_second: 1000, burst_count: 1000 }, failed_attempts: { per_second: 1000, burst_count: 1000 } }
rc_joins: { local: { per_second: 1000, burst_count: 1000 }, remote: { per_second: 1000, burst_count: 1000 } }
rc_invites: { per_room: { per_second: 1000, burst_count: 1000 }, per_user: { per_second: 1000, burst_count: 1000 }, per_issuer: { per_second: 1000, burst_count: 1000 } }
`);
}

async function up() {
  if (!existsSync(resolve(root, "app/dist/index.html"))) throw new Error("Build the web app first: cd app && npm ci && npm run build");
  mkdirSync(state, { recursive: true });
  makeConfig();
  try { docker("start", NAME); } catch {
    const { uid, gid } = userInfo();
    docker("run", "-d", "--name", NAME, ...ns, "-u", `${uid}:${gid}`, "-p", `127.0.0.1:${PORTS.synapse}:8008`, "-v", `${resolve(state, "synapse")}:/data`, IMAGE);
  }
  await waitFor(`http://127.0.0.1:${PORTS.synapse}/health`, "Synapse");
  await register("alice", "pw-alice", true, "Alice");
  writeFileSync(resolve(state, "bridges.json"), "[]");
  start("api", "npx", ["tsx", "src/main.ts"], { cwd: resolve(root, "api"), env: { ...process.env, PORT: String(PORTS.api), PAGER_DOMAIN: DOMAIN, REGISTRATION_SECRET: SECRET, PROVISIONING_SECRET: "e2e", SYNAPSE_URL: `http://127.0.0.1:${PORTS.synapse}`, SIGNUP_MODE: "open", BRIDGES_FILE: resolve(state, "bridges.json"), STATE_FILE: resolve(state, "api-state.json") } });
  await waitFor(`http://127.0.0.1:${PORTS.api}/api/config`, "the Pager API");
  start("web", process.execPath, [resolve(here, "serve.mjs"), String(PORTS.web), String(PORTS.synapse), String(PORTS.api)], {});
  await waitFor(`${WEB}/`, "the web server");
  console.log(`up: ${WEB}   sign in as alice / pw-alice   (after "seed": bob, carol ... all with password pw-<name>)`);
}

function down() { stop("web"); stop("api"); try { docker("stop", NAME); } catch { /* not running */ } console.log("down"); }
function reset() { down(); try { docker("rm", "-f", NAME); } catch { /* none */ } rmSync(state, { recursive: true, force: true }); console.log("all test data deleted"); }
async function status() {
  const ok = async (u) => { try { return (await fetch(u)).ok; } catch { return false; } };
  console.log(JSON.stringify({ synapse: await ok(`http://127.0.0.1:${PORTS.synapse}/health`), api: await ok(`http://127.0.0.1:${PORTS.api}/api/config`), web: await ok(`${WEB}/`) }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  const run = { up, down, reset, status, seed: async () => (await import("./seed.mjs")).seed() }[cmd];
  if (!run) { console.error("usage: node e2e/stack.mjs up|seed|status|down|reset"); process.exit(1); }
  await run();
}
