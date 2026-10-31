// Updates from GitHub (the release tagged "updates", which works from any network) and from your own server: both publish latest.json (with a signature
// file next to it) and the installers. This checks the signature with the public key that ships inside the app, so a file cannot be swapped for a
// different one without the release key, and takes whichever answer is newer.
// On Windows the installer runs quietly for your user and reopens Pager. Installing a .deb needs root, so the system asks for your password (pkexec). AppImage builds don't update themselves.
const { app, dialog, shell } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const http = require("node:http");
const { spawn } = require("node:child_process");

const GITHUB_UPDATES = "https://github.com/Madmaxx636/pager/releases/download/updates/";
const PUBLIC_KEY = () => fs.readFileSync(path.join(__dirname, "update-pubkey.pem"), "utf8");

const parts = (v) => String(v).split(".").map((n) => parseInt(n, 10) || 0);
/** True when version a is newer than b (1.2.10 > 1.2.9). */
function newer(a, b) { const x = parts(a), y = parts(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; }

/** Which entry of the update information this computer takes: a 32-bit Windows PC needs the 32-bit installer, never the 64-bit one. Undefined when none fits. */
function entryFor(all, platform, arch) {
  if (platform === "win32") return arch === "ia32" ? all.windows32 : all.windows;
  return all.desktop;
}

/** The manifest bytes are trusted only if the signature next to them was made with the release key. */
function verify(manifest, signature, publicKeyPem) {
  try { return crypto.verify(null, manifest, publicKeyPem, signature); } catch { return false; }
}

function get(url, { toFile, maxBytes = 300 * 1024 * 1024, onProgress, hops = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? https : http;
    const req = lib.get(url, { timeout: 30000 }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (hops >= 5) return reject(new Error("too many redirects"));
        const next = new URL(res.headers.location, url).toString();
        if (!next.startsWith("https:")) return reject(new Error("redirected to an unsafe address"));
        return get(next, { toFile, maxBytes, onProgress, hops: hops + 1 }).then(resolve, reject);
      }
      if (res.statusCode === 404) { res.resume(); return resolve(null); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`server said ${res.statusCode}`)); }
      const hash = crypto.createHash("sha256"); let size = 0; const total = Number(res.headers["content-length"]) || 0;
      const out = toFile ? fs.createWriteStream(toFile) : null; const chunks = [];
      res.on("data", (c) => { size += c.length; onProgress?.(size, total); if (size > maxBytes) { req.destroy(new Error("file too large")); return; } hash.update(c); out ? out.write(c) : chunks.push(c); });
      res.on("end", () => { const done = () => resolve({ sha256: hash.digest("hex"), body: out ? null : Buffer.concat(chunks) }); out ? out.end(done) : done(); });
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", reject);
  });
}

/**
 * Asks GitHub and your server for the update information and takes the newer answer. The signature is checked on each. Returns
 * { d, base } for the entry that fits this computer, or { note } saying why there is none; throws when the only answers were bad.
 */
async function lookup(server, platform, arch) {
  const bases = [GITHUB_UPDATES]; if (server) bases.push(server.replace(/\/+$/, "") + "/updates/");
  let best = null, reached = false, firstError = null, note = null;
  for (const base of bases) {
    try {
      const man = await get(base + "latest.json", { maxBytes: 1024 * 1024 });
      if (!man) continue;
      reached = true;
      const sig = await get(base + "latest.json.sig", { maxBytes: 4096 });
      if (!sig || !verify(man.body, sig.body, PUBLIC_KEY())) { firstError ??= "the update information isn't signed by the Pager release key, so it was ignored"; continue; }
      const d = entryFor(JSON.parse(man.body.toString("utf8")), platform, arch);
      if (!d) { note ??= platform === "win32" && arch === "ia32" ? "No 32-bit Windows version is published yet." : "No version for this computer is published yet."; continue; }
      if (!d.version || !d.file || !/^[0-9a-f]{64}$/.test(String(d.sha256).toLowerCase()) || /[\/\\]/.test(d.file)) { firstError ??= "the update information is incomplete"; continue; }
      if (!best || newer(d.version, best.d.version)) best = { d, base };
    } catch (e) { firstError ??= e.message || String(e); }
  }
  if (best) return best;
  if (!reached) throw new Error(firstError || "no update information could be reached");
  if (firstError) throw new Error(firstError);
  return { note: note || "No updates are published yet." };
}

let busy = false;
/** Looks for a newer version; asks before installing. [quiet] false also says "you're up to date" and shows errors. */
async function checkForUpdates({ server, win, quiet }) {
  if (busy) return;
  const win32 = process.platform === "win32";
  if (!(win32 || process.platform === "linux") || process.env.APPIMAGE || !app.isPackaged) { if (!quiet) dialog.showMessageBox(win ?? undefined, { message: "This copy of Pager doesn't update itself. Install the .deb from your server to get automatic updates." }); return; }
  busy = true; let accepted = false;
  try {
    const found = await lookup(server, process.platform, process.arch);
    if (!found.d) { if (!quiet) dialog.showMessageBox(win ?? undefined, { message: found.note }); return; }
    const { d, base } = found;
    if (!newer(d.version, app.getVersion())) { if (!quiet) dialog.showMessageBox(win ?? undefined, { message: `You're up to date (${app.getVersion()}).` }); return; }
    const asked = await dialog.showMessageBox(win ?? undefined, { type: "info", message: `Pager ${d.version} is available`, detail: (d.notes || "") + (win32 ? "\n\nPager will close, update and reopen." : "\n\nYour computer will ask for your password to install it."), buttons: ["Update now", "Later"], defaultId: 0, cancelId: 1 });
    if (asked.response !== 0) return;
    accepted = true; // from here on a failure is shown even when the check was automatic
    const dir = path.join(app.getPath("userData"), "updates"); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, d.file);
    // Show that something is happening: a bar on the taskbar icon and a note inside the window (a 100 MB download looks like a hang without it).
    const tell = (state, percent) => { try { if (win && !win.isDestroyed()) { win.setProgressBar(state === "downloading" && percent >= 0 ? percent / 100 : -1); win.webContents.send("update-progress", { version: d.version, state, percent }); } } catch { /* the window may be gone */ } };
    let got = null, last = 0;
    for (let attempt = 1; attempt <= 3 && !got; attempt++) {
      try { tell("downloading", 0); got = await get(base + d.file, { toFile: file, onProgress: (n, total) => { const pc = total ? Math.floor((n / total) * 100) : -1; if (pc !== last) { last = pc; tell("downloading", pc); } } }); }
      catch (e) { tell("failed", 0); if (attempt === 3) throw new Error(`the download kept stopping (${e.message || e}). Check your connection and try again`); await new Promise((r) => setTimeout(r, 2000 * attempt)); }
    }
    tell("installing", 100);
    if (!got || got.sha256 !== String(d.sha256).toLowerCase()) { fs.rmSync(file, { force: true }); throw new Error("the download doesn't match its checksum, so it was not installed"); }
    if (win32) { await installWindows(file, win); return; }
    await install(file, win);
    app.relaunch(); app.exit(0);
  } catch (e) { try { if (win && !win.isDestroyed()) { win.setProgressBar(-1); win.webContents.send("update-progress", { state: "failed", percent: 0 }); } } catch {} if (!quiet || accepted) dialog.showErrorBox("Update failed", e.message || String(e)); else console.warn("update check failed:", e.message); }
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

module.exports = { checkForUpdates, entryFor, newer, verify, terminalPlan, asUserService };
