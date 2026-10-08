const { contextBridge, ipcRenderer } = require("electron");

// The only things the web app may ask the desktop shell to do.
contextBridge.exposeInMainWorld("pagerDesktop", {
  platform: process.platform,
  notify: (o) => ipcRenderer.send("notify", o),
  setBadge: (n) => ipcRenderer.send("badge", n),
  getAutostart: () => ipcRenderer.invoke("autostart:get"),
  setAutostart: (on) => ipcRenderer.send("autostart:set", on),
  setPrefs: (p) => ipcRenderer.send("prefs", p),
  cookieLogin: (spec) => ipcRenderer.invoke("cookie-login", spec),
  setZoom: (z) => ipcRenderer.send("zoom", z),
  onOpenRoom: (cb) => ipcRenderer.on("open-room", (_e, id) => cb(id)),
});
