// Pager desktop shell: loads the bundled web client in a window, adds a tray icon, native notifications,
// an unread badge, close-to-tray and launch-at-login. Everything else is the shared web app.
const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, shell, session, nativeImage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

app.commandLine.appendSwitch("ozone-platform-hint", "auto"); // native Wayland when available

const prefsFile = path.join(app.getPath("userData"), "desktop.json");
const readPrefs = () => { try { return { closeToTray: true, startMinimized: false, ...JSON.parse(fs.readFileSync(prefsFile, "utf8")) }; } catch { return { closeToTray: true, startMinimized: false }; } };
let prefs = readPrefs();
const savePrefs = () => { try { fs.mkdirSync(path.dirname(prefsFile), { recursive: true }); fs.writeFileSync(prefsFile, JSON.stringify(prefs)); } catch { /* read-only profile */ } };

let win = null, tray = null, quitting = false, unread = 0;
const hidden = process.argv.includes("--hidden");

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: prefs.bounds?.width ?? 1180, height: prefs.bounds?.height ?? 760, x: prefs.bounds?.x, y: prefs.bounds?.y,
    minWidth: 360, minHeight: 500, show: false, autoHideMenuBar: true, backgroundColor: "#0b0e13", title: "Pager",
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, "app-dist", "index.html"));
  win.once("ready-to-show", () => { if (!(hidden || prefs.startMinimized) || !tray) win.show(); });

  // Links in messages open in the real browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:|^mailto:|^geo:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file:")) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });

  win.on("close", (e) => {
    prefs.bounds = win.getBounds(); savePrefs();
    if (!quitting && prefs.closeToTray && tray) { e.preventDefault(); win.hide(); }
  });
  win.on("closed", () => { win = null; });
}

function updateTray() {
  if (!tray) return;
  tray.setToolTip(unread ? `Pager — ${unread} unread` : "Pager");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: unread ? `Open Pager (${unread} unread)` : "Open Pager", click: showWindow },
    { type: "separator" },
    { label: "Quit", click: () => { quitting = true; app.quit(); } },
  ]));
}

const autostartFile = path.join(os.homedir(), ".config", "autostart", "pager.desktop");
function setAutostart(on) {
  if (process.platform === "linux") {
    if (!on) { try { fs.unlinkSync(autostartFile); } catch { /* already off */ } return; }
    const exec = process.env.APPIMAGE || process.execPath;
    fs.mkdirSync(path.dirname(autostartFile), { recursive: true });
    fs.writeFileSync(autostartFile, `[Desktop Entry]\nType=Application\nName=Pager\nExec="${exec}" --hidden\nIcon=pager\nX-GNOME-Autostart-enabled=true\n`);
  } else app.setLoginItemSettings({ openAtLogin: on, args: ["--hidden"] });
}
const getAutostart = () => (process.platform === "linux" ? fs.existsSync(autostartFile) : app.getLoginItemSettings().openAtLogin);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showWindow);

  app.whenReady().then(() => {
    const allowed = new Set(["notifications", "media", "geolocation", "clipboard-sanitized-write", "fullscreen"]);
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" }]));

    try { tray = new Tray(nativeImage.createFromPath(path.join(__dirname, "build", "tray.png")).resize({ width: 22, height: 22 })); tray.on("click", () => (win && win.isVisible() && win.isFocused() ? win.hide() : showWindow())); updateTray(); } catch { tray = null; }
    createWindow();

    // Test hooks: PAGER_SHOT=/path/out.png renders the window once, saves a screenshot and exits.
    // PAGER_EVAL runs a script in the page first (used by automated checks).
    if (process.env.PAGER_SHOT) {
      win.webContents.once("did-finish-load", async () => {
        if (process.env.PAGER_EVAL) { await new Promise((r) => setTimeout(r, 1500)); await win.webContents.executeJavaScript(process.env.PAGER_EVAL).catch(() => {}); }
        setTimeout(async () => {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(process.env.PAGER_SHOT, img.toPNG());
        quitting = true; app.quit();
        }, Number(process.env.PAGER_WAIT ?? 2500));
      });
    }
  });

  app.on("before-quit", () => { quitting = true; });
  app.on("activate", showWindow);
  app.on("window-all-closed", () => { if (process.platform !== "darwin" && (quitting || !prefs.closeToTray || !tray)) app.quit(); });

  ipcMain.on("notify", (_e, o) => {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title: String(o.title ?? "Pager"), body: String(o.body ?? ""), silent: !!o.silent, icon: path.join(__dirname, "build", "icon.png") });
    n.on("click", () => { showWindow(); if (o.roomId && win) win.webContents.send("open-room", o.roomId); });
    n.show();
  });
  ipcMain.on("badge", (_e, n) => { unread = Number(n) || 0; app.setBadgeCount(unread); updateTray(); });
  ipcMain.handle("autostart:get", getAutostart);
  ipcMain.on("autostart:set", (_e, on) => setAutostart(!!on));
  ipcMain.on("prefs", (_e, p) => { prefs = { ...prefs, ...p }; savePrefs(); });
}
