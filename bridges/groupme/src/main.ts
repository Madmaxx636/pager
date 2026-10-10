import { loadConfig } from "./config.ts";
import { Store } from "./store.ts";
import { MatrixAS } from "./matrix.ts";
import { GroupMe } from "./groupme.ts";
import { PushClient } from "./push.ts";
import { Bridge } from "./bridge.ts";
import { createBridgeServer } from "./server.ts";

const cfg = loadConfig();
const store = new Store(`${cfg.dataDir}/state.json`);
const mx = new MatrixAS(cfg);
const bridge = new Bridge(cfg, store, mx, (token) => new GroupMe(cfg, token), (login, onEvent, onState) => new PushClient(cfg.groupmePush, login.token, login.id, onEvent, onState));
const server = createBridgeServer(cfg, bridge, store, mx);
server.listen(cfg.port, () => console.log(`pager-groupme listening on :${cfg.port}`));
bridge.start();
// Give the bridge's own account a name people recognise (the server may not be ready yet; the bridge works without it).
setTimeout(() => void mx.ensureGhost(mx.botId, "GroupMe bridge bot").catch(() => {}), 3000);
for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => { bridge.stop(); server.close(); process.exit(0); });
