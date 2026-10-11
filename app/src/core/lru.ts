/**
 * Pictures and other downloaded media, kept as blob addresses so the page can show them again without downloading. Every address holds its
 * file in memory until it is released, so this keeps only what fits in a budget: the oldest unused ones are let go (a minute later, so a
 * picture that is on screen right now is not pulled out from under it) and fetched again if they are ever needed.
 */
export class BlobCache {
  private items = new Map<string, { url: string; size: number }>();
  private bytes = 0;
  constructor(private budget: number, private minKeep = 40, private release: (url: string) => void = (u) => URL.revokeObjectURL(u), private later: (fn: () => void, ms: number) => void = (fn, ms) => void setTimeout(fn, ms)) {}

  /** The address for [key], counting it as just used. */
  get(key: string): string | undefined {
    const it = this.items.get(key);
    if (!it) return undefined;
    this.items.delete(key); this.items.set(key, it); // most recently used goes last
    return it.url;
  }

  set(key: string, url: string, size: number) {
    const old = this.items.get(key);
    if (old) { this.bytes -= old.size; this.items.delete(key); this.later(() => this.release(old.url), 60_000); }
    this.items.set(key, { url, size }); this.bytes += size;
    for (const [k, it] of this.items) {
      if (this.bytes <= this.budget || this.items.size <= this.minKeep) break;
      this.items.delete(k); this.bytes -= it.size; this.later(() => this.release(it.url), 60_000);
    }
  }

  /** Lets go of everything at once (signing out). */
  clear() { for (const it of this.items.values()) this.release(it.url); this.items.clear(); this.bytes = 0; }
  get size() { return this.items.size; }
  get totalBytes() { return this.bytes; }
}
