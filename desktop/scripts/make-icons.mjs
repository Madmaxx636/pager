// Draws every Pager icon from the master drawings in ../brand with resvg (no browser or image tools needed):
//   build/icon.png  512px app icon     build/tray.png  64px tray icon (the character on transparent)
//   ../app/public/icon-192.png, icon-512.png, apple-touch-icon.png (180)
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const brand = join(here, "..", "..", "brand");
const jobs = [
  ["pager-mascot.svg", join(here, "..", "build", "icon.png"), 512],
  ["pager-character.svg", join(here, "..", "build", "tray.png"), 64],
  ["pager-mascot.svg", join(here, "..", "..", "app", "public", "icon-192.png"), 192],
  ["pager-mascot.svg", join(here, "..", "..", "app", "public", "icon-512.png"), 512],
  ["pager-mascot.svg", join(here, "..", "..", "app", "public", "apple-touch-icon.png"), 180],
];
for (const [src, out, size] of jobs) {
  const png = new Resvg(readFileSync(join(brand, src)), { fitTo: { mode: "width", value: size } }).render().asPng();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, png);
}
console.log("icons written");
