import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";

// In dev, forward API and Matrix traffic to a running Pager server: PAGER_SERVER=https://matrix.example.com npm run dev
const target = process.env.PAGER_SERVER ?? "http://localhost:8008";

// The version shown in About comes from the VERSION file at the top of the repository (copied here by the build scripts).
const version = existsSync("VERSION") ? readFileSync("VERSION", "utf8").trim() : "dev";

export default defineConfig({
  define: { "import.meta.env.VITE_APP_VERSION": JSON.stringify(version) },
  base: "./", // relative asset paths: works when served from a server and when loaded from disk by the desktop app
  plugins: [react()],
  server: { proxy: { "/api": target, "/_matrix": target } },
});
