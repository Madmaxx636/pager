// Fails the build if main.js or preload.js load a local file that electron-builder wouldn't package.
import { readFileSync } from "node:fs";
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
const listed = new Set(pkg.build.files);
let bad = 0;
for (const f of ["main.js", "preload.js", "system-theme.js", "updater.js"]) {
  const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
  for (const m of src.matchAll(/require\("\.\/([^"]+)"\)/g)) {
    const need = m[1].endsWith(".js") ? m[1] : m[1] + ".js";
    if (!listed.has(need)) { console.error(`${f} requires ./${need} but it is not in build.files`); bad++; }
  }
}
process.exit(bad ? 1 : 0);
