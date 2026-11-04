import { test, expect } from "@playwright/test";
import { chatRow, openChat, signIn, snap } from "./helpers.mjs";

// Linux report: after sending media with a text body, "Send later" would not appear or could not be clicked until the page was left and opened again.
test.describe.configure({ mode: "serial" });
let page;
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1180, height: 760 } });
  page = await context.newPage();
  await signIn(page);
  await openChat(page, "Pager team");
});
test.afterAll(async () => { await page.context().close(); });

// A 1 x 1 picture: enough to be a media file.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const later = () => page.getByRole("button", { name: "Send later" });
const box = () => page.getByPlaceholder(/Message|Add a message/);

test("send later works for text, is off while a file is attached, and works again once the file has been sent", async () => {
  await box().fill("first words"); await expect(later()).toBeEnabled();
  await box().fill("");
  await page.locator('input[type="file"]').first().setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: PNG });
  await expect(page.locator(".staged-item")).toHaveCount(1);
  await box().fill("a picture with words");
  await expect(later()).toBeDisabled();                                  // a scheduled message is text only
  await snap(page, "30-composer-file-staged");
  await box().press("Enter");
  await expect(page.locator(".staged-item")).toHaveCount(0);            // sent: the tray is empty
  await expect(page.locator(".timeline").getByText("a picture with words")).toBeVisible({ timeout: 20_000 });
  await box().fill("next message");
  await expect(later()).toBeEnabled();                                   // the reported bug: it stayed off
  await later().click();
  await expect(page.getByRole("dialog").or(page.locator(".modal")).filter({ hasText: "Send later" })).toBeVisible();
  await snap(page, "31-send-later-open");
});
