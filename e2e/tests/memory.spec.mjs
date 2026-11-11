import { test, expect } from "@playwright/test";
import { fakeDesktop } from "./fake-desktop.mjs";
import { openChat, signIn } from "./helpers.mjs";
import { api, login } from "../lib.mjs";

// The desktop shell reports "hidden" when the window goes to the tray or is minimised, and the page then lets go of older messages to save memory. On Wayland a window in plain use
// was reported hidden every 20 seconds: the open page was cut to 20 messages, reloaded its history, and was cut again, each time a jump. A page in use must not be cut, however the shell
// reports; one that really was left alone may be, unless it is being read higher up.
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);
let page, bob, room;
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1180, height: 760 } }); await fakeDesktop(context, "linux");
  page = await context.newPage(); await signIn(page);
  bob = await login("bob");
  for (const r of (await api(bob, "GET", "/joined_rooms")).joined_rooms) { const n = await api(bob, "GET", `/rooms/${encodeURIComponent(r)}/state/m.room.name`).catch(() => null); if (n?.name === "Pager team") room = r; }
  for (let i = 1; i <= 90; i++) await api(bob, "PUT", `/rooms/${encodeURIComponent(room)}/send/m.room.message/m${Date.now()}${i}`, { msgtype: "m.text", body: `message ${i} to make the page long enough to be cut` });
  await openChat(page, "Pager team");
  await expect.poll(() => count(), { timeout: 30_000 }).toBeGreaterThan(60);
});
test.afterAll(async () => { await page.context().close(); });

const count = () => page.evaluate(() => document.querySelectorAll(".timeline .msg[data-id]").length);
const report = (level) => page.evaluate((l) => window.__memory?.(l), level);
const later = (ms) => page.evaluate((m) => { const real = Date.now.bind(Date); Date.now = () => real() + m; }, ms);     // the clock moves on, as if the app had been left alone

test("a window reported hidden while you are using the app does not cut the open page", async () => {
  await page.mouse.move(500, 380); await page.mouse.wheel(0, 200);        // used just now
  const before = await count();
  for (let i = 0; i < 4; i++) { await report("hidden"); await page.waitForTimeout(400); }        // (the shell said so every 20 seconds)
  expect(await count(), "the page was cut although it was in use").toBe(before);
});

test("a page at the bottom that was left alone for ten minutes is cut to save memory", async () => {
  await page.mouse.move(500, 380); for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 4000); await page.waitForTimeout(100); }
  await page.waitForTimeout(600);
  const before = await count();
  await later(11 * 60_000);
  await report("hidden");
  await expect.poll(() => count(), { timeout: 10_000 }).toBeLessThan(before - 10);       // (older messages are let go; some are read again when the page needs a screenful)
});

test("a page being read higher up is not cut even when the app really was left alone", async () => {
  await page.mouse.move(500, 380);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -900); await page.waitForTimeout(400); }       // reading higher up: older messages come in
  await page.waitForTimeout(1500);
  const before = await count();
  await later(11 * 60_000);
  await report("hidden"); await page.waitForTimeout(1500);
  expect(await count()).toBeGreaterThanOrEqual(before);
});
