/** What the live connection tells us about. */
export interface PushEvent { type: string; subject?: any }

type Fetch = typeof fetch;

/**
 * GroupMe's live updates: a Bayeux long-polling connection (handshake, subscribe to /user/<id>, then repeated connects) to push.groupme.com.
 * Written from the public description of that protocol. Reconnects by itself and says whether it is connected.
 */
export class PushClient {
  private stopped = false;
  private ctl?: AbortController;
  private msgId = 0;
  connected = false;

  constructor(private url: string, private token: string, private userId: string, private onEvent: (e: PushEvent) => void, private onState: (connected: boolean) => void = () => {}, private doFetch: Fetch = fetch) {}

  start() { this.stopped = false; void this.loop(); }
  stop() { this.stopped = true; this.ctl?.abort(); this.setConnected(false); }

  private setConnected(c: boolean) { if (this.connected !== c) { this.connected = c; this.onState(c); } }

  private async post(messages: unknown[]): Promise<any[]> {
    this.ctl = new AbortController();
    const res = await this.doFetch(this.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(messages), signal: this.ctl.signal });
    if (!res.ok) throw new Error(`push said ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [data];
  }
  private id() { return String(++this.msgId); }

  private async loop() {
    let wait = 1000;
    while (!this.stopped) {
      try {
        const hs = (await this.post([{ channel: "/meta/handshake", version: "1.0", supportedConnectionTypes: ["long-polling"], id: this.id() }])).find((m) => m.channel === "/meta/handshake");
        if (!hs?.successful || !hs.clientId) throw new Error("handshake refused");
        const client = hs.clientId as string;
        const sub = (await this.post([{ channel: "/meta/subscribe", clientId: client, subscription: `/user/${this.userId}`, id: this.id(), ext: { access_token: this.token, timestamp: Math.floor(Date.now() / 1000) } }])).find((m) => m.channel === "/meta/subscribe");
        if (sub && sub.successful === false) throw new Error("subscription refused");
        this.setConnected(true); wait = 1000;
        while (!this.stopped) {
          const msgs = await this.post([{ channel: "/meta/connect", clientId: client, connectionType: "long-polling", id: this.id() }]);
          for (const m of msgs) {
            if (m.channel === "/meta/connect" && m.successful === false) throw new Error("connection dropped");
            if (m.channel === `/user/${this.userId}` && m.data) { try { this.onEvent({ type: String(m.data.type ?? ""), subject: m.data.subject }); } catch { /* one bad event must not end the connection */ } }
          }
        }
      } catch {
        this.setConnected(false);
        if (this.stopped) return;
        await new Promise((r) => setTimeout(r, wait)); wait = Math.min(wait * 2, 60_000);
      }
    }
  }
}
