import { loadConfig } from "./config.ts";
import { createApp } from "./app.ts";

const cfg = loadConfig();
createApp(cfg).listen(cfg.port, () => console.log(`pager-api listening on :${cfg.port}`));
