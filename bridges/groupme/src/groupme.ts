import type { Config } from "./config.ts";

export class GroupMeError extends Error {
  constructor(public status: number, message: string) { super(message); }
  get unauthorized() { return this.status === 401; }
}

export interface GmAttachment { type: string; url?: string; lat?: string; lng?: string; name?: string; reply_id?: string; base_reply_id?: string; [k: string]: unknown }
/** A message as GroupMe sends it. Group and direct messages share most fields. */
export interface GmMessage {
  id: string; source_guid?: string; created_at: number; user_id?: string; sender_id?: string; recipient_id?: string;
  name?: string; avatar_url?: string; text?: string | null; system?: boolean; attachments?: GmAttachment[]; group_id?: string; chat_id?: string; conversation_id?: string;
}
export interface GmMember { user_id: string; nickname?: string; image_url?: string }
export interface GmGroup { id: string; name: string; description?: string; image_url?: string; members?: GmMember[]; messages?: { last_message_id?: string } }
export interface GmChat { other_user: { id: string; name: string; avatar_url?: string }; last_message?: GmMessage }
export interface GmMe { id: string; name: string; image_url?: string }

/** GroupMe's public REST API (dev.groupme.com), called with one person's access token. */
export class GroupMe {
  constructor(private cfg: Config, private token: string, private doFetch: typeof fetch = fetch) {}

  private async call(method: string, path: string, body?: unknown, query: Record<string, string | number | undefined> = {}) {
    const url = new URL(this.cfg.groupmeApi + path);
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, String(v));
    const res = await this.doFetch(url, {
      method, headers: { "x-access-token": this.token, ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { /* some replies are empty */ }
    if (!res.ok) throw new GroupMeError(res.status, data?.meta?.errors?.join?.(", ") ?? `GroupMe said ${res.status}`);
    return data.response ?? data;
  }

  me(): Promise<GmMe> { return this.call("GET", "/users/me"); }

  async groups(): Promise<GmGroup[]> {
    const all: GmGroup[] = [];
    for (let page = 1; page <= 20; page++) {
      const part: GmGroup[] = await this.call("GET", "/groups", undefined, { per_page: 100, page });
      all.push(...part);
      if (part.length < 100) break;
    }
    return all;
  }
  group(id: string): Promise<GmGroup> { return this.call("GET", `/groups/${id}`); }

  async chats(): Promise<GmChat[]> {
    const all: GmChat[] = [];
    for (let page = 1; page <= 20; page++) {
      const part: GmChat[] = await this.call("GET", "/chats", undefined, { per_page: 100, page });
      all.push(...part);
      if (part.length < 100) break;
    }
    return all;
  }

  /** The newest [limit] messages of a group, oldest first. */
  async groupMessages(groupId: string, limit: number, afterId?: string): Promise<GmMessage[]> {
    const r = await this.call("GET", `/groups/${groupId}/messages`, undefined, { limit: Math.min(limit, 100), ...(afterId ? { after_id: afterId } : {}) });
    const list: GmMessage[] = r.messages ?? [];
    return afterId ? list : list.slice().reverse();
  }
  /** The newest [limit] direct messages with one person, oldest first. */
  async directMessages(otherUserId: string, limit: number, afterId?: string): Promise<GmMessage[]> {
    const r = await this.call("GET", "/direct_messages", undefined, { other_user_id: otherUserId, limit: Math.min(limit, 100), ...(afterId ? { after_id: afterId } : {}) });
    const list: GmMessage[] = r.direct_messages ?? [];
    return afterId ? list : list.slice().reverse();
  }

  async sendGroup(groupId: string, text: string, guid: string, attachments: GmAttachment[] = []): Promise<GmMessage> {
    const r = await this.call("POST", `/groups/${groupId}/messages`, { message: { source_guid: guid, text, attachments } });
    return r.message;
  }
  async sendDirect(recipientId: string, text: string, guid: string, attachments: GmAttachment[] = []): Promise<GmMessage> {
    const r = await this.call("POST", "/direct_messages", { direct_message: { source_guid: guid, recipient_id: recipientId, text, attachments } });
    return r.direct_message;
  }
  async deleteMessage(conversationId: string, messageId: string) { await this.call("DELETE", `/conversations/${conversationId}/messages/${messageId}`); }

  /** Uploads a picture to GroupMe's image service and returns the address to attach. */
  async uploadImage(bytes: Uint8Array, contentType: string): Promise<string> {
    const res = await this.doFetch(this.cfg.groupmeImageApi + "/pictures", { method: "POST", headers: { "x-access-token": this.token, "content-type": contentType }, body: bytes as unknown as BodyInit });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !data?.payload?.url) throw new GroupMeError(res.status, "GroupMe did not accept the picture");
    return data.payload.url;
  }

  async download(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    const res = await this.doFetch(url);
    if (!res.ok) throw new GroupMeError(res.status, "could not download the file from GroupMe");
    return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get("content-type") ?? "application/octet-stream" };
  }
}
