// Draws the Pager logo as PNGs (no image libraries needed): build/icon.png (512) and build/tray.png (64).
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };

// Signed distance to a rounded rectangle; negative inside.
const rr = (x, y, x0, y0, x1, y1, r) => { const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hx = (x1 - x0) / 2 - r, hy = (y1 - y0) / 2 - r; const dx = Math.abs(x - cx) - hx, dy = Math.abs(y - cy) - hy; return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r; };

function logo(size, { teal = [20, 184, 166], ink = [4, 32, 28] } = {}) {
  const s = size, px = Buffer.alloc((s * 4 + 1) * s);
  const u = s / 512;
  for (let y = 0; y < s; y++) {
    px[y * (s * 4 + 1)] = 0;
    for (let x = 0; x < s; x++) {
      // 4x4 supersampling for smooth edges
      let a = 0, bar = 0;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const fx = x + (i + 0.5) / 4, fy = y + (j + 0.5) / 4;
        if (rr(fx, fy, 0, 0, s, s, 112 * u) <= 0) {
          a++;
          if (rr(fx, fy, 150 * u, 168 * u, 362 * u, 208 * u, 20 * u) <= 0 || rr(fx, fy, 150 * u, 236 * u, 362 * u, 276 * u, 20 * u) <= 0 || rr(fx, fy, 150 * u, 304 * u, 278 * u, 344 * u, 20 * u) <= 0) bar++;
        }
      }
      const o = y * (s * 4 + 1) + 1 + x * 4;
      const cov = a / 16, t = a ? bar / a : 0;
      px[o] = Math.round(teal[0] * (1 - t) + ink[0] * t); px[o + 1] = Math.round(teal[1] * (1 - t) + ink[1] * t); px[o + 2] = Math.round(teal[2] * (1 - t) + ink[2] * t); px[o + 3] = Math.round(255 * cov);
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(s, 0); ihdr.writeUInt32BE(s, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(px)), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync("build", { recursive: true });
writeFileSync("build/icon.png", logo(512));
writeFileSync("build/tray.png", logo(64));
console.log("wrote build/icon.png and build/tray.png");
