// A small web server for tests: the built web app (app/dist) with the Matrix server under /_matrix and the Pager API under /api, all on one address,
// the way Caddy puts them together in a real install. Usage: node serve.mjs <port> <synapse port> <api port> [dist folder]
import { createServer, request } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const [port, synapse, api, dist = resolve(import.meta.dirname, "../app/dist")] = [Number(process.argv[2]), Number(process.argv[3]), Number(process.argv[4]), process.argv[5]];
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json", ".wasm": "application/wasm", ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".tsv": "text/tab-separated-values" };

const proxy = (req, res, to) => {
  const up = request({ host: "127.0.0.1", port: to, path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
  up.on("error", (e) => { res.writeHead(502); res.end(String(e.message)); });
  req.pipe(up);
};

createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (path.startsWith("/_matrix") || path.startsWith("/_synapse")) return proxy(req, res, synapse);
  if (path.startsWith("/api/")) return proxy(req, res, api);
  let file = normalize(join(dist, path));
  if (!file.startsWith(dist)) { res.writeHead(403); return res.end(); }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, "index.html");   // the app handles its own addresses
  res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`serving ${dist} on http://127.0.0.1:${port}`));
