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

function phoneKey(n) { const d = String(n || "").replace(/\D/g, ""); return d.length >= 7 ? d.slice(-10) : "" }
/** "+1 (912) 555-0100" -> "+19125550100"; empty when it isn't a phone number. */
function dialable(detail) { const d = String(detail || "").replace(/^tel:/i, "").replace(/[^\d+]/g, ""); return /^\+?\d{6,15}$/.test(d) ? d : "" }
function couldNotResolve(message) { return /resolv|not known|identifier|not found/i.test(String(message || "")) }
function startError(message) { return couldNotResolve(message) ? "Pager couldn't find a number for that contact. Type their phone number in the search box instead." : String(message || "Couldn't start that chat") }
/** Everyone from every account on every network, one row per person (merged by phone number, else by name). found: [{c:{id,name,detail}, way:{net,login,id,detail}}] */
function mergePeople(found, prettyName) {
  const byKey = {}, list = []
  for (const f of found) {
    const name = prettyName(f.c.name)
    const num = f.c.detail ? phoneKey(f.c.detail) : ""
    const key = num || "n:" + name.toLowerCase()
    let p = byKey[key]
    if (!p) { p = byKey[key] = { key: key, name: name, detail: f.c.detail || "", ways: [] }; list.push(p) }
    if (!p.ways.some(w => w.net.id === f.way.net.id && w.login === f.way.login)) p.ways.push(f.way)
    if (!p.detail && f.c.detail) p.detail = f.c.detail
  }
  return list.sort((a, b) => a.name.localeCompare(b.name))
}
function parseContacts(o) {
  const arr = (o && (o.contacts || o.results)) || []
  return arr.map(c => ({ id: c.id || "", name: c.name || (c.identifiers && c.identifiers[0]) || c.id, detail: c.identifiers && c.identifiers[0] ? String(c.identifiers[0]).replace(/^tel:/, "") : "" })).filter(c => c.id)
}
