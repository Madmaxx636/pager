// A stand-in for a bridge, for the test bench (bench.mjs): sends into one chat as the other person ("ghost"), the way a bridge does, and reports on alice's messages.
// Everything a bridge sends on top of the messages themselves is here too: typing, reactions, edits, deletions, read receipts and delivery reports.
import { resolve } from "node:path";
import { DOMAIN } from "./lib.mjs";
import { call, login, makeMedia, upload } from "./history.mjs";

const media = resolve(import.meta.dirname, ".state/media");
let n = 0;
const txn = () => `b${Date.now()}x${n++}`;

export async function bridgeSim(roomId, ghost = "taylor") {
  const m = makeMedia(), alice = await login("alice");
  const mxc = {};
  mxc.img = await Promise.all(m.sizes.map((_, i) => upload(resolve(media, `img${i}.jpg`), "image/jpeg", alice)));
  mxc.vid = await Promise.all(m.vids.map((_, i) => upload(resolve(media, `vid${i}.mp4`), "video/mp4", alice)));
  mxc.voice = await Promise.all(m.voices.map((_, i) => upload(resolve(media, `voice${i}.ogg`), "audio/ogg", alice)));
  mxc.song = await Promise.all(m.songs.map((_, i) => upload(resolve(media, `song${i}.mp3`), "audio/mpeg", alice)));
  const as = (user) => ({ user });
  const send = async (content, user = ghost, type = "m.room.message") => (await call("PUT", `/rooms/${encodeURIComponent(roomId)}/send/${type}/${txn()}`, content, as(user))).event_id;
  const sim = {
    text: (body, extra = {}) => send({ msgtype: "m.text", body, ...extra }),
    reply: (to, body) => send({ msgtype: "m.text", body, "m.relates_to": { "m.in_reply_to": { event_id: to } } }),
    image: (i = 0, { size = true, caption } = {}) => { const [w, h] = m.sizes[i]; return send({ msgtype: "m.image", body: caption ?? `IMG_${i}.jpg`, ...(caption ? { filename: `IMG_${i}.jpg` } : {}), url: mxc.img[i], info: { mimetype: "image/jpeg", size: 30000, ...(size ? { w, h } : {}) } }); },
    video: (i = 0, { size = true } = {}) => { const [w, h, d] = m.vids[i]; return send({ msgtype: "m.video", body: `VID_${i}.mp4`, url: mxc.vid[i], info: { mimetype: "video/mp4", size: 90000, duration: d * 1000, ...(size ? { w, h } : {}) } }); },
    voice: (i = 1) => { const d = m.voices[i]; return send({ msgtype: "m.audio", body: "Voice message", url: mxc.voice[i], info: { mimetype: "audio/ogg", duration: d * 1000, size: d * 3000 }, "org.matrix.msc3245.voice": {}, "org.matrix.msc1767.audio": { duration: d * 1000, waveform: Array.from({ length: 48 }, (_, k) => (k * 37) % 1000) } }); },
    music: (i = 0) => { const [title, d] = m.songs[i]; return send({ msgtype: "m.audio", body: `${title}.mp3`, url: mxc.song[i], info: { mimetype: "audio/mpeg", duration: d * 1000, size: d * 12000 } }); },
    file: (name = "report.pdf") => send({ msgtype: "m.file", body: name, url: mxc.img[0], info: { mimetype: "application/pdf", size: 120000 } }),
    location: () => send({ msgtype: "m.location", body: "Location", geo_uri: "geo:37.7749,-122.4194" }),
    react: (target, key = "👍", user = ghost) => send({ "m.relates_to": { rel_type: "m.annotation", event_id: target, key } }, user, "m.reaction"),
    edit: (target, body) => send({ msgtype: "m.text", body: `* ${body}`, "m.new_content": { msgtype: "m.text", body }, "m.relates_to": { rel_type: "m.replace", event_id: target } }),
    redact: async (target, user = ghost) => (await call("PUT", `/rooms/${encodeURIComponent(roomId)}/redact/${target}/${txn()}`, {}, as(user))).event_id,
    typing: (on, user = ghost) => call("PUT", `/rooms/${encodeURIComponent(roomId)}/typing/@${user}:${DOMAIN}`, { typing: on, timeout: 20000 }, as(user)),
    /** the other person reads alice's message */
    read: (eventId, user = ghost) => call("POST", `/rooms/${encodeURIComponent(roomId)}/receipt/m.read/${encodeURIComponent(eventId)}`, {}, as(user)),
    /** the bridge reports on a message alice sent: it reached the other network */
    status: (target, status = "SUCCESS", extra = {}) => send({ "m.relates_to": { rel_type: "m.reference", event_id: target }, status, success: status === "SUCCESS", ...extra }, "signalbot", "com.beeper.message_send_status").catch(() => send({ "m.relates_to": { rel_type: "m.reference", event_id: target }, status }, ghost, "com.beeper.message_send_status")),
    profile: (displayname, user = ghost) => call("PUT", `/profile/@${user}:${DOMAIN}/displayname`, { displayname }, as(user)),
  };
  return sim;
}
