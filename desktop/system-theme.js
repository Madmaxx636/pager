// Reads the colors of the desktop you are running on, so Pager can look like it belongs: KDE Plasma and GNOME on Linux,
// the accent color on Windows and macOS. Returns only what it can find; the app falls back to its own theme for the rest.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { nativeTheme, systemPreferences } = require("electron");

const hex = (r, g, b) => "#" + [r, g, b].map((n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, "0")).join("");
const rgbList = (s) => { const p = String(s || "").split(",").map((x) => x.trim()); return p.length >= 3 && p.slice(0, 3).every((x) => /^\d+$/.test(x)) ? hex(p[0], p[1], p[2]) : undefined; };

/** Minimal INI reader for kdeglobals. */
function readIni(file) {
  const out = {}; let sec = "";
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\[(.+)\]$/.exec(line.trim());
    if (m) { sec = m[1]; out[sec] ??= {}; continue; }
    const kv = /^([^=#;]+)=(.*)$/.exec(line);
    if (kv && sec) out[sec][kv[1].trim()] = kv[2].trim();
  }
  return out;
}

const GNOME_ACCENTS = { blue: "#3584e4", teal: "#2190a4", green: "#3a944a", yellow: "#c88800", orange: "#ed5b00", red: "#e62d42", pink: "#d56199", purple: "#9141ac", slate: "#6f8396" };

function gsetting(key) {
  try { return execFileSync("gsettings", ["get", "org.gnome.desktop.interface", key], { timeout: 1500, encoding: "utf8" }).trim().replace(/^'|'$/g, ""); } catch { return undefined; }
}

function readSystemTheme() {
  const theme = { dark: nativeTheme.shouldUseDarkColors, source: process.platform };
  try {
    if (process.platform === "linux") {
      const kde = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "kdeglobals");
      if (fs.existsSync(kde)) {
        const ini = readIni(kde);
        const view = ini["Colors:View"] || {}, win = ini["Colors:Window"] || {}, sel = ini["Colors:Selection"] || {}, gen = ini["General"] || {};
        theme.source = "kde";
        theme.name = gen.ColorScheme;
        theme.bg = rgbList(view.BackgroundNormal);
        theme.panel = rgbList(win.BackgroundNormal);
        theme.fg = rgbList(view.ForegroundNormal);
        theme.accent = rgbList(gen.AccentColor) || rgbList(sel.BackgroundNormal);
        theme.accentInk = rgbList(sel.ForegroundNormal);
      } else {
        const accent = gsetting("accent-color");
        if (accent && GNOME_ACCENTS[accent]) { theme.accent = GNOME_ACCENTS[accent]; theme.source = "gnome"; }
        const scheme = gsetting("color-scheme");
        if (scheme) theme.dark = scheme === "prefer-dark" || (scheme !== "prefer-light" && theme.dark);
      }
    } else {
      const a = systemPreferences.getAccentColor?.();
      if (a && /^[0-9a-f]{6,8}$/i.test(a)) theme.accent = "#" + a.slice(0, 6);
    }
  } catch { /* use what we have */ }
  return theme;
}

/** Calls [cb] with the current theme now and whenever the system changes it. */
function watchSystemTheme(cb) {
  const push = () => cb(readSystemTheme());
  nativeTheme.on("updated", push);
  if (process.platform === "win32" || process.platform === "darwin") systemPreferences.on?.("accent-color-changed", push);
  if (process.platform === "linux") {
    const kde = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "kdeglobals");
    try { let t; fs.watch(kde, () => { clearTimeout(t); t = setTimeout(push, 400); }); } catch { /* not KDE */ }
  }
  return push;
}

module.exports = { readSystemTheme, watchSystemTheme };
