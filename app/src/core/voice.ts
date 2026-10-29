// Voice messages for WhatsApp: it only plays Ogg/Opus voice notes, while Chrome and the desktop app record WebM/Opus (Safari records MP4).
// This turns a recording into an Ogg/Opus file (decode, encode with the browser's own Opus encoder, wrap in Ogg) and works out the waveform
// that chat apps draw. Returns undefined when the browser can't do it, and the recording is then sent as it was.

const OPUS_RATE = 48000;

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let r = i << 24; for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1; t[i] = r >>> 0; }
  return t;
})();
const crc32 = (b: Uint8Array) => { let c = 0; for (let i = 0; i < b.length; i++) c = ((c << 8) ^ crcTable[((c >>> 24) ^ b[i]) & 0xff]) >>> 0; return c >>> 0; };

/** One Ogg page holding whole packets. */
function page(serial: number, seq: number, flags: number, granule: number, packets: Uint8Array[]): Uint8Array {
  const lacing: number[] = [];
  for (const p of packets) { let n = p.length; while (n >= 255) { lacing.push(255); n -= 255; } lacing.push(n); }
  const body = packets.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(27 + lacing.length + body), v = new DataView(out.buffer);
  out.set([0x4f, 0x67, 0x67, 0x53, 0, flags]);
  v.setUint32(6, granule % 2 ** 32, true); v.setUint32(10, Math.floor(granule / 2 ** 32), true);
  v.setUint32(14, serial, true); v.setUint32(18, seq, true);
  out[26] = lacing.length; out.set(lacing, 27);
  let at = 27 + lacing.length; for (const p of packets) { out.set(p, at); at += p.length; }
  v.setUint32(22, crc32(out), true);
  return out;
}

const text = (s: string) => new TextEncoder().encode(s);
function opusHead(preSkip: number): Uint8Array {
  const h = new Uint8Array(19), v = new DataView(h.buffer);
  h.set(text("OpusHead")); h[8] = 1; h[9] = 1; v.setUint16(10, preSkip, true); v.setUint32(12, OPUS_RATE, true); v.setUint16(16, 0, true); h[18] = 0;
  return h;
}
function opusTags(): Uint8Array {
  const vendor = text("Pager"), t = new Uint8Array(8 + 4 + vendor.length + 4), v = new DataView(t.buffer);
  t.set(text("OpusTags")); v.setUint32(8, vendor.length, true); t.set(vendor, 12); v.setUint32(12 + vendor.length, 0, true);
  return t;
}

/** About 64 bars, each 0..1024 (the loudest part of that stretch), the way chat apps draw a voice message. */
function waveform(pcm: Float32Array, bars = 64): number[] {
  const out: number[] = [], step = Math.max(1, Math.floor(pcm.length / bars));
  let top = 0;
  for (let i = 0; i < bars; i++) { let m = 0; for (let j = i * step; j < Math.min(pcm.length, (i + 1) * step); j++) m = Math.max(m, Math.abs(pcm[j])); out.push(m); top = Math.max(top, m); }
  return out.map((m) => Math.round((top > 0 ? m / top : 0) * 1024));
}

export interface VoiceFile { blob: Blob; waveform: number[]; durationMs: number }

export async function toOggOpus(input: Blob): Promise<VoiceFile | undefined> {
  try {
    const W = window as unknown as { AudioEncoder?: any; AudioData?: any; AudioContext?: typeof AudioContext };
    if (!W.AudioEncoder || !W.AudioData || !W.AudioContext) return undefined;
    const config = { codec: "opus", sampleRate: OPUS_RATE, numberOfChannels: 1, bitrate: 32000 };
    if (!(await W.AudioEncoder.isConfigSupported(config))?.supported) return undefined;

    // Decode to 48 kHz (the context resamples), one channel.
    const ctx = new W.AudioContext({ sampleRate: OPUS_RATE });
    const decoded = await ctx.decodeAudioData(await input.arrayBuffer());
    void ctx.close();
    const pcm = new Float32Array(decoded.length);
    for (let c = 0; c < decoded.numberOfChannels; c++) { const ch = decoded.getChannelData(c); for (let i = 0; i < pcm.length; i++) pcm[i] += ch[i] / decoded.numberOfChannels; }

    // Encode in 20 ms pieces.
    const packets: { data: Uint8Array; samples: number }[] = [];
    let preSkip = 312;
    const enc = new W.AudioEncoder({
      output: (chunk: { byteLength: number; duration?: number; copyTo: (b: Uint8Array) => void }, meta?: { decoderConfig?: { description?: ArrayBuffer } }) => {
        const d = new Uint8Array(chunk.byteLength); chunk.copyTo(d);
        packets.push({ data: d, samples: Math.round(((chunk.duration ?? 20000) / 1e6) * OPUS_RATE) });
        const desc = meta?.decoderConfig?.description;
        if (desc && packets.length === 1) { const dv = new DataView(desc instanceof ArrayBuffer ? desc : (desc as ArrayBufferView).buffer); if (dv.byteLength >= 12) preSkip = dv.getUint16(10, true); }
      },
      error: () => { /* surfaces as a failed flush below */ },
    });
    enc.configure(config);
    const frame = 960; // 20 ms
    for (let at = 0; at < pcm.length; at += frame) {
      const part = new Float32Array(frame); part.set(pcm.subarray(at, Math.min(pcm.length, at + frame)));
      const data = new W.AudioData({ format: "f32-planar", sampleRate: OPUS_RATE, numberOfFrames: frame, numberOfChannels: 1, timestamp: Math.round((at / OPUS_RATE) * 1e6), data: part });
      enc.encode(data); data.close();
    }
    await enc.flush(); enc.close();
    if (!packets.length) return undefined;

    // Wrap in Ogg: the two header pages, then the audio, a second of it to a page.
    const serial = (Math.random() * 2 ** 32) >>> 0;
    const pages: Uint8Array[] = [page(serial, 0, 0x02, 0, [opusHead(preSkip)]), page(serial, 1, 0, 0, [opusTags()])];
    let seq = 2, granule = preSkip, group: Uint8Array[] = [];
    const total = pcm.length + preSkip;
    const flush = (last: boolean) => { pages.push(page(serial, seq++, last ? 0x04 : 0, last ? Math.min(granule, total) : granule, group)); group = []; };
    packets.forEach((p, i) => {
      group.push(p.data); granule += p.samples;
      if (i === packets.length - 1) flush(true); else if (group.length >= 50) flush(false);
    });
    return { blob: new Blob(pages as BlobPart[], { type: "audio/ogg" }), waveform: waveform(pcm), durationMs: Math.round((pcm.length / OPUS_RATE) * 1000) };
  } catch { return undefined; }
}
