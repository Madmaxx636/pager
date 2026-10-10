import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** One GroupMe account linked by one Matrix user. */
export interface Login { id: string; mxid: string; name: string; token: string }

/** One chat: a GroupMe group or a direct conversation, and the Matrix room that mirrors it. */
export interface Portal {
  /** "g:<group id>" or "d:<other user's id>". */
  key: string;
  login: string;
  roomId: string;
  name: string;
  /** The newest GroupMe message already copied into the room. */
  lastMessageId?: string;
}

interface State {
  logins: Record<string, Login>;
  portals: Record<string, Portal>;
  /** GroupMe message id -> Matrix event id, and back, so replies, deletions and echoes line up. */
  toMatrix: Record<string, string>;
  toGroupme: Record<string, string>;
  /** Picture URL -> mxc, so each picture is uploaded once. */
  avatars: Record<string, string>;
}

const MAX_LINKS = 8000;

/** Everything the bridge remembers, kept in one small JSON file that is replaced atomically on every change. */
export class Store {
  private s: State = { logins: {}, portals: {}, toMatrix: {}, toGroupme: {}, avatars: {} };
  private timer?: NodeJS.Timeout;
  constructor(private file: string | null) {
    if (file && existsSync(file)) {
      try { this.s = { ...this.s, ...JSON.parse(readFileSync(file, "utf8")) }; } catch { /* a damaged file starts fresh rather than blocking the bridge */ }
    }
  }

  logins() { return Object.values(this.s.logins); }
  login(id: string) { return this.s.logins[id]; }
  loginsOf(mxid: string) { return this.logins().filter((l) => l.mxid === mxid); }
  setLogin(l: Login) { this.s.logins[l.id] = l; this.save(); }
  removeLogin(id: string) { delete this.s.logins[id]; for (const [k, p] of Object.entries(this.s.portals)) if (p.login === id) delete this.s.portals[k]; this.save(); }

  portal(login: string, key: string) { return this.s.portals[`${login}|${key}`]; }
  portalByRoom(roomId: string) { return Object.values(this.s.portals).find((p) => p.roomId === roomId); }
  portalsOf(login: string) { return Object.values(this.s.portals).filter((p) => p.login === login); }
  setPortal(p: Portal) { this.s.portals[`${p.login}|${p.key}`] = p; this.save(); }

  eventFor(gmId: string) { return this.s.toMatrix[gmId]; }
  messageFor(eventId: string) { return this.s.toGroupme[eventId]; }
  link(gmId: string, eventId: string) {
    this.s.toMatrix[gmId] = eventId; this.s.toGroupme[eventId] = gmId;
    const keys = Object.keys(this.s.toMatrix);
    if (keys.length > MAX_LINKS) for (const k of keys.slice(0, keys.length - MAX_LINKS)) { delete this.s.toGroupme[this.s.toMatrix[k]]; delete this.s.toMatrix[k]; }
    this.save();
  }

  avatar(url: string) { return this.s.avatars[url]; }
  setAvatar(url: string, mxc: string) { this.s.avatars[url] = mxc; this.save(); }

  private save() {
    if (!this.file) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 200);
  }
  flush() {
    if (!this.file) return;
    clearTimeout(this.timer);
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = this.file + ".tmp";
    writeFileSync(tmp, JSON.stringify(this.s), { mode: 0o600 });
    renameSync(tmp, this.file);
  }
}
