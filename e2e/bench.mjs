// The test bench: the real desktop app (Electron, the same main process and window as the one you install) on a test server, with a stand-in for a bridge sending
// every kind of traffic into the open chat, while every painted frame of the message list is recorded together with what changed in the page in that frame.
//   node e2e/stack.mjs up && HISTORY_SCALE=0.3 node e2e/stack.mjs history      once (a test server with months of chats)
//   node e2e/bench.mjs [phase,phase...]                                          a Pager window opens on this desktop for a few minutes (its own profile: your Pager is untouched)
// A "snap" is a frame in which the list moved UP while it sat at the bottom (the page jumped back toward older messages), or ended a frame off the bottom.
import { _electron as electron } from "@playwright/test";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { bridgeSim } from "./bridge-sim.mjs";

const ENCRYPTED = process.env.BENCH_ENCRYPTED === "1";      // an encrypted chat instead of the plain one (run it through tsx, see encrypted-sim.mjs)

process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE ??= "ubuntu24.04-x64";
const root = resolve(import.meta.dirname, ".."), desktop = resolve(root, "desktop");
const hist = ENCRYPTED ? [] : JSON.parse(readFileSync(resolve(import.meta.dirname, ".state/history.json")));
const NAME = ENCRYPTED ? "Secure Sam" : process.env.BENCH_CHAT ?? "Taylor Brooks", room = ENCRYPTED ? "" : hist.find((c) => c.name === NAME).room;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the app: the current web build, in the desktop shell, with a profile of its own ----
cpSync(resolve(root, "app/dist"), resolve(desktop, "app-dist"), { recursive: true });
const profile = mkdtempSync(resolve(tmpdir(), "pager-bench-"));
const app = await electron.launch({ executablePath: resolve(desktop, "node_modules/electron/dist/electron"), args: ["--no-sandbox", "--ozone-platform=x11", `--user-data-dir=${profile}`, desktop], cwd: desktop });
const page = await app.firstWindow();
page.on("pageerror", (e) => console.log("  PAGE ERROR:", String(e).slice(0, 200)));
// (out of the way: a fixed place near the corner, and the focus handed straight back to whatever you were using)
await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setBounds({ x: 20, y: 20, width: 1180, height: 800 }); w.blur(); });
await page.waitForLoadState("domcontentloaded");
await page.evaluate(() => { localStorage.setItem("pager.server", "http://127.0.0.1:18081"); });
await page.reload(); await page.waitForTimeout(1500);
await page.getByLabel("Username").fill("alice"); await page.locator('input[type="password"]').fill("pw-alice"); await page.getByRole("button", { name: "Sign in" }).click();
await page.locator(".chat-row").first().waitFor({ timeout: 90_000 });
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(700);
  const key = page.locator(".modal, [role=dialog], .overlay").filter({ hasText: "recovery key" }).first();
  if (await key.isVisible().catch(() => false)) { await key.getByLabel("I saved my recovery key").check({ timeout: 1500 }).catch(() => {}); await key.getByRole("button", { name: /^Done$|^Close$|^Cancel$|^Later$|^Not now$/ }).first().click({ timeout: 1500 }).catch(() => {}); continue; }
  if (await page.getByRole("button", { name: "Skip tour" }).isVisible().catch(() => false)) { await page.getByRole("button", { name: "Skip tour" }).click().catch(() => {}); continue; }
  break;
}
let sim;
if (ENCRYPTED) {
  const { encryptedSim } = await import("./encrypted-sim.mjs");
  const es = await encryptedSim(NAME);
  // what an encrypted bridge cannot do here is stubbed by a plain text message of the same shape
  sim = { ...es, video: () => es.text("[a video]"), music: () => es.text("[a song]"), file: () => es.text("[a file]"), location: () => es.text("[a location]"), redact: () => es.text("[deleted]"), status: () => es.text("[status]"), profile: () => es.text("[new name]") };
  await page.locator(".chat-row", { hasText: NAME }).first().waitFor({ timeout: 30_000 });
  for (let i = 1; i <= 40; i++) await es.text(`earlier message ${i}, so there is a page to scroll`);
  await page.waitForTimeout(2000);
}
await page.locator(".chat-row", { hasText: NAME }).first().click();
await page.waitForTimeout(2500);
if (!ENCRYPTED) sim = await bridgeSim(room);

// ---- the recorder: one sample per painted frame, with the changes the page made in that frame ----
await page.evaluate(() => {
  const el = document.querySelector(".timeline"), w = (window.__bench = { frames: [], on: false, pending: [] });
  const desc = (n) => { if (n.nodeType === 3) return "text"; const e = n; const c = typeof e.className === "string" ? e.className.split(" ").filter(Boolean).slice(0, 3).join(".") : ""; return `${e.tagName.toLowerCase()}${c ? "." + c : ""}`; };
  new MutationObserver((ms) => {
    if (!w.on) return;
    for (const m of ms) {
      if (m.type === "childList") { for (const n of m.addedNodes) w.pending.push("+" + desc(n)); for (const n of m.removedNodes) w.pending.push("-" + desc(n)); }
      else if (m.type === "attributes") w.pending.push(`~${desc(m.target)}[${m.attributeName}]`);
      else w.pending.push("~text");
    }
  }).observe(el, { subtree: true, childList: true, attributes: true, characterData: true, attributeFilter: ["class", "style", "src"] });
  el.addEventListener("load", (e) => { if (w.on) w.pending.push("load:" + desc(e.target)); }, true);
  const ch = new MessageChannel();
  ch.port1.onmessage = () => {   // runs just after a frame has been drawn: this is what was on screen
    if (!w.on) return;
    const t = performance.now();
    const hs = {}; for (const m of [...el.querySelectorAll(".msg[data-id]")].slice(-14)) hs[m.dataset.id.slice(1, 7)] = [Math.round(m.getBoundingClientRect().height), Math.round(m.getBoundingClientRect().top - el.getBoundingClientRect().top), (m.querySelector(".bubble")?.innerText || m.className).trim().replace(/\s+/g, " ").slice(0, 16)];
    w.frames.push({ t, hs, top: Math.round(el.scrollTop), fb: Math.round(el.scrollHeight - el.scrollTop - el.clientHeight), sh: el.scrollHeight, ch: el.clientHeight, ev: w.pending.splice(0, w.pending.length).slice(0, 8) });
  };
  const tick = () => { ch.port2.postMessage(0); requestAnimationFrame(tick); }; requestAnimationFrame(tick);
});
const atBottom = async () => { await page.mouse.move(500, 380); for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 4000); await page.waitForTimeout(90); } await page.waitForTimeout(500); };
const upBy = async (px) => { await atBottom(); await page.mouse.wheel(0, -px); await page.waitForTimeout(600); };

/** Runs [action] with the recorder on; returns what happened: the frames where the list went up while it sat at the bottom, or was left off the bottom. */
async function run(name, action, { reading = false, settle = 2200, shrinks = false } = {}) {
  await page.evaluate(() => { window.__bench.frames = []; window.__bench.pending = []; window.__bench.on = true; });
  await action(); await sleep(settle);
  const f = await page.evaluate(() => { window.__bench.on = false; return window.__bench.frames; });
  const problems = [];
  for (let i = 1; i < f.length; i++) {
    const a = f[i - 1], b = f[i];
    if (reading) { if (Math.abs(b.top - f[0].top) > 1) problems.push({ i, kind: "moved while reading", from: a.top, to: b.top, ev: b.ev }); continue; }
    // What you see: the newest message that is on the page in both frames. New content arriving below makes it slide UP (normal). If it slides DOWN, the page snapped up.
    const common = Object.keys(b.hs).filter((k) => a.hs[k]).pop();
    if (!shrinks && common && a.fb <= 2) {
      const dy = b.hs[common][1] - a.hs[common][1];
      if (dy > 3) problems.push({ i, kind: "SNAP UP (a message slid down)", by: dy, ev: b.ev, was: a.ev, size: `view ${a.ch}→${b.ch}px, content ${a.sh}→${b.sh}px; heights that changed: ${JSON.stringify(Object.keys({ ...a.hs, ...b.hs }).filter((k) => (a.hs[k]?.[0]) !== (b.hs[k]?.[0])).map((k) => `"${(b.hs[k] ?? a.hs[k])[2]}": ${a.hs[k]?.[0] ?? "-"}→${b.hs[k]?.[0] ?? "-"}`))}` });
    }
    if (a.fb <= 2 && b.fb > 2 && b.top === a.top && b.sh > a.sh) problems.push({ i, kind: "left off the bottom", by: b.fb, ev: b.ev });
  }
  const tops = f.map((x) => x.top).filter((v, i, arr) => i === 0 || v !== arr[i - 1]);
  console.log(`${problems.length ? "✘" : "✓"} ${name.padEnd(46)} ${f.length} frames; list position ${tops.slice(0, 10).join(" → ")}${tops.length > 10 ? " …" : ""}${problems.length ? "" : ""}`);
  for (const p of problems.slice(0, 4)) console.log(`     ${p.kind}${p.by ? ` by ${p.by}px` : ""} in frame ${p.i}: page changes then: ${JSON.stringify(p.ev)}${p.was?.length ? `; the frame before: ${JSON.stringify(p.was)}` : ""}${p.size ? `; ${p.size}` : ""}`);
  return problems;
}

const phases = {
  async basics() {
    await atBottom();
    await run("text, one line", () => sim.text("a short one"));
    await run("text, several lines", () => sim.text("line one\nline two\nline three\n\nand a fifth"));
    await run("text, very long paragraph", () => sim.text("this is a long paragraph that wraps over several lines ".repeat(8)));
    await run("text, only an emoji (shown big)", () => sim.text("😂"));
    await run("text with a link", () => sim.text("look at https://example.com/some/long/path?with=query&and=more please"));
    await run("two messages one after the other", async () => { await sim.text("first of two"); await sim.text("second of two"); });
  },
  async media() {
    await atBottom();
    await run("picture, size given", () => sim.image(0));
    await run("picture, no size", () => sim.image(1, { size: false }));
    await run("picture with a caption", () => sim.image(2, { caption: "a caption under the picture" }));
    await run("tall picture, size given", () => sim.image(1));
    await run("video, size given", () => sim.video(0));
    await run("video, no size", () => sim.video(1, { size: false }));
    await run("voice message", () => sim.voice(2));
    await run("music file", () => sim.music(1));
    await run("file", () => sim.file());
    await run("location", () => sim.location());
  },
  async extras() {
    await atBottom();
    const last = async () => page.evaluate(() => [...document.querySelectorAll(".timeline .msg[data-id]")].pop()?.dataset.id);
    const mine = async () => { const b = page.getByPlaceholder(/Message|Add a message/); await b.fill("my own message to hang things on"); await b.press("Enter"); await sleep(1500); return last(); };
    let id = await sim.text("a message to react to"); await sleep(1200);
    await run("a reaction on the newest message", () => sim.react(id, "👍"));
    await run("a second reaction on it", () => sim.react(id, "❤️", "alice"));
    await run("an edit that makes it longer", () => sim.edit(id, "a message to react to, now with a good deal more words in it than before, enough to wrap"));
    await run("an edit that makes it shorter (the message really shrinks)", () => sim.edit(id, "short"), { shrinks: true });
    id = await sim.text("this one is about to be deleted"); await sleep(1200);
    await run("the newest message being deleted (the list really shrinks)", () => sim.redact(id), { shrinks: true });
    await run("typing, then the message, then typing stops", async () => { await sim.typing(true); await sleep(1500); await sim.text("after the dots"); await sleep(300); await sim.typing(false); });
    await run("typing that stops without a message", async () => { await sim.typing(true); await sleep(1500); await sim.typing(false); });
    const m = await mine();
    await run("the other person reads my message", () => sim.read(m));
    await run("a delivery report on my message", () => sim.status(m));
    await run("the other person's name changes", () => sim.profile("Taylor B. (new name)"));
    await run("a reply to an older message", async () => { const ids = await page.evaluate(() => [...document.querySelectorAll(".timeline .msg[data-id]")].map((x) => x.dataset.id)); await sim.reply(ids[Math.max(0, ids.length - 30)], "replying to something from a while ago"); });
  },
  async probe() {
    await atBottom();
    const look = (label) => page.evaluate((l) => { const m = [...document.querySelectorAll(".timeline .msg[data-id]")].pop(); const v = m.querySelector("video, .media, .poster, .video-box, [class*=video]"); return `${l}: message ${Math.round(m.getBoundingClientRect().height)}px; classes ${[...m.querySelectorAll("*")].map((x) => x.className).filter((c) => typeof c === "string" && c).slice(0, 14).join(" | ")}`; }, label);
    await sim.video(1, { size: false }); await sleep(3000); console.log(await look("video (no size) after 3s"));
    await sim.text("a text after the video"); await sleep(300); await page.evaluate(() => {}); 
    const msgs = await page.evaluate(() => [...document.querySelectorAll(".timeline .msg[data-id]")].slice(-2).map((m) => `${Math.round(m.getBoundingClientRect().height)}px ${(m.querySelector(".bubble")?.innerText || "").trim().replace(/\s+/g, " ").slice(0, 24)}`));
    console.log("after the text arrived, last two messages:", JSON.stringify(msgs));
    const vid = await page.evaluate(() => { const m = [...document.querySelectorAll(".timeline .msg[data-id]")].slice(-2)[0]; return m.outerHTML.replace(/\s+/g, " ").slice(0, 900); });
    console.log("the video message now:", vid);
  },
  async reconnect() {
    await atBottom();
    const offline = (on) => app.context().setOffline(on);
    await run("connection drops 6s, 5 text messages wait, connection returns", async () => { await offline(true); await sleep(500); for (let i = 0; i < 5; i++) await sim.text(`waiting ${i + 1}`); await sleep(5500); await offline(false); }, { settle: 6000 });
    await run("connection drops 6s, 30 messages wait (more than one update carries)", async () => { await offline(true); await sleep(500); for (let i = 0; i < 30; i++) await sim.text(`piled up ${i + 1}`); await sleep(5000); await offline(false); }, { settle: 7000 });
    await run("connection drops, a mix of pictures, voice, typing and replies wait", async () => { await offline(true); await sleep(500); await sim.image(0, { size: false }); await sim.voice(1); await sim.typing(true); await sim.text("mixed 1"); await sim.image(2); await sim.text("mixed 2\nwith two lines"); await sim.typing(false); await sleep(5000); await offline(false); }, { settle: 7000 });
    const hide = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
    const show = () => app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.show(); w.focus(); });
    await run("window in the tray, connection drops, 12 messages wait, both come back", async () => { await hide(); await offline(true); await sleep(500); for (let i = 0; i < 12; i++) await sim.text(`tray ${i + 1}`); await sleep(4000); await offline(false); await sleep(3000); await show(); }, { settle: 6000 });
  },
  async window() {
    await atBottom();
    const hide = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
    const show = () => app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.show(); w.focus(); });
    const min = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
    const restore = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].restore());
    await run("window hidden (tray), 3 messages arrive, window comes back", async () => { await hide(); await sleep(800); for (let i = 0; i < 3; i++) { await sim.text(`while hidden ${i + 1}`); await sleep(400); } await show(); }, { settle: 3000 });
    await run("window minimised, a picture arrives, window restored (the window itself changes size)", async () => { await min(); await sleep(800); await sim.image(0, { size: false }); await sleep(800); await restore(); }, { settle: 3000, shrinks: true });
    await run("window behind another one (not focused), a message arrives", async () => { await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].blur()); await sleep(500); await sim.text("while not focused"); await sleep(600); await show(); }, { settle: 3000 });
  },
  async mixed() {
    await atBottom();
    await run("a burst of eight mixed messages within two seconds", async () => {
      const jobs = [() => sim.text("burst text"), () => sim.image(0, { size: false }), () => sim.voice(1), () => sim.text("another\nwith two lines"), () => sim.video(1), () => sim.text("😂😂"), () => sim.music(0), () => sim.text("last of the burst")];
      for (const j of jobs) { await j(); await sleep(250); }
    }, { settle: 3500 });
    await run("a long chat, one message every second for twenty seconds", async () => {
      for (let i = 0; i < 20; i++) { const k = i % 5; await (k === 0 ? sim.text(`steady ${i}`) : k === 1 ? sim.image(i % 6, { size: i % 2 === 0 }) : k === 2 ? sim.voice(i % 5) : k === 3 ? sim.text(`two\nlines ${i}`) : sim.reply(await page.evaluate(() => [...document.querySelectorAll(".timeline .msg[data-id]")].pop()?.dataset.id), `reply ${i}`)); await sleep(1000); }
    }, { settle: 3000 });
  },
  async reading() {
    await upBy(900);
    await run("reading higher up: text, pictures, voice, typing, edits arrive", async () => { await sim.text("while you read"); await sim.image(0, { size: false }); await sim.voice(0); await sim.typing(true); await sleep(1200); await sim.text("more"); await sim.typing(false); }, { reading: true, settle: 3000 });
  },
};

const wanted = (process.argv[2] ?? "basics,media,extras,window,mixed,reading").split(",");
let bad = 0;
for (const name of wanted) { console.log(`\n== ${name}`); const before = bad; await phases[name](); }
await app.close(); rmSync(profile, { recursive: true, force: true }); rmSync(resolve(desktop, "app-dist"), { recursive: true, force: true });
process.exit(0);
