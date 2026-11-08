/**
 * Which kind of message a file may be sent as. A bridge accepts only some types for pictures, videos and audio (Signal: no .m4a labelled audio/x-m4a, no
 * HEIC, no QuickTime video) and refuses the rest with "unsupported media type", which left the message on "Sent" for ever. Any file can go as a plain
 * file, so a type the bridges do not take is sent that way, and the usual alternative spellings are put right first.
 */
const ALIAS: Record<string, string> = {
  "audio/x-m4a": "audio/mp4", "audio/m4a": "audio/mp4", "audio/x-mp4": "audio/mp4", "audio/x-wav": "audio/wav", "audio/wave": "audio/wav", "audio/vnd.wave": "audio/wav",
  "audio/x-aac": "audio/aac", "audio/x-flac": "audio/flac", "audio/x-mp3": "audio/mpeg", "audio/mpeg3": "audio/mpeg", "audio/x-mpeg": "audio/mpeg",
  "image/jpg": "image/jpeg", "image/pjpeg": "image/jpeg", "video/x-m4v": "video/mp4",
};
/** What the bridges take for each kind (the part they all agree on). */
const BRIDGE_OK: Record<string, string[]> = {
  "m.image": ["image/jpeg", "image/png", "image/gif", "image/webp"],
  "m.video": ["video/mp4", "video/webm"],
  "m.audio": ["audio/aac", "audio/mpeg", "audio/mp3", "audio/flac", "audio/mp4", "audio/wav"],
};

/** The message kind and file type to send [mime] as. [bridged]: the page is on another network; a Pager-only page takes everything as it is. */
export function mediaKind(mime: string, bridged: boolean): { type: "m.image" | "m.video" | "m.audio" | "m.file"; mime: string } {
  const m = (ALIAS[mime.toLowerCase().split(";")[0].trim()] ?? mime.toLowerCase().split(";")[0].trim()) || "application/octet-stream";
  const type = m.startsWith("image/") ? "m.image" : m.startsWith("video/") ? "m.video" : m.startsWith("audio/") ? "m.audio" : "m.file";
  if (type === "m.file" || !bridged) return { type, mime: ALIAS[mime.toLowerCase()] ? m : mime || m };
  return BRIDGE_OK[type].includes(m) ? { type, mime: m } : { type: "m.file", mime: m };
}

/** The bridge's reason for refusing a message, in words for the person. */
export function niceReason(reason: string): string {
  if (/unsupported media type/i.test(reason)) return "it doesn't accept that kind of file";
  if (/too large|too big|file size|MaxSize/i.test(reason)) return "the file is too big for it";
  return reason.replace(/^[A-Z]/, (c) => c.toLowerCase()).slice(0, 140);
}
