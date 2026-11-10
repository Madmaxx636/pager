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
const video = (withSize) => send({ msgtype: "m.video", body: "clip.mp4", url: mxc, info: { mimetype: "video/mp4", duration: 3000, ...(withSize ? { w: 480, h: 270 } : {}) } });
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

test("someone typing does not move the list at all, and their dots go as their message arrives", async () => {
  await toBottom();
  const f = await watch(async () => {
    await api(bob, "PUT", `/rooms/${encodeURIComponent(room)}/typing/@bob:test.local`, { typing: true, timeout: 20000 });
    await expect(page.locator(".typing-float")).toHaveCount(1, { timeout: 10_000 });          // the dots float above the message box, outside the list
    await page.waitForTimeout(1200);
  });
  expect(Math.max(...f.map((x) => Math.abs(x.top - f[0].top))), "the dots moved the list").toBeLessThanOrEqual(1);
  const g = await watch(async () => {
    await send({ msgtype: "m.text", body: "words after the dots" });
    await expect(page.locator(".timeline .msg", { hasText: "words after the dots" }).last()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".typing-float")).toHaveCount(0, { timeout: 1500 });          // (the typing report that ends it comes later: the dots must not wait for it)
  });
  expect(wentUp(g), "the page snapped up").toBe(false); expect(Math.max(...g.map((x) => x.fb))).toBeLessThanOrEqual(1);
  await api(bob, "PUT", `/rooms/${encodeURIComponent(room)}/typing/@bob:test.local`, { typing: false });
});

test("a video, with or without a size, is a proper box from the start and keeps its size when the next message arrives", async () => {
  await toBottom();
  for (const sized of [false, true]) {
    const before = await page.locator(".timeline .vid").count();
    await video(sized);
    await expect(page.locator(".timeline .vid")).toHaveCount(before + 1, { timeout: 15_000 });      // (the new one, not the previous video)
    const box = page.locator(".timeline .vid").last();
    const h0 = await box.evaluate((e) => e.offsetHeight);      // (layout height: the entrance animation scales the box a little while it plays)
    expect(h0, "a thin strip instead of a video box").toBeGreaterThan(120);
    await send({ msgtype: "m.text", body: "after the video" });
    await expect(page.locator(".timeline .msg", { hasText: "after the video" }).last()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    const h1 = await box.evaluate((e) => e.offsetHeight);
    expect(Math.abs(h1 - h0), `the video changed size (${sized ? "size given" : "no size"}: ${h0}px to ${h1}px)`).toBeLessThanOrEqual(3);
  }
});

test("the jump recorder notes a page that gets shorter under you at the bottom, without any message text", async () => {
  await toBottom();
  const secret = "a long private message nobody else should ever see in a log\nwith several\nlines\nof text";
  const id = (await send({ msgtype: "m.text", body: secret })).event_id;
  await expect(page.locator(".timeline .msg", { hasText: "nobody else should ever see" }).last()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);
  await api(bob, "PUT", `/rooms/${encodeURIComponent(room)}/redact/${id}/r${Date.now()}`, {});         // it is taken away: the page gets about 100px shorter
  await expect(page.locator(".timeline .msg", { hasText: "nobody else should ever see" })).toHaveCount(0, { timeout: 15_000 });
  await page.waitForTimeout(3000);                                                                       // (the log is written out a couple of seconds later)
  const log = await page.evaluate(() => (localStorage.getItem("pager.applog.incidents") ?? "") + (localStorage.getItem("pager.applog.crumbs") ?? ""));
  expect(log, "a shrink while at the bottom is recorded").toMatch(/list shrank under you at the bottom by \d+px/);
  expect(log, "what the page changed is described").toMatch(/the page changed: \+\d+ -\d+/);
  expect(log, "no message text in the log").not.toContain("nobody else should ever see");
});
