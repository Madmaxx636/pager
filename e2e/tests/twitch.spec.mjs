import { test, expect } from "@playwright/test";
import { openChat, signIn } from "./helpers.mjs";
import { api, login } from "../lib.mjs";

// "Scroll snap twitch": the list jumping up and down a little while the message box changes size. Every animation frame, the distance of the list from its
// bottom is written down; at the bottom it must be 0 in every frame, not only at the end.
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);
let page;
test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext({ viewport: { width: 1180, height: 760 } })).newPage();
  await signIn(page);
  await openChat(page, "Pager team");
  const box = page.getByPlaceholder(/Message|Add a message/);
  for (let i = 1; i <= 40; i++) { await box.fill(`filler ${i} so the page is long enough to scroll up and down`); await box.press("Enter"); }
  await page.waitForTimeout(5000);   // settled; the first seconds after opening are special
});
test.afterAll(async () => { await page.context().close(); });

const box = () => page.getByPlaceholder(/Message|Add a message/);
async function watch(action, label) {
  await page.evaluate(() => {
    const el = document.querySelector(".timeline"); const w = (window.__tw = { frames: [], on: true });
    const lastMsg = () => [...el.querySelectorAll(".msg")].pop();
    // Sampled just AFTER each frame was drawn (a message from inside the frame callback arrives once it has been painted), so this is what was on screen.
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      if (!w.on) return;
      const m = lastMsg(), r = m?.getBoundingClientRect(), t = el.getBoundingClientRect();
      w.frames.push({ fb: Math.round((el.scrollHeight - el.scrollTop - el.clientHeight) * 10) / 10, gap: r ? Math.round((t.bottom - r.bottom) * 10) / 10 : null, top: el.scrollTop, h: el.clientHeight });
    };
    const tick = () => { if (!w.on) return; ch.port2.postMessage(0); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await action();
  await page.waitForTimeout(400);
  const frames = await page.evaluate(() => { window.__tw.on = false; return window.__tw.frames; });
  const bad = frames.filter((f) => f.fb > 1 || f.gap == null || Math.abs(f.gap - frames.at(-1).gap) > 2);
  // how often the scroll position changed direction (up then down): the twitch
  let flips = 0, last = 0; for (let i = 1; i < frames.length; i++) { const d = frames[i].top - frames[i - 1].top; if (d && last && Math.sign(d) !== Math.sign(last)) flips++; if (d) last = d; }
  const series = frames.map((f) => `${f.fb}/${f.gap}`).filter((v, i, a) => i === 0 || v !== a[i - 1]).join(" ");
  console.log(`${label} [fb/gap per painted frame, repeats removed]: ${series}`);
  console.log(`${label}: ${frames.length} frames, ${bad.length} off the bottom, ${flips} direction changes` + (bad.length ? `  e.g. ${JSON.stringify(bad.slice(0, 3))}` : ""));
  return { frames, bad, flips };
}
const atBottom = async () => { await page.locator(".timeline").evaluate((el) => { el.scrollTop = el.scrollHeight; }); await page.mouse.move(600, 300); await page.mouse.wheel(0, 2000); await page.waitForTimeout(300); };

test("the box growing from one line to two does not move the list", async () => {
  await atBottom(); await box().click(); await box().fill("");
  const r = await watch(async () => { await box().pressSequentially("first line"); await box().press("Shift+Enter"); await box().pressSequentially("second"); }, "one line to two");
  expect(r.bad.length, "frames where the list was off the bottom").toBe(0);
  expect(r.flips).toBe(0);
});

test("typing until the text wraps by itself does not move the list", async () => {
  await box().fill(""); await atBottom();
  const r = await watch(async () => { await box().pressSequentially("word ".repeat(40), { delay: 8 }); }, "natural wrap");
  expect(r.bad.length).toBe(0); expect(r.flips).toBe(0);
});

test("deleting back down to one line does not move the list", async () => {
  const r = await watch(async () => { for (let i = 0; i < 230; i++) await box().press("Backspace"); }, "back to one line");
  expect(r.bad.length).toBe(0); expect(r.flips).toBe(0);
});

test("the reply bar and the attachment tray appearing do not move the list", async () => {
  await box().fill(""); await atBottom();
  const m = page.locator(".timeline .msg").nth(-3); await m.hover();
  let r = await watch(async () => { await m.getByTitle("Reply").click(); }, "reply bar opens");
  expect(r.bad.length).toBe(0);
  r = await watch(async () => { await page.getByRole("button", { name: "Dismiss" }).first().click(); }, "reply bar closes");
  expect(r.bad.length).toBe(0);
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  r = await watch(async () => { await page.locator('input[type="file"]').first().setInputFiles({ name: "a.png", mimeType: "image/png", buffer: PNG }); await expect(page.locator(".staged-item")).toHaveCount(1); }, "tray opens");
  expect(r.bad.length).toBe(0);
  r = await watch(async () => { await page.locator(".staged-item").first().getByRole("button").first().click(); }, "tray closes");
  expect(r.bad.length).toBe(0);
});

test("sending keeps the list at the newest message in every frame", async () => {
  await box().fill("a message to send"); 
  const r = await watch(async () => { await box().press("Enter"); await expect(page.locator(".timeline .msg", { hasText: "a message to send" }).last()).toBeVisible(); }, "send");
  expect(r.frames.filter((f) => f.fb > 1).length).toBe(0);
});

test("resizing the window keeps the list at the bottom", async () => {
  await atBottom();
  const r = await watch(async () => { for (const h of [700, 640, 560, 640, 760]) { await page.setViewportSize({ width: 1180, height: h }); await page.waitForTimeout(80); } }, "window height");
  expect(r.frames.at(-1).fb).toBeLessThanOrEqual(1);
});

// Someone else writes while you are looking at the page.
let bob, teamRoom;
const bobSays = async (text) => { await api(bob, "PUT", `/rooms/${encodeURIComponent(teamRoom)}/send/m.room.message/${Date.now()}${Math.random().toString(36).slice(2)}`, { msgtype: "m.text", body: text }); };
test("a message from someone else while you are at the bottom brings the list along, with no frame off the bottom", async () => {
  bob = await login("bob");
  const rooms = (await api(bob, "GET", "/joined_rooms")).joined_rooms;
  for (const r of rooms) { const n = await api(bob, "GET", `/rooms/${encodeURIComponent(r)}/state/m.room.name`).catch(() => null); if (n?.name === "Pager team") teamRoom = r; }
  await box().fill(""); await atBottom();
  const r = await watch(async () => { await bobSays("hello from bob"); await expect(page.locator(".timeline .msg", { hasText: "hello from bob" }).last()).toBeVisible({ timeout: 20_000 }); }, "incoming at bottom");
  expect(r.frames.filter((f) => f.fb > 1).length).toBe(0);
});

test("someone typing brings the dots into view without moving the list when you are reading higher up", async () => {
  await atBottom();
  let r = await watch(async () => { await api(bob, "PUT", `/rooms/${encodeURIComponent(teamRoom)}/typing/@bob:test.local`, { typing: true, timeout: 3000 }); await page.waitForTimeout(1500); }, "typing dots at bottom");
  expect(r.frames.at(-1).fb).toBeLessThanOrEqual(1);
  await page.mouse.move(600, 300); await page.mouse.wheel(0, -1200); await page.waitForTimeout(500);
  const at = await page.locator(".timeline").evaluate((el) => el.scrollTop);
  r = await watch(async () => { await api(bob, "PUT", `/rooms/${encodeURIComponent(teamRoom)}/typing/@bob:test.local`, { typing: true, timeout: 3000 }); await page.waitForTimeout(1500); await bobSays("while you read"); await page.waitForTimeout(1500); }, "typing and a message while reading higher up");
  expect(Math.max(...r.frames.map((f) => Math.abs(f.top - at))), "the list moved while reading").toBeLessThanOrEqual(1);
});

test("typing a long message while reading higher up does not move the list at all", async () => {
  const at = await page.locator(".timeline").evaluate((el) => el.scrollTop);
  const r = await watch(async () => { await box().click(); await box().pressSequentially("one"); await box().press("Shift+Enter"); await box().pressSequentially("two"); await box().press("Shift+Enter"); await box().pressSequentially("three"); }, "typing while reading higher up");
  expect(Math.max(...r.frames.map((f) => Math.abs(f.top - at)))).toBeLessThanOrEqual(1);
  await box().fill("");
});
