import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fakeDesktop } from "./fake-desktop.mjs";
import { history } from "../history.mjs";
import { api, login } from "../lib.mjs";

// Long conversations (months of messages with pictures, videos, voice messages and music, built by history.mjs, smaller here): scrolling back through all of
// it, a burst of messages while you read far back, the app waking after sleep, the "New messages" line, and the page staying still under the reader.
test.describe.configure({ mode: "serial" });
test.setTimeout(480_000);
const NAME = "Taylor Brooks";
let room, ctx, page;

const hasFfmpeg = (() => { try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; } catch { return false; } })();
test.skip(!hasFfmpeg, "needs ffmpeg to make the pictures, videos and sounds");

/** Everything the server holds for the chat, oldest first. */
async function truth() {
  const t = await login("alice"); let from = "", out = [];
  for (;;) {
    const r = await api(t, "GET", `/rooms/${encodeURIComponent(room)}/messages?dir=b&limit=1000${from ? "&from=" + from : ""}`);
    for (const e of r.chunk) if (e.type === "m.room.message" && !e.content["m.relates_to"]?.rel_type) out.push(e.event_id);
    if (!r.end || !r.chunk.length) break; from = r.end;
  }
  return out.reverse();
}
const says = async (n, text) => { const t = await login("taylor"); for (let i = 0; i < n; i++) await api(t, "PUT", `/rooms/${encodeURIComponent(room)}/send/m.room.message/h${Date.now()}${Math.random().toString(36).slice(2)}`, { msgtype: "m.text", body: `${text} ${i + 1}` }); };
const shown = () => page.evaluate(() => [...document.querySelectorAll(".timeline .msg[data-id]")].map((m) => m.dataset.id));
const view = () => page.evaluate(() => { const el = document.querySelector(".timeline"); return { top: Math.round(el.scrollTop), fromBottom: Math.round(el.scrollHeight - el.scrollTop - el.clientHeight), count: el.querySelectorAll(".msg[data-id]").length }; });
/** What of the server's list, between the page's oldest and newest message, is not showing. */
function missingIn(ids, all) {
  const pos = new Map(all.map((id, i) => [id, i])), have = new Set(ids), idx = ids.map((i) => pos.get(i)).filter((i) => i != null);
  if (!idx.length) return { missing: -1, newest: 0 };
  const lo = Math.min(...idx), hi = Math.max(...idx); let missing = 0;
  for (let i = lo; i <= hi; i++) if (!have.has(all[i])) missing++;
  return { missing, newest: all.length - 1 - hi, shown: idx.length, lo };
}
async function scrollUp(maxSteps = 500) {
  await page.mouse.move(600, 380); let still = 0, last = "";
  for (let i = 0; i < maxSteps; i++) {
    await page.mouse.wheel(0, -700); await page.waitForTimeout(60);
    const v = await view(); const key = `${v.top}/${v.count}`; still = key === last ? still + 1 : 0; last = key; if (v.top === 0 && still >= 14) break;
  }
  await page.waitForTimeout(1200);
}
async function clearOverlays() {
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(600);
    const key = page.locator(".modal, [role=dialog], .overlay").filter({ hasText: "recovery key" }).first();
    if (await key.isVisible().catch(() => false)) { await key.getByLabel("I saved my recovery key").check({ timeout: 1500 }).catch(() => {}); await key.getByRole("button", { name: /^Done$|^Close$|^Cancel$|^Later$|^Not now$/ }).first().click({ timeout: 1500 }).catch(() => {}); continue; }
    if (await page.getByRole("button", { name: "Skip tour" }).isVisible().catch(() => false)) { await page.getByRole("button", { name: "Skip tour" }).click().catch(() => {}); continue; }
    break;
  }
}
async function openApp(browser, settings) {
  ctx = await browser.newContext({ viewport: { width: 1180, height: 760 } }); await fakeDesktop(ctx, "linux");
  if (settings) await ctx.addInitScript((st) => { try { localStorage.setItem("pager.settings", JSON.stringify(st)); } catch { /* none */ } }, settings);
  page = await ctx.newPage();
  await page.goto("/");
  if (await page.getByLabel("Username").isVisible({ timeout: 4000 }).catch(() => false)) { await page.getByLabel("Username").fill("alice"); await page.locator('input[type="password"]').fill("pw-alice"); await page.getByRole("button", { name: "Sign in" }).click(); }
  await page.locator(".chat-row").first().waitFor({ timeout: 60_000 });
  await clearOverlays();
}
const openChat = async () => { await page.locator(".chat-row", { hasText: NAME }).first().click(); await page.waitForTimeout(2000); };

test.beforeAll(async () => {
  await history({ scale: 0.14 });
  const h = JSON.parse(readFileSync(resolve(import.meta.dirname, "../.state/history.json")));
  room = h.find((c) => c.name === NAME).room;
});
test.afterEach(async () => { await ctx?.close().catch(() => {}); });

test("scrolling from the newest message to the very first shows every message, none missing", async ({ browser }) => {
  await openApp(browser); await openChat();
  await scrollUp();
  const all = await truth(), m = missingIn(await shown(), all);
  expect(m.shown, "messages showing").toBe(all.length);
  expect(m.missing, "messages missing inside the stretch showing").toBe(0);
  expect(m.newest).toBe(0);
});

test("a burst of messages while you read far back keeps what you had and what you are looking at", async ({ browser }) => {
  await openApp(browser); await openChat(); await scrollUp(60);
  await page.mouse.move(600, 380); await page.mouse.wheel(0, 2500); await page.waitForTimeout(800);
  const before = await view(), mark = await page.evaluate(() => { const el = document.querySelector(".timeline"), vr = el.getBoundingClientRect(); const m = [...el.querySelectorAll(".msg[data-id]")].find((x) => x.getBoundingClientRect().top > vr.top + 100); return { id: m.dataset.id, y: Math.round(m.getBoundingClientRect().top - vr.top) }; });
  await ctx.setOffline(true); await says(60, "burst"); await page.waitForTimeout(300); await ctx.setOffline(false);     // more than one update can carry
  await expect.poll(async () => (await view()).count, { timeout: 30_000 }).toBeGreaterThan(before.count + 50);
  const now = await page.evaluate((id) => { const el = document.querySelector(".timeline"), vr = el.getBoundingClientRect(); const m = el.querySelector(`.msg[data-id="${CSS.escape(id)}"]`); return m ? Math.round(m.getBoundingClientRect().top - vr.top) : null; }, mark.id);
  expect(now, "the message being read is still on the page").not.toBeNull();
  expect(Math.abs(now - mark.y), "and has not moved").toBeLessThanOrEqual(2);
  expect((await view()).count, "nothing that was loaded was thrown away").toBeGreaterThanOrEqual(before.count);
  await scrollUp();
  const all = await truth(), m = missingIn(await shown(), all);
  expect(m.missing).toBe(0); expect(m.newest).toBe(0);
});

test("after the computer sleeps through a lot of messages, none are missing anywhere", async ({ browser }) => {
  await openApp(browser); await openChat();
  await ctx.setOffline(true); await says(100, "while asleep"); await page.waitForTimeout(300); await ctx.setOffline(false);
  await page.waitForTimeout(8000);
  let all = await truth(), m = missingIn(await shown(), all);
  expect(m.missing).toBe(0); expect(m.newest).toBe(0);
  await scrollUp(); all = await truth(); m = missingIn(await shown(), all);
  expect(m.shown).toBe(all.length);
});

test("with more unread messages than are loaded, the page opens at the newest, the line appears where the unread begin, and nothing jumps", async ({ browser }) => {
  await says(120, "unread");
  await openApp(browser, { openAtUnread: true });
  const first = (await truth()).at(-120);
  await page.locator(".chat-row", { hasText: NAME }).first().click();
  const samples = [];
  for (let i = 0; i < 16; i++) { await page.waitForTimeout(250); samples.push(await page.evaluate(() => { const el = document.querySelector(".timeline"); return el ? Math.round(el.scrollHeight - el.scrollTop - el.clientHeight) : -1; })); }
  expect(Math.max(...samples), "stayed at the newest message the whole time").toBeLessThanOrEqual(2);
  await expect(page.locator("#unread-divider")).toHaveCount(1, { timeout: 20_000 });
  const placed = await page.evaluate((id) => { const d = document.querySelector("#unread-divider"), f = document.querySelector(`.msg[data-id="${CSS.escape(id)}"]`); return !!(d && f && d.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING && d.nextElementSibling?.contains(f)); }, first);
  expect(placed, "the line sits right before the first unread message").toBeTruthy();
  const box = page.getByPlaceholder(/Message|Add a message/); await box.fill("sending from here"); await box.press("Enter");
  await page.waitForTimeout(1500);
  expect((await view()).fromBottom).toBeLessThanOrEqual(2);
});

test("reading slowly through pictures, videos, voice messages and music, the page never moves on its own", async ({ browser }) => {
  await openApp(browser); await openChat(); await scrollUp(30);
  await page.mouse.move(600, 380);
  const off = [];
  for (let i = 0; i < 80; i++) {
    const a = await page.evaluate(() => { const el = document.querySelector(".timeline"), vr = el.getBoundingClientRect(); const ms = [...el.querySelectorAll(".msg[data-id]")].filter((x) => { const r = x.getBoundingClientRect(); return r.top > vr.top + 40 && r.bottom < vr.bottom - 40; }); const m = ms[Math.floor(ms.length / 2)]; return m ? { id: m.dataset.id, y: m.getBoundingClientRect().top - vr.top } : null; });
    if (!a) continue;
    await page.mouse.wheel(0, -120); await page.waitForTimeout(140);
    const b = await page.evaluate((id) => { const el = document.querySelector(".timeline"), vr = el.getBoundingClientRect(); const m = el.querySelector(`.msg[data-id="${CSS.escape(id)}"]`); return m ? m.getBoundingClientRect().top - vr.top : null; }, a.id);
    if (b != null && Math.abs(b - a.y - 120) > 6) off.push(Math.round(b - a.y - 120));
  }
  expect(off, "moves of more than 6px beyond the scroll itself").toEqual([]);
});
