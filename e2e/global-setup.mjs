// Before the tests: start from fresh data (opening a chat marks it read, sending adds messages, so a second run would see a different server), start the
// stack and seed it. The stack is left running afterwards; `npm run down` stops it. E2E_KEEP=1 skips the reset (to look at the same server by hand).
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
export default function setup() {
  const run = (step) => execFileSync(process.execPath, [resolve(import.meta.dirname, "stack.mjs"), step], { stdio: "inherit" });
  if (!process.env.E2E_KEEP) run("reset");
  run("up"); run("seed");
}
