// Renders an SVG to a PNG with Electron's own renderer (no image libraries needed).
// Usage: npx electron scripts/render-svg.cjs in.svg out.png size [--bg=transparent|#hex]
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const [, , input, output, sizeArg] = process.argv.filter((a) => !a.startsWith("--") || a.startsWith("--bg"));
const size = Number(sizeArg || 512);
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const svg = fs.readFileSync(input, "utf8");
  const win = new BrowserWindow({ width: size, height: size, show: true, transparent: true, frame: false, webPreferences: { offscreen: false } });
  const html = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`;
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
  fs.writeFileSync(output, img.toPNG());
  app.quit();
});
