// Updates from your own server. It publishes /updates/latest.json (with a signature file next to it) and the .deb. This checks the signature
// with the public key that ships inside the app, so a file on the server cannot be swapped for a different one without the release key.
// Installing a .deb needs root, so the system asks for your password (pkexec). AppImage builds don't update themselves.
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
  if (process.platform !== "linux" || process.env.APPIMAGE || !app.isPackaged) { if (!quiet) dialog.showMessageBox(win ?? undefined, { message: "This copy of Pager doesn't update itself. Install the .deb from your server to get automatic updates." }); return; }
  busy = true;
  try {
    const base = server.replace(/\/+$/, "") + "/updates/";
    const man = await get(base + "latest.json", { maxBytes: 1024 * 1024 });
    const sig = man && (await get(base + "latest.json.sig", { maxBytes: 4096 }));
    if (!man) { if (!quiet) dialog.showMessageBox(win ?? undefined, { message: "Your server doesn't publish updates yet." }); return; }
    if (!sig || !verify(man.body, sig.body, PUBLIC_KEY())) throw new Error("the update information isn't signed by the Pager release key, so it was ignored");
    const d = JSON.parse(man.body.toString("utf8")).desktop;
    if (!d || !d.version || !d.file || !/^[0-9a-f]{64}$/.test(String(d.sha256).toLowerCase()) || /[\/\\]/.test(d.file)) throw new Error("the update information is incomplete");
    if (!newer(d.version, app.getVersion())) { if (!quiet) dialog.showMessageBox(win ?? undefined, { message: `You're up to date (${app.getVersion()}).` }); return; }
    const asked = await dialog.showMessageBox(win ?? undefined, { type: "info", message: `Pager ${d.version} is available`, detail: (d.notes || "") + "\n\nYour computer will ask for your password to install it.", buttons: ["Update now", "Later"], defaultId: 0, cancelId: 1 });
    if (asked.response !== 0) return;
    const dir = path.join(app.getPath("userData"), "updates"); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, d.file);
    const got = await get(base + d.file, { toFile: file });
    if (!got || got.sha256 !== String(d.sha256).toLowerCase()) { fs.rmSync(file, { force: true }); throw new Error("the download doesn't match its checksum, so it was not installed"); }
    await install(file);
    app.relaunch(); app.exit(0);
  } catch (e) { if (!quiet) dialog.showErrorBox("Update failed", e.message || String(e)); else console.warn("update check failed:", e.message); }
  finally { busy = false; }
}

function install(file) {
  return new Promise((resolve, reject) => {
    const p = spawn("pkexec", ["apt-get", "install", "-y", file], { stdio: "ignore" });
    p.on("error", () => reject(new Error(`pkexec isn't available. Install it yourself: sudo apt install ${file}`)));
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(code === 126 || code === 127 ? "the password prompt was cancelled" : `the installer stopped (code ${code})`))));
  });
}

module.exports = { checkForUpdates, newer, verify };
