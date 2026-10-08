import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, forward API and Matrix traffic to a running Pager server: PAGER_SERVER=https://matrix.example.com npm run dev
const target = process.env.PAGER_SERVER ?? "http://localhost:8008";

export default defineConfig({
  base: "./", // relative asset paths: works when served from a server and when loaded from disk by the desktop app
  plugins: [react()],
  server: { proxy: { "/api": target, "/_matrix": target } },
});
