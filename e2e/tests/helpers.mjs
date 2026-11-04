import { expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

export const shots = resolve(import.meta.dirname, "../shots");
mkdirSync(shots, { recursive: true });

/** Signs in as a seeded user (password is pw-<name>) and waits for the page list. */
export async function signIn(page, user = "alice") {
  await page.goto("/");
  await page.getByLabel("Username").fill(user);
  await page.locator('input[type="password"]').fill(`pw-${user}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Pages", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  // A new account first saves its recovery key (the screen stays until it is ticked as saved), then is walked through a tour; both cover the page.
  const keyDialog = page.locator(".modal, [role=dialog]").filter({ hasText: "Save your recovery key" });
  const welcome = page.locator(".modal, [role=dialog]").filter({ hasText: "Enter your recovery key" });   // a device that does not have the account's key
  const which = await Promise.race([keyDialog.waitFor({ timeout: 20_000 }).then(() => "save"), welcome.waitFor({ timeout: 20_000 }).then(() => "enter")]).catch(() => null);
  if (which === "save") {
    await keyDialog.getByLabel("I saved my recovery key").check();
    await keyDialog.getByRole("button", { name: "Done" }).click();
    await expect(keyDialog).toHaveCount(0);
  } else if (which === "enter") {
    await welcome.getByRole("button", { name: "Cancel" }).click();
  }
  const skip = page.getByRole("button", { name: "Skip tour" });
  if (await skip.waitFor({ timeout: 15_000 }).then(() => true, () => false)) { await skip.click(); await expect(skip).toHaveCount(0); }
}

export const chatRow = (page, name) => page.locator(".chat-row", { hasText: name }).first();
export const openChat = async (page, name) => { await chatRow(page, name).click(); await expect(page.locator(".chat-title")).toContainText(name); };

/** A screenshot once the page has settled (menus and dialogs fade in), saved in .state/shots for looking at. */
export const snap = async (page, name) => { await page.waitForTimeout(500); await page.screenshot({ path: `${shots}/${name}.png` }); };
