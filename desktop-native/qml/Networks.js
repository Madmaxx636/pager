.pragma library
// How each chat network is shown (the same names and colours as the other Pager apps).
const NETWORKS = {
  whatsapp: ["WhatsApp", "#25d366", "W"], signal: ["Signal", "#3a76f0", "S"], discord: ["Discord", "#5865f2", "D"], telegram: ["Telegram", "#2aabee", "T"],
  instagram: ["Instagram", "#e1306c", "I"], gvoice: ["Google Voice", "#1a73e8", "V"], googlevoice: ["Google Voice", "#1a73e8", "V"], irc: ["IRC", "#6b7280", "#"],
  msteams: ["Microsoft Teams", "#5b5fc7", "T"], teams: ["Microsoft Teams", "#5b5fc7", "T"], heisenbridge: ["IRC", "#6b7280", "#"], messenger: ["Messenger", "#0a7cff", "M"],
  gmessages: ["Messages", "#1a73e8", "G"], groupme: ["GroupMe", "#00aff0", "G"], matrix: ["Matrix", "#8a94a6", "#"]
}
function meta(id) { const n = NETWORKS[id]; return n ? { label: n[0], color: n[1], glyph: n[2] } : { label: id, color: "#8a94a6", glyph: (id || "?")[0].toUpperCase() } }

function stateLabel(state) {
  switch (state) {
    case "CONNECTED": return ["Connected", "#22c55e"]
    case "CONNECTING": case "TRANSIENT_DISCONNECT": return ["Reconnecting…", "#f59e0b"]
    case "BAD_CREDENTIALS": case "LOGGED_OUT": return ["Sign in again", "#ef4444"]
    case "UNKNOWN_ERROR": return ["Error", "#ef4444"]
    case undefined: case "": return ["Unknown", "#8a94a6"]
    default: return [String(state).toLowerCase().replace(/_/g, " "), "#8a94a6"]
  }
}

/** Turns pasted text into cookie values: a JSON object, a "Cookie: a=1; b=2" header, or a copied cURL command. */
function parseCookies(text) {
  const t = text.trim()
  if (t.startsWith("{")) { try { const o = JSON.parse(t); const r = {}; for (const k in o) r[k] = String(o[k]); return r } catch (e) { /* fall through */ } }
  const m = /(?:-b|--cookie)\s+(['"])([\s\S]*?)\1/.exec(t) || /cookie:\s*([^\n'"]+)/i.exec(t)
  const raw = m ? (m[2] !== undefined ? m[2] : m[1]) : t
  const out = {}
  for (const part of raw.split(/;\s*/)) { const i = part.indexOf("="); if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim() }
  return out
}
