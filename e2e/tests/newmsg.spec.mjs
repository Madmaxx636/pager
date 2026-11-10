import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { fakeDesktop } from "./fake-desktop.mjs";
import { openChat, signIn } from "./helpers.mjs";
import { api, login } from "../lib.mjs";

// "The page snaps up when a new message arrives": a picture that arrives without a size has no height until it is decoded, so its message collapsed for a moment and the
// page dropped with it (about 200px), then grew again. Every painted frame is looked at: at the bottom the page may only move down and must stay at the bottom; reading higher up, nothing moves.
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);
let page, bob, room, mxc, n = 0;
const hasFfmpeg = (() => { try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; } catch { return false; } })();
test.skip(!hasFfmpeg, "needs ffmpeg to make a picture");

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1180, height: 760 } }); await fakeDesktop(context, "linux");
  page = await context.newPage(); await signIn(page); await openChat(page, "Pager team");
  const box = page.getByPlaceholder(/Message|Add a message/);
  for (let i = 1; i <= 40; i++) { await box.fill(`filler ${i} so the page is long enough to scroll`); await box.press("Enter"); }
  await page.waitForTimeout(5000);
  bob = await login("bob");
  for (const r of (await api(bob, "GET", "/joined_rooms")).joined_rooms) { const nm = await api(bob, "GET", `/rooms/${encodeURIComponent(r)}/state/m.room.name`).catch(() => null); if (nm?.name === "Pager team") room = r; }
  const png = execFileSync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=640x480", "-frames:v", "1", "-f", "image2", "-c:v", "png", "-"], { maxBuffer: 5e7 });
  mxc = (await (await fetch("http://127.0.0.1:18008/_matrix/media/v3/upload", { method: "POST", headers: { authorization: `Bearer ${bob}`, "content-type": "image/png" }, body: png })).json()).content_uri;
});
test.afterAll(async () => { await page.context().close(); });

const send = (content) => api(bob, "PUT", `/rooms/${encodeURIComponent(room)}/send/m.room.message/n${Date.now()}${n++}`, content);
const picture = (withSize) => send({ msgtype: "m.image", body: "photo.png", url: mxc, info: { mimetype: "image/png", ...(withSize ? { w: 640, h: 480 } : {}) } });
const toBottom = async () => { await page.mouse.move(600, 300); for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 4000); await page.waitForTimeout(100); } await page.waitForTimeout(500); };
const up = async (px) => { await toBottom(); await page.mouse.wheel(0, -px); await page.waitForTimeout(600); };
async function watch(action) {
  await page.evaluate(() => {
    const el = document.querySelector(".timeline"), w = (window.__w = { f: [], on: true }), ch = new MessageChannel();
    ch.port1.onmessage = () => { if (w.on) w.f.push({ top: Math.round(el.scrollTop), fb: Math.round(el.scrollHeight - el.scrollTop - el.clientHeight) }); };    // sampled just after each frame was drawn
    const tick = () => { if (!w.on) return; ch.port2.postMessage(0); requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  });
  await action(); await page.waitForTimeout(1500);
  return page.evaluate(() => { window.__w.on = false; return window.__w.f; });
}
const wentUp = (f) => f.some((x, i) => i && x.top < f[i - 1].top);

test("a picture with no size, arriving at the bottom: the page only moves down and stays at the bottom", async () => {
  await toBottom();
  const f = await watch(() => picture(false));
  expect(wentUp(f), "the page snapped up").toBe(false);
  expect(Math.max(...f.map((x) => x.fb)), "off the bottom in some frame").toBeLessThanOrEqual(1);
  expect(f.at(-1).top).toBeGreaterThan(f[0].top + 150);
});

test("a picture with its size given, arriving at the bottom: the same", async () => {
  const f = await watch(() => picture(true));
  expect(wentUp(f)).toBe(false); expect(Math.max(...f.map((x) => x.fb))).toBeLessThanOrEqual(1);
});

test("a picture arriving while you read higher up: nothing moves", async () => {
  await up(300);
  const before = (await page.evaluate(() => document.querySelector(".timeline").scrollTop));
  const f = await watch(() => picture(false));
  expect(Math.max(...f.map((x) => Math.abs(x.top - before)))).toBeLessThanOrEqual(1);
});

test("someone's typing dots go as their message arrives", async () => {
  await toBottom();
  await api(bob, "PUT", `/rooms/${encodeURIComponent(room)}/typing/@bob:test.local`, { typing: true, timeout: 20000 });
  await expect(page.locator(".typing-row")).toHaveCount(1, { timeout: 10_000 });
  await send({ msgtype: "m.text", body: "words after the dots" });
  await expect(page.locator(".timeline .msg", { hasText: "words after the dots" }).last()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".typing-row")).toHaveCount(0, { timeout: 1500 });          // (the typing report that ends it comes later: the dots must not wait for it)
  await api(bob, "PUT", `/rooms/${encodeURIComponent(room)}/typing/@bob:test.local`, { typing: false });
});
