import { test, expect } from "@playwright/test";
import { openChat, signIn, snap } from "./helpers.mjs";

// Reports: the page snapped down while scrolling up (when the last message was yours), and jumped up when sending.
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);
let page;
test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext({ viewport: { width: 1180, height: 760 } })).newPage();
  await signIn(page);
  await openChat(page, "Pager team");
});
test.afterAll(async () => { await page.context().close(); });

const box = () => page.getByPlaceholder(/Message|Add a message/);
const top = () => page.locator(".timeline").evaluate((el) => Math.round(el.scrollTop));
const fromBottom = () => page.locator(".timeline").evaluate((el) => Math.round(el.scrollHeight - el.scrollTop - el.clientHeight));

test("reading older messages while your own message is the newest stays put", async () => {
  for (let i = 1; i <= 45; i++) { await box().fill(`filler message number ${i} to make the page long enough to scroll`); await box().press("Enter"); }
  await expect(page.locator(".timeline").getByText("filler message number 45")).toBeVisible({ timeout: 30_000 });
  await expect.poll(fromBottom).toBeLessThan(5);                           // following the newest while you send
  await page.waitForTimeout(4500);                                           // just after opening, scrolls that are not yours are ignored
  await page.mouse.move(600, 300); await page.mouse.wheel(0, -1200);         // a real scroll, so it counts as yours
  await page.waitForTimeout(500);
  const at = await top();
  expect(await fromBottom()).toBeGreaterThan(400);
  await page.waitForTimeout(8000);                                           // delivery marks, receipts and syncs arrive meanwhile
  expect(Math.abs((await top()) - at)).toBeLessThan(30);
  await snap(page, "40-scroll-reading");
});

test("sending a message takes you to it", async () => {
  await box().fill("one more"); await box().press("Enter");
  await expect(page.locator(".timeline").getByText("one more")).toBeVisible({ timeout: 20_000 });
  await expect.poll(fromBottom, { timeout: 10_000 }).toBeLessThan(5);
});

test("typing a long message keeps the newest message in view, at the bottom", async () => {
  await page.waitForTimeout(1500);
  await expect.poll(fromBottom).toBeLessThan(5);
  const lines = Array.from({ length: 9 }, (_, i) => `a long message, line ${i + 1}, long enough to wrap onto a second line when the window is narrow`).join("\n");
  await box().click();
  for (let i = 0; i < 9; i++) { await box().pressSequentially(`typing line ${i + 1} of a long message that keeps growing`); await box().press("Shift+Enter"); await page.waitForTimeout(120); }
  await page.waitForTimeout(400);
  await snap(page, "41-scroll-typing");
  const last = page.locator(".timeline .msg").last();
  const box1 = await last.boundingBox(), tl = await page.locator(".timeline").boundingBox();
  expect(box1.y + box1.height).toBeLessThanOrEqual(tl.y + tl.height + 1);          // the newest message is above the bottom edge of the list, not under the message box
  expect(await fromBottom()).toBeLessThan(5);
});

test("scrolling down to the bottom and then typing does not move the page", async () => {
  await page.locator(".timeline").evaluate((el) => { el.scrollTop = el.scrollHeight - 700; });
  await page.mouse.move(600, 300); await page.mouse.wheel(0, 100); await page.waitForTimeout(300);
  await page.mouse.wheel(0, 3000); await page.waitForTimeout(500);
  expect(await fromBottom()).toBeLessThan(5);
  await box().fill("");
  await box().click();
  const before = await top();
  await box().pressSequentially("hello there, I am typing");
  await page.waitForTimeout(500);
  expect(Math.abs((await top()) - before)).toBeLessThan(5);
  expect(await fromBottom()).toBeLessThan(5);
});
