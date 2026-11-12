// The situations that go wrong in real use, run against the long history (see history.mjs) in the real app as the desktop shell.
//   node e2e/scenarios.mjs [asleep|restart|trim|send|all]
import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fakeDesktop } from "./tests/fake-desktop.mjs";

process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE ??= "ubuntu24.04-x64";
const state = resolve(import.meta.dirname, ".state"), shots = resolve(state, "shots"); mkdirSync(shots, { recursive: true });
const hist = JSON.parse(readFileSync(resolve(state, "history.json")));
const NAME = "Taylor Brooks", room = hist.find((c) => c.name === NAME).room;
const WEB = "http://127.0.0.1:18081", HS = "http://127.0.0.1:18008/_matrix/client/v3";
const day = (t) => new Date(t).toISOString().slice(5, 16).replace("T", " ");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const login = async (u) => (await (await fetch(`${HS}/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "m.login.password", identifier: { type: "m.id.user", user: u }, password: `pw-${u}` }) })).json()).access_token;

/** Everything the server holds for the chat right now, oldest first: [{ id, ts }]. */
async function truth() {
  const t = await login("alice"); let from = "", out = [];
  for (;;) {
    const r = await (await fetch(`${HS}/rooms/${encodeURIComponent(room)}/messages?dir=b&limit=1000${from ? "&from=" + from : ""}`, { headers: { authorization: `Bearer ${t}` } })).json();
    for (const e of r.chunk) if (e.type === "m.room.message" && !e.content["m.relates_to"]?.rel_type) out.push({ id: e.event_id, ts: e.origin_server_ts });
    if (!r.end || !r.chunk.length) break; from = r.end;
  }
  return out.reverse();
}
const says = async (user, body, n = 1) => { const t = await login(user); for (let i = 0; i < n; i++) await fetch(`${HS}/rooms/${encodeURIComponent(room)}/send/m.room.message/s${Date.now()}${Math.random().toString(36).slice(2)}`, { method: "PUT", headers: { authorization: `Bearer ${t}`, "content-type": "application/json" }, body: JSON.stringify({ msgtype: "m.text", body: `${body} ${i + 1}` }) }); };

const browser = await chromium.launch();
/** The first-run screens that cover the page: the recovery key to save, the welcome tour, and whatever else asks for attention. */
async function clearOverlays(page) {
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(700);
    const key = page.locator(".modal, [role=dialog], .overlay").filter({ hasText: "recovery key" }).first();
    if (await key.isVisible().catch(() => false)) {
      await key.getByLabel("I saved my recovery key").check({ timeout: 1500 }).catch(() => {});
      await key.getByRole("button", { name: /^Done$|^Close$|^Cancel$|^Later$|^Not now$/ }).first().click({ timeout: 1500 }).catch(() => {});
      continue;
    }
    if (await page.getByRole("button", { name: "Skip tour" }).isVisible().catch(() => false)) { await page.getByRole("button", { name: "Skip tour" }).click().catch(() => {}); continue; }
    if (await page.locator(".overlay").first().isVisible().catch(() => false)) { await page.keyboard.press("Escape"); continue; }
    break;
  }
}
async function newApp(context) {
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("  PAGE ERROR:", String(e).slice(0, 160)));
  page.on("console", (m) => { if (m.text().startsWith("DBG")) console.log("  ", m.text()); });
  await page.goto(WEB);
  if (await page.getByLabel("Username").isVisible({ timeout: 4000 }).catch(() => false)) {
    await page.getByLabel("Username").fill("alice"); await page.locator('input[type="password"]').fill("pw-alice"); await page.getByRole("button", { name: "Sign in" }).click();
  }
  await page.locator(".chat-row").first().waitFor({ timeout: 60000 });
  await clearOverlays(page);
  return page;
}
const shown = (page) => page.evaluate(() => [...document.querySelectorAll(".timeline .msg[data-id]")].map((m) => m.dataset.id));
const view = (page) => page.evaluate(() => { const el = document.querySelector(".timeline"); return el ? { top: Math.round(el.scrollTop), fromBottom: Math.round(el.scrollHeight - el.scrollTop - el.clientHeight), count: el.querySelectorAll(".msg[data-id]").length } : null; });

/** Compares what is showing with the server: the stretch from the page's oldest to newest message, and what is missing in it. */
function compare(ids, all, label) {
  const pos = new Map(all.map((m, i) => [m.id, i])), have = new Set(ids), idx = ids.map((i) => pos.get(i)).filter((i) => i != null);
  if (!idx.length) { console.log(`  ${label}: nothing from the server is showing`); return { missing: 0 }; }
  const lo = Math.min(...idx), hi = Math.max(...idx), gaps = []; let run = -1;
  for (let i = lo; i <= hi; i++) { const miss = !have.has(all[i].id); if (miss && run < 0) run = i; if ((!miss || i === hi) && run >= 0) { const end = miss ? i : i - 1; gaps.push({ n: end - run + 1, from: day(all[run].ts), to: day(all[end].ts) }); run = -1; } }
  const newestMissing = all.length - 1 - hi;
  console.log(`  ${label}: showing ${idx.length} messages, ${day(all[lo].ts)} to ${day(all[hi].ts)}; ${gaps.length ? `GAPS: ${gaps.map((g) => `${g.n} missing ${g.from}..${g.to}`).slice(0, 8).join("; ")}` : "no gaps inside"}${newestMissing ? `; the ${newestMissing} newest on the server are NOT showing` : ""}`);
  return { missing: gaps.reduce((a, g) => a + g.n, 0) + newestMissing, gaps };
}
async function scrollUp(page, maxSteps = 700) {
  await page.mouse.move(600, 380); let still = 0, last = "";
  for (let i = 0; i < maxSteps; i++) {
    await page.mouse.wheel(0, -700); await page.waitForTimeout(70);
    const v = await view(page); const key = `${v.top}/${v.count}`; still = key === last ? still + 1 : 0; last = key; if (v.top === 0 && still >= 14) break;
  }
  await page.waitForTimeout(1200);
}
const openChat = async (page) => { await page.locator(".chat-row", { hasText: NAME }).first().click(); await page.waitForTimeout(2500); };

const which = process.argv[2] ?? "all";
const run = (n) => which === "all" || which === n;

if (run("asleep")) {
  console.log("\n== The app is open on the chat, the computer sleeps, 150 messages arrive, the app wakes");
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 760 } }); await fakeDesktop(ctx, "linux");
  const page = await newApp(ctx); await openChat(page);
  console.log("  before:", JSON.stringify(await view(page)));
  await ctx.setOffline(true); await says("taylor", "while you were away", 150); await sleep(500); await ctx.setOffline(false);
  await page.waitForTimeout(8000);
  let all = await truth(), ids = await shown(page);
  console.log("  just after waking:", JSON.stringify(await view(page)));
  compare(ids, all, "right after waking");
  await scrollUp(page, 120);
  compare(await shown(page), all, "after scrolling up a good way");
  await scrollUp(page); compare(await shown(page), all, "after scrolling to the very top");
  await page.screenshot({ path: `${shots}/s-asleep.png` });
  await ctx.close();
}

if (run("restart")) {
  console.log("\n== The app is closed and opened again (it starts from its saved copy), after new messages arrived");
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 760 } }); await fakeDesktop(ctx, "linux");
  let page = await newApp(ctx); await openChat(page); await scrollUp(page, 60); await sleep(4000);   // lets the saved copy be written
  await page.close();
  await says("taylor", "after you closed it", 90);
  page = await newApp(ctx);
  await page.waitForTimeout(3000);
  let all = await truth();
  await openChat(page);
  console.log("  opened:", JSON.stringify(await view(page)));
  compare(await shown(page), all, "right after opening");
  await scrollUp(page, 100); compare(await shown(page), all, "after scrolling up a good way");
  await scrollUp(page); compare(await shown(page), all, "after scrolling to the very top");
  await ctx.close();
}

if (run("trim")) {
  console.log("\n== The app lets go of old history to save memory (window hidden in the tray, then shown), then you scroll up again");
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 760 } }); await fakeDesktop(ctx, "linux");
  const page = await newApp(ctx); await openChat(page); await scrollUp(page, 150);
  let all = await truth(); console.log("  before:", JSON.stringify(await view(page)));
  await page.locator(".chat-row", { hasText: "Family group" }).first().click(); await sleep(600);        // leave the chat
  await page.evaluate(() => window.__memory?.("hidden")); await sleep(800); await page.evaluate(() => window.__memory?.("ok"));
  await openChat(page);
  console.log("  after the squeeze and coming back:", JSON.stringify(await view(page)));
  compare(await shown(page), all, "right after coming back");
  await scrollUp(page, 100); compare(await shown(page), all, "after scrolling up a good way");
  await scrollUp(page); compare(await shown(page), all, "after scrolling to the very top");
  await ctx.close();
}

if (run("burst")) {
  console.log("\n== You are reading old messages, scrolled well back; a burst of new messages arrives (more than one sync can carry)");
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 760 } }); await fakeDesktop(ctx, "linux");
  const page = await newApp(ctx); await openChat(page); await scrollUp(page, 120);
  await page.mouse.move(600, 380); await page.mouse.wheel(0, 3000); await sleep(800);          // a little way back down: reading, not at the top
  const anchorOf = () => page.evaluate(() => { const el = document.querySelector(".timeline"), vr = el.getBoundingClientRect(); const m = [...el.querySelectorAll(".msg[data-id]")].find((x) => x.getBoundingClientRect().top > vr.top + 100); return m ? { id: m.dataset.id, text: (m.innerText || "").slice(0, 40).replace(/\n/g, " "), y: Math.round(m.getBoundingClientRect().top - vr.top) } : null; });
  const a0 = await anchorOf(); console.log("  reading:", JSON.stringify(await view(page)), "message in view:", JSON.stringify(a0));
  await ctx.setOffline(true); await says("taylor", "burst", 40); await sleep(300); await ctx.setOffline(false);   // all at once, as after a bad connection or sleep
  for (const ms of [300, 700, 1500, 3000, 5000, 9000]) {
    await sleep(ms === 300 ? 300 : ms - ms / 2);
    const v = await view(page), a = await anchorOf();
    const same = a && a0 && a.id === a0.id;
    console.log(`  +${ms}ms:`, JSON.stringify(v), same ? `same message still in view, moved ${a.y - a0.y}px` : `the message you were reading is GONE from the page (now showing: ${a ? a.text : "nothing"})`);
  }
  compare(await shown(page), await truth(), "afterwards");
  await ctx.close();
}

if (run("drift")) {
  console.log("\n== Reading slowly through a media-heavy stretch: how often does the page move by more than the scroll itself?");
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 760 } }); await fakeDesktop(ctx, "linux");
  const page = await newApp(ctx); await openChat(page); await scrollUp(page, 40);
  await page.mouse.move(600, 380);
  const probe = () => page.evaluate(() => { const el = document.querySelector(".timeline"), vr = el.getBoundingClientRect(); const ms = [...el.querySelectorAll(".msg[data-id]")].filter((x) => { const r = x.getBoundingClientRect(); return r.top > vr.top + 40 && r.bottom < vr.bottom - 40; }); const m = ms[Math.floor(ms.length / 2)]; return m ? { id: m.dataset.id, y: m.getBoundingClientRect().top - vr.top, top: el.scrollTop, h: el.scrollHeight } : null; });
  const deviations = [];
  for (let i = 0; i < 160; i++) {
    const a = await probe(); if (!a) continue;
    await page.mouse.wheel(0, -120); await page.waitForTimeout(140);
    const b = await page.evaluate((id) => { const el = document.querySelector(".timeline"), vr = el.getBoundingClientRect(); const m = el.querySelector(`.msg[data-id="${CSS.escape(id)}"]`); return m ? { y: m.getBoundingClientRect().top - vr.top, top: el.scrollTop, h: el.scrollHeight } : null; }, a.id);
    if (!b) continue;
    const moved = b.y - a.y;                                                // each step is one wheel click of 120px: the message should move down by exactly that
    const off = Math.round(moved - 120);
    if (Math.abs(off) > 4) deviations.push({ step: i, off, heightChange: Math.round(b.h - a.h) });
  }
  console.log(`  160 slow steps: ${deviations.length} times the page moved on its own (more than 4px); biggest ${deviations.length ? Math.max(...deviations.map((d) => Math.abs(d.off))) : 0}px`);
  for (const d of deviations.slice(0, 12)) console.log("    ", JSON.stringify(d));
  await ctx.close();
}

if (run("stall")) {
  console.log("\n== After history was let go (or after a restart), scroll to the top of what is there and keep scrolling: how long until older messages appear?");
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 760 } }); await fakeDesktop(ctx, "linux");
  const page = await newApp(ctx); await openChat(page); await scrollUp(page, 40);
  await page.locator(".chat-row", { hasText: "Family group" }).first().click(); await sleep(600);
  await page.evaluate(() => window.__memory?.("hidden")); await sleep(800); await page.evaluate(() => window.__memory?.("ok"));
  await openChat(page);
  const requests = []; page.on("request", (r) => { if (/\/messages\?/.test(r.url())) requests.push(r.url().includes("from=") ? "page" : "?"); });
  const first = await view(page); console.log("  after coming back:", JSON.stringify(first));
  await page.mouse.move(600, 380);
  const t0 = Date.now(); let grew = null;
  for (let i = 0; i < 60; i++) {
    await page.mouse.wheel(0, -900); await page.waitForTimeout(250);
    const v = await view(page);
    if (v.count > first.count + 5 && grew == null) { grew = { after: Date.now() - t0, steps: i + 1, count: v.count }; }
  }
  const end = await view(page);
  console.log(`  first older message appeared ${grew ? `after ${grew.after}ms and ${grew.steps} scroll steps (${first.count} -> ${grew.count})` : "NEVER in 15 seconds of scrolling"}; page requests made: ${requests.length}; final count ${end.count}`);
  await ctx.close();
}

if (run("unread")) {
  console.log("\n== With 'Open at first unread' on: open a chat that has more unread messages than are loaded, then send a message");
  await says("taylor", "unread for the test", 150);        // alice has not seen these: more unread than the page loads first
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 760 } }); await fakeDesktop(ctx, "linux");
  await ctx.addInitScript(() => { try { const k = "pager.settings", cur = JSON.parse(localStorage.getItem(k) || "{}"); localStorage.setItem(k, JSON.stringify({ ...cur, openAtUnread: true })); } catch { /* none */ } });
  const page = await newApp(ctx); await page.waitForTimeout(1500);
  console.log("  list row:", (await page.locator(".chat-row", { hasText: NAME }).first().innerText()).replace(/\n/g, " | ").slice(0, 120), "  setting:", await page.evaluate(() => (JSON.parse(localStorage.getItem("pager.settings") || "{}")).openAtUnread));
  const firstUnread = (await truth()).find((m) => m.ts >= Date.now() - 20_000)?.id ?? "";   // the first of the 150 just sent
  await page.locator(".chat-row", { hasText: NAME }).first().click();
  const where = () => page.evaluate((fu) => { const el = document.querySelector(".timeline"), vr = el.getBoundingClientRect(); const d = el.querySelector("#unread-divider"); const f = el.querySelector(`.msg[data-id="${CSS.escape(fu)}"]`); const vis = [...el.querySelectorAll(".msg[data-id]")].filter((m) => { const r = m.getBoundingClientRect(); return r.bottom > vr.top && r.top < vr.bottom; }); return { count: el.querySelectorAll(".msg[data-id]").length, fromBottom: Math.round(el.scrollHeight - el.scrollTop - el.clientHeight), divider: d ? Math.round(d.getBoundingClientRect().top - vr.top) : null, firstUnreadLoaded: !!f, firstUnreadY: f ? Math.round(f.getBoundingClientRect().top - vr.top) : null, newestInView: vis.some((m) => m === el.querySelector(".msg[data-id]:last-of-type")) }; }, firstUnread);
  for (const ms of [200, 600, 1500, 3000, 6000]) { await page.waitForTimeout(ms === 200 ? 200 : ms / 2); console.log(`  ${ms}ms after opening:`, JSON.stringify(await where())); }
  const box = page.getByPlaceholder(/Message|Add a message/); await box.click(); await box.fill("sending from the unread position"); await box.press("Enter");
  for (const ms of [200, 1500]) { await sleep(ms); console.log(`  ${ms}ms after sending:`, JSON.stringify(await where())); }
  await ctx.close();
}

if (run("away")) {
  const N = Number(process.env.AWAY ?? 2500);
  console.log(`\n== The app is closed, ${N} messages arrive (more than the app fills in by itself), the app is opened again, and you scroll up`);
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 760 } }); await fakeDesktop(ctx, "linux");
  let page = await newApp(ctx); await openChat(page); await scrollUp(page, 40); await sleep(4500);    // lets the saved copy be written
  await page.close();
  const t = await login("taylor");
  for (let i = 0; i < N; i += 25) await Promise.all(Array.from({ length: Math.min(25, N - i) }, (_, k) => fetch(`${HS}/rooms/${encodeURIComponent(room)}/send/m.room.message/aw${Date.now()}${i}${k}`, { method: "PUT", headers: { authorization: `Bearer ${t}`, "content-type": "application/json" }, body: JSON.stringify({ msgtype: "m.text", body: `while closed ${i + k + 1}` }) })));
  page = await newApp(ctx); await page.waitForTimeout(6000);
  const all = await truth();
  await openChat(page);
  console.log("  opened:", JSON.stringify(await view(page)));
  compare(await shown(page), all, "right after opening");
  await page.waitForTimeout(8000); compare(await shown(page), all, "8 seconds later (the hole is being filled)");
  await scrollUp(page, 60); compare(await shown(page), all, "after scrolling up a good way");
  await scrollUp(page, 600); compare(await shown(page), all, "after scrolling to the very top");
  await ctx.close();
}

if (run("send")) {
  console.log("\n== Open the chat, scroll around, send a message: where does the page go?");
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 760 } }); await fakeDesktop(ctx, "linux");
  const page = await newApp(ctx); await page.waitForTimeout(1500);
  await page.locator(".chat-row", { hasText: NAME }).first().click();
  for (const ms of [200, 800, 2500, 6000]) { await page.waitForTimeout(ms === 200 ? 200 : ms - 0); console.log(`  ${ms}ms after opening:`, JSON.stringify(await view(page))); }
  await page.mouse.move(600, 380); await page.mouse.wheel(0, -2500); await sleep(1500);
  const before = await view(page); console.log("  scrolled up a little:", JSON.stringify(before));
  const box = page.getByPlaceholder(/Message|Add a message/); await box.click(); await box.fill("testing the scroll"); await box.press("Enter");
  for (const ms of [100, 500, 1500, 4000]) { await sleep(ms); console.log(`  ${ms}ms after sending:`, JSON.stringify(await view(page))); }
  await ctx.close();
}
await browser.close();
