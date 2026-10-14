// Updates from your own server. It publishes /updates/latest.json (with a signature file next to it) and the .deb. This checks the signature
// with the public key that ships inside the app, so a file on the server cannot be swapped for a different one without the release key.
// On Windows the installer runs quietly for your user and reopens Pager. Installing a .deb needs root, so the system asks for your password (pkexec). AppImage builds don't update themselves.
const { app, dialog, shell } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const http = require("node:http");
const { spawn } = require("node:child_process");

const PUBLIC_KEY = () => fs.readFileSync(path.join(__dirname, "update-pubkey.pem"), "utf8");

const parts = (v) => String(v).split(".").map((n) => parseInt(n, 10) || 0);
/** True when version a is newer than b (1.2.10 > 1.2.9). */
function newer(a, b) { const x = parts(a), y = parts(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; }

/** The manifest bytes are trusted only if the signature next to them was made with the release key. */
function verify(manifest, signature, publicKeyPem) {
  try { return crypto.verify(null, manifest, publicKeyPem, signature); } catch { return false; }
}

function get(url, { toFile, maxBytes = 300 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? https : http;
    const req = lib.get(url, { timeout: 20000 }, (res) => {
      if (res.statusCode === 404) { res.resume(); return resolve(null); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`server said ${res.statusCode}`)); }
      const hash = crypto.createHash("sha256"); let size = 0;
      const out = toFile ? fs.createWriteStream(toFile) : null; const chunks = [];
      res.on("data", (c) => { size += c.length; if (size > maxBytes) { req.destroy(new Error("file too large")); return; } hash.update(c); out ? out.write(c) : chunks.push(c); });
      res.on("end", () => { const done = () => resolve({ sha256: hash.digest("hex"), body: out ? null : Buffer.concat(chunks) }); out ? out.end(done) : done(); });
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", reject);
  });
}

let busy = false;
/** Looks for a newer version; asks before installing. [quiet] false also says "you're up to date" and shows errors. */
async function checkForUpdates({ server, win, quiet }) {
  if (busy || !server) return;
  const win32 = process.platform === "win32";
  if (!(win32 || process.platform === "linux") || process.env.APPIMAGE || !app.isPackaged) { if (!quiet) dialog.showMessageBox(win ?? undefined, { message: "This copy of Pager doesn't update itself. Install the .deb from your server to get automatic updates." }); return; }
  busy = true;
  try {
    const base = server.replace(/\/+$/, "") + "/updates/";
    const man = await get(base + "latest.json", { maxBytes: 1024 * 1024 });
    const sig = man && (await get(base + "latest.json.sig", { maxBytes: 4096 }));
    if (!man) { if (!quiet) dialog.showMessageBox(win ?? undefined, { message: "Your server doesn't publish updates yet." }); return; }
    if (!sig || !verify(man.body, sig.body, PUBLIC_KEY())) throw new Error("the update information isn't signed by the Pager release key, so it was ignored");
    const all = JSON.parse(man.body.toString("utf8")); const d = win32 ? all.windows : all.desktop;
    if (!d || !d.version || !d.file || !/^[0-9a-f]{64}$/.test(String(d.sha256).toLowerCase()) || /[\/\\]/.test(d.file)) throw new Error("the update information is incomplete");
    if (!newer(d.version, app.getVersion())) { if (!quiet) dialog.showMessageBox(win ?? undefined, { message: `You're up to date (${app.getVersion()}).` }); return; }
    const asked = await dialog.showMessageBox(win ?? undefined, { type: "info", message: `Pager ${d.version} is available`, detail: (d.notes || "") + (win32 ? "\n\nPager will close, update and reopen." : "\n\nYour computer will ask for your password to install it."), buttons: ["Update now", "Later"], defaultId: 0, cancelId: 1 });
    if (asked.response !== 0) return;
    const dir = path.join(app.getPath("userData"), "updates"); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, d.file);
    const got = await get(base + d.file, { toFile: file });
    if (!got || got.sha256 !== String(d.sha256).toLowerCase()) { fs.rmSync(file, { force: true }); throw new Error("the download doesn't match its checksum, so it was not installed"); }
    if (win32) { await installWindows(file, win); return; }
    await install(file, win);
    app.relaunch(); app.exit(0);
  } catch (e) { if (!quiet) dialog.showErrorBox("Update failed", e.message || String(e)); else console.warn("update check failed:", e.message); }
  finally { busy = false; }
}

/** Terminal windows Pager can open to run the install itself, with what each needs so the command runs and the window waits. */
const TERMINALS = [["x-terminal-emulator", ["-e"]], ["konsole", ["--nofork", "-e"]], ["gnome-terminal", ["--wait", "--"]], ["xfce4-terminal", ["--disable-server", "-x"]], ["kitty", []], ["alacritty", ["-e"]], ["xterm", ["-e"]]];
const shq = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;

/** The command that installs [file] in a terminal window (asking for your password there). [done] is created when it worked. Undefined when no terminal is installed. */
function terminalPlan(file, done, exists) {
  const t = TERMINALS.find(([bin]) => exists(bin));
  if (!t) return undefined;
  const script = `echo 'Installing Pager…'; if sudo apt-get install -y ${shq(file)}; then touch ${shq(done)}; echo; echo 'Done. Pager will reopen.'; sleep 1; else echo; read -r -p 'Something went wrong. Press Enter to close.' _; fi`;
  return { cmd: t[0], args: [...t[1], "bash", "-c", script] };
}

const onPath = (bin) => (process.env.PATH || "").split(":").some((d) => { try { fs.accessSync(path.join(d, bin), fs.constants.X_OK); return true; } catch { return false; } });

/** Asks for your password through the system (pkexec). Rejects with .asked = true when you saw the prompt and said no, false when the prompt could not be shown. */
function viaPkexec(file) {
  return new Promise((resolve, reject) => {
    let err = "";
    const p = spawn("pkexec", ["apt-get", "install", "-y", file], { stdio: ["ignore", "ignore", "pipe"] });
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", () => reject(Object.assign(new Error("pkexec isn't available"), { asked: false })));
    p.on("exit", (code) => {
      if (code === 0) return resolve();
      // 126: you dismissed the prompt or it was refused. 127: no prompt could be shown (no agent for this session, or pkexec could not start).
      reject(Object.assign(new Error(code === 126 ? "the password prompt was cancelled" : (err.trim().split("\n").pop() || `the installer stopped (code ${code})`)), { asked: code === 126 }));
    });
  });
}

/** True when this program may not gain privileges (the "no new privileges" flag): then pkexec and sudo started from here can never work, and neither can anything started by us. */
const noNewPrivs = () => { try { return /^NoNewPrivs:\s*1/m.test(fs.readFileSync("/proc/self/status", "utf8")); } catch { return false; } };

/** Runs [plan] as a service of the user's systemd instead of as a child of Pager, so it does not inherit the "no new privileges" flag and sudo works in it. */
function asUserService(plan, env, exists) {
  if (!exists("systemd-run")) return plan;
  const keep = ["DISPLAY", "WAYLAND_DISPLAY", "XAUTHORITY", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS", "XDG_CURRENT_DESKTOP", "XDG_SESSION_TYPE", "LANG", "PATH"].filter((k) => env[k]);
  return { cmd: "systemd-run", args: ["--user", "--collect", "--quiet", "--wait", ...keep.map((k) => `--setenv=${k}`), plan.cmd, ...plan.args] };
}

/** Same install in a terminal window: for when the system password prompt does not appear. */
function viaTerminal(file) {
  return new Promise((resolve, reject) => {
    const done = path.join(path.dirname(file), "installed");
    fs.rmSync(done, { force: true });
    const found = terminalPlan(file, done, onPath);
    const plan = found && asUserService(found, process.env, onPath);
    if (!plan) return reject(new Error(`No terminal window could be opened. Install it yourself: sudo apt install ${file}`));
    const p = spawn(plan.cmd, plan.args, { stdio: "ignore" });
    p.on("error", () => reject(new Error(`Couldn't open a terminal. Install it yourself: sudo apt install ${file}`)));
    p.on("exit", () => (fs.existsSync(done) ? resolve() : reject(new Error("the install in the terminal didn't finish"))));
  });
}

/** Windows: open the installer the way Explorer does, so Windows can show its own "do you want to run this" step. Starting it from behind (as this used to) was refused outright on Windows 11 and Pager closed anyway, leaving nothing installed. */
async function installWindows(file, win) {
  const problem = await shell.openPath(file);
  if (!problem) return; // the installer closes Pager itself when it needs to replace it, and starts it again afterwards
  const r = await dialog.showMessageBox(win ?? undefined, {
    type: "warning", message: "Windows wouldn't open the installer",
    detail: `${problem}\n\nThis usually means Windows blocked a file it doesn't recognise. Open the folder, right-click the installer, choose Properties, tick "Unblock" and press OK, then run it. If Windows still refuses, Smart App Control may be on: it blocks programs that aren't signed. You can turn it off in Windows Security > App & browser control.`,
    buttons: ["Show the installer", "Close"], defaultId: 0, cancelId: 1,
  });
  if (r.response === 0) shell.showItemInFolder(file);
}

async function install(file, win) {
  try {
    // With "no new privileges" set, the password prompt can never work from here: go straight to the terminal.
    if (noNewPrivs()) throw Object.assign(new Error("This computer starts Pager in a way that stops it from asking for administrator rights"), { asked: false });
    await viaPkexec(file); return;
  } catch (e) {
    if (e.asked) throw e; // you said no: nothing more to try
    console.warn("password prompt failed:", e.message);
    const r = await dialog.showMessageBox(win ?? undefined, { type: "question", message: "Your computer didn't show a password prompt", detail: `${e.message}\n\nPager can open a terminal window instead, where you type your password to finish the update.`, buttons: ["Install in a terminal", "Cancel"], defaultId: 0, cancelId: 1 });
    if (r.response !== 0) throw new Error("the update was cancelled");
  }
  await viaTerminal(file);
}

module.exports = { checkForUpdates, newer, verify, terminalPlan, asUserService };
