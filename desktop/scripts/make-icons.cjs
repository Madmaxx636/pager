// Draws every Pager icon from the master drawings in ../brand using Electron's own renderer (no image libraries needed).
//   build/icon.png  512px app icon     build/tray.png  64px tray icon (the character on transparent)
//   ../app/public/icon-192.png, icon-512.png, apple-touch-icon.png (180)
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
app.commandLine.appendSwitch("no-sandbox");
app.disableHardwareAcceleration();
const brand = path.join(__dirname, "..", "..", "brand");
const jobs = [
  ["pager-mascot.svg", path.join(__dirname, "..", "build", "icon.png"), 512],
  ["pager-character.svg", path.join(__dirname, "..", "build", "tray.png"), 64],
  ["pager-mascot.svg", path.join(__dirname, "..", "..", "app", "public", "icon-192.png"), 192],
  ["pager-mascot.svg", path.join(__dirname, "..", "..", "app", "public", "icon-512.png"), 512],
  ["pager-mascot.svg", path.join(__dirname, "..", "..", "app", "public", "apple-touch-icon.png"), 180],
];
app.whenReady().then(async () => {
  for (const [src, out, size] of jobs) {
    const svg = fs.readFileSync(path.join(brand, src), "utf8");
    const win = new BrowserWindow({ width: size, height: size, show: true, transparent: true, frame: false, useContentSize: true });
    const html = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`;
    const file = path.join(require("node:os").tmpdir(), `pager-icon-${process.pid}.html`);
    fs.writeFileSync(file, html);
    console.log("loading", out); await win.loadFile(file); console.log("loaded");
    let png = Buffer.alloc(0);
    for (let tries = 0; tries < 6 && png.length < 200; tries++) {
      await new Promise((r) => setTimeout(r, 400));
      png = (await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })).toPNG();
    }
    if (png.length < 200) throw new Error(`could not draw ${out}`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, png);
    fs.unlinkSync(file);
    win.destroy();
  }
  console.log("icons written");
  app.quit();
});
