.pragma library
// GIF search through GIPHY and KLIPY with your own keys (same sources and requests as the web app).
const SOURCES = [
    { id: "giphy", name: "GIPHY", keyOf: "giphy", stickers: false },
    { id: "giphy-stickers", name: "GIPHY Stickers", keyOf: "giphy", stickers: true },
    { id: "klipy", name: "KLIPY", keyOf: "klipy", stickers: false },
    { id: "klipy-stickers", name: "KLIPY Stickers", keyOf: "klipy", stickers: true }
]
function withKeys(keys) { return SOURCES.filter(s => ((keys || {})[s.keyOf] || "").trim().length > 0) }

function requestFor(src, key, query) {
    const q = encodeURIComponent(query), k = encodeURIComponent(key.trim())
    if (src.keyOf === "klipy")
        return "https://api.klipy.com/api/v1/" + k + "/" + (src.stickers ? "stickers" : "gifs") + "/" + (query ? "search" : "trending") + "?per_page=30&customer_id=pager&content_filter=medium" + (query ? "&q=" + q : "")
    return "https://api.giphy.com/v1/" + (src.stickers ? "stickers" : "gifs") + "/" + (query ? "search" : "trending") + "?api_key=" + k + "&limit=30&rating=pg-13" + (query ? "&q=" + q : "")
}
function parseGiphy(o, source) {
    const out = []
    for (const r of (o.data || [])) {
        const orig = r.images && r.images.original, small = r.images && r.images.fixed_height_small && r.images.fixed_height_small.url ? r.images.fixed_height_small : (r.images && r.images.fixed_height)
        if (orig && orig.url) out.push({ id: String(r.id), title: r.title || "", previewUrl: small && small.url ? small.url : orig.url, url: orig.url, w: Number(orig.width) || 0, h: Number(orig.height) || 0, source: source })
    }
    return out
}
function parseKlipy(o, source) {
    const list = (o.data && o.data.data) || o.data || []
    const pick = (f, order, kinds) => { for (const sz of order) for (const k of kinds) { const x = f && f[sz] && f[sz][k]; if (x && x.url) return x } return undefined }
    const out = []
    for (const r of (Array.isArray(list) ? list : [])) {
        const send = pick(r.file, ["md", "hd", "sm"], ["gif", "webp", "png"])
        const small = pick(r.file, ["sm", "xs", "md"], ["gif", "webp", "jpg", "png"]) || send
        if (send) out.push({ id: String(r.id || r.slug), title: r.title || "", previewUrl: small.url, url: send.url, w: Number(send.width) || 0, h: Number(send.height) || 0, source: source })
    }
    return out
}
function explain(src, status) {
    const who = src.keyOf === "klipy" ? "KLIPY" : "GIPHY"
    if (status === 401 || status === 403) return who + " rejected the key. Check that it is the " + who + " key, that it is still active, and that it is not restricted to another device or address."
    if (status === 429) return who + " says too many searches were made. A new key is limited to about 100 an hour. Wait a bit and try again."
    return who + " search failed (" + status + ")."
}
// done(error, list)
function search(src, key, query, done) {
    const xhr = new XMLHttpRequest()
    xhr.onreadystatechange = function () {
        if (xhr.readyState !== XMLHttpRequest.DONE) return
        if (xhr.status === 0) return done("Couldn't reach " + (src.keyOf === "klipy" ? "KLIPY" : "GIPHY") + ". Check your connection.", [])
        if (xhr.status < 200 || xhr.status >= 300) return done(explain(src, xhr.status), [])
        try { const o = JSON.parse(xhr.responseText); done("", src.keyOf === "klipy" ? parseKlipy(o, src.id) : parseGiphy(o, src.id)) } catch (e) { done("Unexpected answer from the service.", []) }
    }
    xhr.open("GET", requestFor(src, key, query)); xhr.send()
}
