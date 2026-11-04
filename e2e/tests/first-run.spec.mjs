import { test, expect } from "@playwright/test";
import { register } from "../lib.mjs";
import { snap } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

// What a brand-new account sees: its recovery key must be shown and stay on screen until it has been saved. (It used to be made and then hidden at once.)
test("a new account is shown its recovery key, and keeps it on screen until saved", async ({ browser }) => {
  await register("erin", "pw-erin", false, "Erin");
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 760 } })).newPage();
  await page.goto("/");
  await page.getByLabel("Username").fill("erin");
  await page.locator('input[type="password"]').fill("pw-erin");
  await page.getByRole("button", { name: "Sign in" }).click();

  const dialog = page.locator(".modal, [role=dialog]").filter({ hasText: "Save your recovery key" });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  const key = dialog.locator("pre.recovery-key");
  await expect(key).toHaveText(/^[A-Za-z0-9]{4}( [A-Za-z0-9]{4}){5,}$/);   // the key itself, grouped in fours
  await page.waitForTimeout(3000);                                       // it does not go away by itself
  await expect(dialog).toBeVisible();
  await snap(page, "10-recovery-key");
  await expect(dialog.getByRole("button", { name: "Done" })).toBeDisabled();   // not until you say you saved it
  await expect(page.getByRole("button", { name: "Skip tour" })).toHaveCount(0); // the tour waits

  await dialog.getByLabel("I saved my recovery key").check();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Skip tour" })).toBeVisible({ timeout: 20_000 });   // now the tour starts
  await page.getByRole("button", { name: "Skip tour" }).click();
  await expect(page.getByText("not backed up", { exact: false })).toHaveCount(0);   // and no reminder: the key is backed up
});

// The same account on a second device that does not have the key yet.
test("a device without the key is reminded, and signing out there warns first", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 760 } })).newPage();
  await page.goto("/");
  await page.getByLabel("Username").fill("erin");
  await page.locator('input[type="password"]').fill("pw-erin");
  await page.getByRole("button", { name: "Sign in" }).click();

  const welcome = page.locator(".modal, [role=dialog]").filter({ hasText: "Enter your recovery key" });
  await expect(welcome).toBeVisible({ timeout: 30_000 });
  await snap(page, "11-enter-recovery-key");
  await welcome.getByRole("button", { name: "Cancel" }).click();
  const skip = page.getByRole("button", { name: "Skip tour" });
  if (await skip.waitFor({ timeout: 8000 }).then(() => true, () => false)) await skip.click();

  await expect(page.getByText("Enter your recovery key to read older messages", { exact: false })).toBeVisible();   // the bar
  await snap(page, "12-keys-bar");

  await page.getByLabel("Menu").click();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByText("About", { exact: true }).first().click();
  await page.getByText("Sign out", { exact: true }).first().click();
  const warning = page.locator(".modal, [role=dialog]").filter({ hasText: "stay locked for good" });
  await expect(warning).toBeVisible();
  await snap(page, "13-sign-out-warning");
  await warning.getByRole("button", { name: "Cancel" }).click();
  await expect(warning).toHaveCount(0);
});
