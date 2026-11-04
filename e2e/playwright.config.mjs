import { defineConfig } from "@playwright/test";

// Playwright does not know every Linux release yet; the Ubuntu 24.04 build of its browser runs on newer ones too.
if (process.platform === "linux" && !process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE) process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE = "ubuntu24.04-x64";

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.mjs",
  timeout: 60_000,
  workers: 1,                       // one signed-in user on one server: the tests share it
  reporter: [["list"]],
  outputDir: ".state/results",
  use: { baseURL: "http://127.0.0.1:18081", viewport: { width: 1180, height: 760 }, screenshot: "off", trace: "off" },
});
