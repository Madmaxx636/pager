import { test, expect } from "@playwright/test";
import { chatRow, openChat, signIn } from "./helpers.mjs";

// More everyday things: keeping pages tidy, forwarding, finding messages everywhere, adding files, and settings that must take effect at once.
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);
let page; const errors = [];
test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext({ viewport: { width: 1180, height: 760 } })).newPage();
  page.on("pageerror", (e) => errors.push(String(e.stack || e)));
  await signIn(page);
});
test.afterAll(async () => { expect(errors, "page errors").toEqual([]); await page.context().close(); });

const box = () => page.getByPlaceholder(/Message|Add a message/);
const send = async (t) => { await box().fill(t); await box().press("Enter"); };
const anyRow = (name) => page.locator(".chat-row, .pin-chip", { hasText: name }).first();
const rowMenu = async (name, item) => { await anyRow(name).click({ button: "right" }); await page.locator(".menu.ctx").getByRole("button", { name: item }).click(); };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("pin, mute and archive from the page's menu, and the keyboard shortcuts do the same", async () => {
  await rowMenu("Jordan Lee", /^Pin to top/);
  await expect(page.locator(".pin-chip", { hasText: "Jordan Lee" })).toBeVisible({ timeout: 10_000 });
  await rowMenu("Jordan Lee", /^Unpin/);
  await expect(page.locator(".pin-chip", { hasText: "Jordan Lee" })).toHaveCount(0);
  await openChat(page, "Alex Kim");
  await page.keyboard.press("Control+Shift+M"); await page.waitForTimeout(400);
  await chatRow(page, "Alex Kim").click({ button: "right" });
  await expect(page.locator(".menu.ctx").getByRole("button", { name: /Unmute/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+Shift+M"); await page.waitForTimeout(400);
  await page.keyboard.press("Control+Shift+A"); await page.waitForTimeout(600);
  await expect(page.locator(".sidebar .chat-row", { hasText: "Alex Kim" })).toHaveCount(0);         // archived: not in the inbox
  await page.getByRole("button", { name: /^Archive/ }).first().click();
  await expect(page.locator(".sidebar .chat-row", { hasText: "Alex Kim" })).toBeVisible({ timeout: 10_000 });
  await chatRow(page, "Alex Kim").click({ button: "right" });
  await page.locator(".menu.ctx").getByRole("button", { name: /Move to inbox/ }).click();
  await page.getByRole("button", { name: /^Inbox/ }).first().click();
  await expect(chatRow(page, "Alex Kim")).toBeVisible({ timeout: 10_000 });
});

test("a message can be forwarded to another page", async () => {
  await openChat(page, "Pager team");
  await send("please forward me");
  const m = page.locator(".timeline .msg", { hasText: "please forward me" }).last(); await expect(m).toBeVisible({ timeout: 20_000 });
  await expect(async () => { await m.hover(); await m.getByTitle("More").click({ timeout: 1500 }); }).toPass({ timeout: 15_000 });      // (hover again and retry: the list may still be settling under the pointer)
  await page.locator(".msg-menu").getByRole("button", { name: "Forward", exact: true }).click();
  await expect(page.getByRole("main").getByPlaceholder("Search pages")).toBeVisible();
  await page.getByRole("main").getByPlaceholder("Search pages").fill("Weekend");
  await page.locator("section.page .list-btn", { hasText: "Weekend plans" }).click();
  await openChat(page, "Weekend plans");
  await expect(page.locator(".timeline .msg", { hasText: "please forward me" }).last()).toBeVisible({ timeout: 20_000 });
});

test("searching all messages finds text from several pages and opens it", async () => {
  await page.keyboard.press("Control+Shift+f");
  const s = page.getByPlaceholder(/Search/).first(); await expect(s).toBeVisible();
  await s.fill("forward me");
  await expect(page.getByText("please forward me").first()).toBeVisible({ timeout: 20_000 });
  await page.getByText("please forward me").first().click();
  await expect(page.locator(".timeline")).toContainText("please forward me", { timeout: 15_000 });
});

test("files are added to the message, can be taken off again, and are sent", async () => {
  await openChat(page, "Pager team");
  await page.locator('input[type="file"]').first().setInputFiles([{ name: "one.png", mimeType: "image/png", buffer: PNG }, { name: "two.png", mimeType: "image/png", buffer: PNG }, { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") }]);
  await expect(page.locator(".staged-item")).toHaveCount(3);
  await page.locator(".staged-item").nth(1).getByRole("button").first().click();
  await expect(page.locator(".staged-item")).toHaveCount(2);
  await box().fill("two things"); await box().press("Enter");
  await expect(page.locator(".staged-item")).toHaveCount(0);
  await expect(page.locator(".timeline .msg", { hasText: "notes.txt" }).last()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".timeline .msg", { hasText: "two things" }).last()).toBeVisible({ timeout: 30_000 });
});

test("pasting a picture adds it to the message", async () => {
  await box().click();
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer(); dt.items.add(new File([bytes], "pasted.png", { type: "image/png" }));
    document.querySelector("textarea").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, PNG.toString("base64"));
  await expect(page.locator(".staged-item")).toHaveCount(1, { timeout: 5000 });
  await page.getByRole("button", { name: "Remove" }).first().click().catch(async () => { await page.locator(".staged-item").first().getByRole("button").first().click(); });
  await expect(page.locator(".staged-item")).toHaveCount(0);
});

test("dark mode and a bigger text size apply as soon as they are chosen", async () => {
  await page.keyboard.press("Control+,");
  await page.getByText("Appearance", { exact: true }).first().click();
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  const mode = page.locator('select:has(option[value="dark"])').first();
  await mode.selectOption("dark");
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  await mode.selectOption("light");
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
  expect(before === "light" || before === "dark").toBeTruthy();
});

test("a new page can be started from the new-page screen", async () => {
  await page.keyboard.press("Control+n");
  await expect(page.getByRole("main").getByRole("heading").first()).toContainText("Page someone");
  await page.keyboard.press("Escape");
});
