#![recursion_limit = "512"]
//! Pager's Matrix engine for the native desktop app.
//!
//! The Qt interface talks to this through a handful of C functions (see `include/pager_core.h`). Everything it tells the interface goes through one
//! callback as `(kind, json)`; everything the interface asks for is a function that returns at once and answers later through that callback.
//! Sign-in, the encrypted store, syncing, decrypting and sending are the Matrix SDK's job (the same crypto library the Android app uses).

use std::ffi::{c_char, c_void, CStr, CString};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use matrix_sdk::authentication::matrix::MatrixSession;
use matrix_sdk::config::SyncSettings;
use matrix_sdk::room::MessagesOptions;
use matrix_sdk::ruma::events::room::message::RoomMessageEventContent;
use matrix_sdk::ruma::{OwnedRoomId, RoomId};
use matrix_sdk::{Client, LoopCtrl};
use serde_json::{json, Value};

type Callback = extern "C" fn(user: *mut c_void, kind: *const c_char, json: *const c_char);

#[derive(Clone)]
struct Tell { cb: Callback, user: usize }
unsafe impl Send for Tell {}
unsafe impl Sync for Tell {}
impl Tell {
    fn say(&self, kind: &str, body: &Value) {
        let (k, j) = (CString::new(kind).unwrap_or_default(), CString::new(body.to_string()).unwrap_or_default());
        (self.cb)(self.user as *mut c_void, k.as_ptr(), j.as_ptr());
    }
    fn problem(&self, what: &str, e: impl std::fmt::Display) { self.say("problem", &json!({ "what": what, "message": e.to_string() })); }
}

pub struct Engine {
    rt: tokio::runtime::Runtime,
    dir: PathBuf,
    tell: Tell,
    client: Mutex<Option<Client>>,
    sync: Mutex<Option<tokio::task::JoinHandle<()>>>,
}

fn s(p: *const c_char) -> String { if p.is_null() { String::new() } else { unsafe { CStr::from_ptr(p) }.to_string_lossy().into_owned() } }

// ---- what is saved on this computer --------------------------------------------------------------------------------------------------
fn session_file(dir: &std::path::Path) -> PathBuf { dir.join("session.json") }
fn store_dir(dir: &std::path::Path) -> PathBuf { dir.join("store") }
/// The store's passphrase: made once and kept in a file only you can read. (A system keyring can replace this later.)
fn store_key(dir: &std::path::Path) -> std::io::Result<String> {
    let f = dir.join("store.key");
    if let Ok(k) = std::fs::read_to_string(&f) { if k.len() >= 32 { return Ok(k.trim().to_string()); } }
    use std::io::Read;
    let mut b = [0u8; 32]; std::fs::File::open("/dev/urandom")?.read_exact(&mut b)?;
    let k: String = b.iter().map(|x| format!("{x:02x}")).collect();
    std::fs::create_dir_all(dir)?; std::fs::write(&f, &k)?;
    #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; std::fs::set_permissions(&f, std::fs::Permissions::from_mode(0o600))?; }
    Ok(k)
}

/// The SDK only reports what is new to it, so after a restart a sync would say nothing about chats it already knows. The screens are filled from what the server says,
/// so what it remembers of chats (not its keys!) is thrown away each time Pager starts: the first sync then tells about every chat again, like the web app's does.
fn wipe_chat_cache(dir: &std::path::Path) {
    let store = store_dir(dir);
    for name in ["matrix-sdk-state.sqlite3", "matrix-sdk-event-cache.sqlite3"] {
        for suffix in ["", "-wal", "-shm"] { let _ = std::fs::remove_file(store.join(format!("{name}{suffix}"))); }
    }
}

async fn build_client(dir: &std::path::Path, homeserver: &str) -> anyhow::Result<Client> {
    let key = store_key(dir)?;
    // A first sync of a big account can take well over the 30 seconds an HTTP request is allowed by default.
    Ok(Client::builder().homeserver_url(homeserver).sqlite_store(store_dir(dir), Some(&key))
        .request_config(matrix_sdk::config::RequestConfig::new().timeout(Duration::from_secs(300)).retry_limit(4)).build().await?)
}

// ---- what is told to the interface -----------------------------------------------------------------------------------------------------
/// One event as the interface wants it: the event itself (already decrypted when it could be) plus the sender's name and whether it is still locked.
async fn event_json(room: &matrix_sdk::Room, ev: &matrix_sdk::deserialized_responses::TimelineEvent) -> Value {
    let mut v: Value = serde_json::from_str(ev.raw().json().get()).unwrap_or(Value::Null);
    let locked = matches!(ev.kind, matrix_sdk::deserialized_responses::TimelineEventKind::UnableToDecrypt { .. });
    if let Some(sender) = v.get("sender").and_then(Value::as_str).and_then(|u| matrix_sdk::ruma::UserId::parse(u).ok()) {
        if let Ok(Some(m)) = room.get_member_no_sync(&sender).await { v["sender_name"] = json!(m.name()); }
    }
    v["locked"] = json!(locked);
    v
}

async fn room_json(room: &matrix_sdk::Room, events: Vec<Value>) -> Value {
    let name = room.display_name().await.map(|n| n.to_string()).unwrap_or_else(|_| room.room_id().to_string());
    let counts = room.unread_notification_counts();
    let heroes: Vec<String> = room.heroes().await.iter().map(|h| h.user_id.to_string()).collect();
    json!({
        "id": room.room_id(), "name": name, "direct": room.is_direct().await.unwrap_or(false), "encrypted": room.encryption_state().is_encrypted(),
        "unread": counts.notification_count, "highlights": counts.highlight_count, "avatar": room.avatar_url().map(|u| u.to_string()), "events": events,
        "heroes": heroes, "member_count": room.joined_members_count(),
        "own_name": room.name(),
    })
}

/// What the server is asked to send: a short stretch of each chat (like the other Pager apps), people filled in only as needed, no presence.
/// Without this a big account's first answer is enormous and slow.
fn sync_filter() -> Option<matrix_sdk::ruma::api::client::filter::FilterDefinition> {
    serde_json::from_value(json!({
        "presence": { "types": [] },
        "room": { "timeline": { "limit": 20 }, "state": { "lazy_load_members": true }, "ephemeral": { "types": ["m.receipt"] } }
    })).ok()
}

async fn run_sync(client: Client, tell: Tell) {
    tell.say("state", &json!({ "signedIn": true, "user": client.user_id().map(|u| u.to_string()), "device": client.device_id().map(|d| d.to_string()), "syncing": true, "homeserver": client.homeserver().to_string() }));
    let mut waited = 0u64;
    let mut first = true;
    loop {
        // Every start begins with a fresh first sync: the engine only tells the screens what a sync brings, so continuing from the saved
        // position would show nothing but what changed since the last run (an empty list for anyone who just reopens the app).
        let token = if first { matrix_sdk::config::SyncToken::NoToken } else { matrix_sdk::config::SyncToken::ReusePrevious };
        first = false;
        let mut settings = SyncSettings::default().timeout(Duration::from_secs(30)).token(token);
        if let Some(f) = sync_filter() { settings = settings.filter(matrix_sdk::ruma::api::client::sync::sync_events::v3::Filter::FilterDefinition(f)); }
        let (c2, t2) = (client.clone(), tell.clone());
        let result = client.sync_with_callback(settings, move |resp| {
            let (client, tell) = (c2.clone(), t2.clone());
            async move {
                let mut rooms = Vec::new();
                for (id, update) in resp.rooms.joined.iter() {
                    let Some(room) = client.get_room(id) else { continue };
                    let mut events = Vec::new();
                    for ev in update.timeline.events.iter() { events.push(event_json(&room, ev).await); }
                    let mut r = room_json(&room, events).await;
                    r["limited"] = json!(update.timeline.limited); r["prev_batch"] = json!(update.timeline.prev_batch);
                    let raw = |v: &str| serde_json::from_str::<Value>(v).unwrap_or(Value::Null);
                    let state: Vec<Value> = match &update.state { matrix_sdk::sync::State::Before(v) => v.iter().map(|e| raw(e.json().get())).collect(), matrix_sdk::sync::State::After(v) => v.iter().map(|e| raw(e.json().get())).collect() };
                    r["state"] = json!(state);
                    r["ephemeral"] = json!(update.ephemeral.iter().map(|e| raw(e.json().get())).collect::<Vec<_>>());
                    r["account_data"] = json!(update.account_data.iter().map(|e| raw(e.json().get())).collect::<Vec<_>>());
                    rooms.push(r);
                }
                // Bridges and people invite you into chats: say yes, like the other Pager apps do.
                for id in resp.rooms.invited.keys() { if let Some(room) = client.get_room(id) { if let Err(e) = room.join().await { tell.problem("could not join an invitation", e); } } }
                for id in resp.rooms.left.keys() { tell.say("left", &json!({ "id": id })); }
                if !rooms.is_empty() { tell.say("rooms", &json!({ "rooms": rooms })); }
                tell.say("synced", &json!({ "rooms": rooms.len(), "joined": resp.rooms.joined.len(), "known": client.rooms().len() }));
                LoopCtrl::Continue
            }
        }).await;
        // The loop only ends when something went wrong: say so, wait a little (longer each time) and start again.
        if let Err(e) = result { tell.problem("sync stopped, trying again", e); }
        tell.say("state", &json!({ "signedIn": true, "syncing": false }));
        waited = (waited + 5).min(60);
        tokio::time::sleep(Duration::from_secs(waited)).await;
        tell.say("state", &json!({ "signedIn": true, "syncing": true }));
    }
}

impl Engine {
    fn start_sync(self: &Arc<Self>, client: Client) {
        *self.client.lock().unwrap() = Some(client.clone());
        let handle = self.rt.spawn(run_sync(client, self.tell.clone()));
        if let Some(old) = self.sync.lock().unwrap().replace(handle) { old.abort(); }
    }
    fn client(&self) -> Option<Client> { self.client.lock().unwrap().clone() }
}

// ---- the C interface ---------------------------------------------------------------------------------------------------------------------
/// Starts the engine. [data_dir] holds the saved sign-in and the encrypted store. If someone was signed in before, syncing starts at once.
#[no_mangle]
pub extern "C" fn pager_start(data_dir: *const c_char, cb: Callback, user: *mut c_void) -> *mut Arc<Engine> {
    let dir = PathBuf::from(s(data_dir));
    let rt = match tokio::runtime::Builder::new_multi_thread().worker_threads(2).enable_all().thread_name("pager-core").build() { Ok(r) => r, Err(_) => return std::ptr::null_mut() };
    let engine = Arc::new(Engine { rt, dir: dir.clone(), tell: Tell { cb, user: user as usize }, client: Mutex::new(None), sync: Mutex::new(None) });
    let e = engine.clone();
    engine.rt.spawn(async move {
        let saved: Option<(String, MatrixSession)> = std::fs::read_to_string(session_file(&e.dir)).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()).and_then(|v| {
            Some((v.get("homeserver")?.as_str()?.to_string(), serde_json::from_value(v.get("session")?.clone()).ok()?))
        });
        match saved {
            None => e.tell.say("state", &json!({ "signedIn": false })),
            Some((hs, session)) => { wipe_chat_cache(&e.dir); match build_client(&e.dir, &hs).await {
                Ok(client) => match client.restore_session(session).await {
                    Ok(()) => e.start_sync(client),
                    Err(err) => { e.tell.problem("could not restore the sign-in", err); e.tell.say("state", &json!({ "signedIn": false })); }
                },
                Err(err) => { e.tell.problem("could not open the store", err); e.tell.say("state", &json!({ "signedIn": false })); }
            } },
        }
    });
    Box::into_raw(Box::new(engine))
}

#[no_mangle]
pub extern "C" fn pager_login(h: *mut Arc<Engine>, homeserver: *const c_char, user: *const c_char, password: *const c_char) {
    let Some(e) = (unsafe { h.as_ref() }).cloned() else { return };
    let (hs, user, pw) = (s(homeserver), s(user), s(password));
    let e2 = e.clone();
    e.rt.spawn(async move {
        let hs = if hs.contains("://") { hs } else { format!("https://{hs}") };
        let client = match build_client(&e2.dir, &hs).await { Ok(c) => c, Err(err) => { e2.tell.say("state", &json!({ "signedIn": false, "error": err.to_string() })); return; } };
        match client.matrix_auth().login_username(&user, &pw).initial_device_display_name("Pager (desktop)").send().await {
            Ok(_) => {
                if let Some(session) = client.matrix_auth().session() {
                    let _ = std::fs::create_dir_all(&e2.dir);
                    let _ = std::fs::write(session_file(&e2.dir), json!({ "homeserver": hs, "session": session }).to_string());
                    #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; let _ = std::fs::set_permissions(session_file(&e2.dir), std::fs::Permissions::from_mode(0o600)); }
                }
                e2.start_sync(client);
            }
            Err(err) => e2.tell.say("state", &json!({ "signedIn": false, "error": err.to_string() })),
        }
    });
}

/// Loads older messages of a room (from [from], a token the interface got earlier, or the newest when it is empty).
#[no_mangle]
pub extern "C" fn pager_load_history(h: *mut Arc<Engine>, room_id: *const c_char, from: *const c_char) {
    let Some(e) = (unsafe { h.as_ref() }).cloned() else { return };
    let (rid, from) = (s(room_id), s(from));
    let e2 = e.clone();
    e.rt.spawn(async move {
        let Some(client) = e2.client() else { return };
        let Ok(id) = RoomId::parse(&rid) else { return };
        let Some(room) = client.get_room(&id) else { return };
        let mut opts = MessagesOptions::backward(); opts.limit = 40u32.into();
        if !from.is_empty() { opts.from = Some(from); }
        match room.messages(opts).await {
            Ok(m) => {
                let mut events = Vec::new();
                for ev in m.chunk.iter() { events.push(event_json(&room, ev).await); }
                events.reverse(); // newest last, like the live ones
                e2.tell.say("history", &json!({ "room": rid, "events": events, "end": m.end }));
            }
            Err(err) => e2.tell.problem("could not load older messages", err),
        }
    });
}

#[no_mangle]
pub extern "C" fn pager_send_text(h: *mut Arc<Engine>, room_id: *const c_char, body: *const c_char) {
    let Some(e) = (unsafe { h.as_ref() }).cloned() else { return };
    let (rid, body) = (s(room_id), s(body));
    let e2 = e.clone();
    e.rt.spawn(async move {
        let Some(client) = e2.client() else { return };
        let Ok(id) = OwnedRoomId::try_from(rid.as_str()) else { return };
        let Some(room) = client.get_room(&id) else { return };
        match room.send(RoomMessageEventContent::text_plain(body)).await {
            Ok(r) => e2.tell.say("sent", &json!({ "room": rid, "event_id": r.response.event_id })),
            Err(err) => e2.tell.problem("could not send", err),
        }
    });
}

/// Sends any event: a reaction, an edit, a reply, a poll, a vote... [content_json] is the event's content exactly as Matrix defines it.
/// [txn] is whatever the caller wants to hear back: the answer is "sent" {room, txn, event_id} or "send_failed" {room, txn, error}.
#[no_mangle]
pub extern "C" fn pager_send_event(h: *mut Arc<Engine>, room_id: *const c_char, event_type: *const c_char, content_json: *const c_char, txn: *const c_char) {
    let Some(e) = (unsafe { h.as_ref() }).cloned() else { return };
    let (rid, ty, content, txn) = (s(room_id), s(event_type), s(content_json), s(txn));
    let e2 = e.clone();
    e.rt.spawn(async move {
        let fail = |why: String| e2.tell.say("send_failed", &json!({ "room": rid, "txn": txn, "error": why }));
        let Some(client) = e2.client() else { return fail("Not signed in".into()) };
        let Ok(id) = OwnedRoomId::try_from(rid.as_str()) else { return fail("Bad chat id".into()) };
        let Some(room) = client.get_room(&id) else { return fail("That chat isn't available".into()) };
        let Ok(body) = serde_json::from_str::<Value>(&content) else { return fail("Bad message".into()) };
        match room.send_raw(&ty, body).await {
            Ok(r) => e2.tell.say("sent", &json!({ "room": rid, "txn": txn, "event_id": r.response.event_id })),
            Err(err) => fail(err.to_string()),
        }
    });
}

/// Removes a message (or a reaction) for everyone.
#[no_mangle]
pub extern "C" fn pager_redact(h: *mut Arc<Engine>, room_id: *const c_char, event_id: *const c_char) {
    let Some(e) = (unsafe { h.as_ref() }).cloned() else { return };
    let (rid, eid) = (s(room_id), s(event_id));
    let e2 = e.clone();
    e.rt.spawn(async move {
        let Some(client) = e2.client() else { return };
        let (Ok(id), Ok(ev)) = (OwnedRoomId::try_from(rid.as_str()), matrix_sdk::ruma::OwnedEventId::try_from(eid.as_str())) else { return };
        let Some(room) = client.get_room(&id) else { return };
        if let Err(err) = room.redact(&ev, None, None).await { e2.tell.problem("could not delete", err); }
    });
}

/// Sends a file or picture from this computer (encrypted automatically in encrypted chats). Answers like pager_send_event.
/// [width] and [height] are the picture's size, or 0.
#[no_mangle]
pub extern "C" fn pager_send_file(h: *mut Arc<Engine>, room_id: *const c_char, path: *const c_char, mime_type: *const c_char, caption: *const c_char, width: u32, height: u32, txn: *const c_char, voice: bool, duration_ms: u64) {
    use matrix_sdk::attachment::{AttachmentConfig, AttachmentInfo, BaseAudioInfo, BaseImageInfo};
    let Some(e) = (unsafe { h.as_ref() }).cloned() else { return };
    let (rid, path, mime_s, caption, txn) = (s(room_id), s(path), s(mime_type), s(caption), s(txn));
    let e2 = e.clone();
    e.rt.spawn(async move {
        let fail = |why: String| e2.tell.say("send_failed", &json!({ "room": rid, "txn": txn, "error": why }));
        let Some(client) = e2.client() else { return fail("Not signed in".into()) };
        let Ok(id) = OwnedRoomId::try_from(rid.as_str()) else { return fail("Bad chat id".into()) };
        let Some(room) = client.get_room(&id) else { return fail("That chat isn't available".into()) };
        let data = match std::fs::read(&path) { Ok(d) => d, Err(err) => return fail(format!("Couldn't read the file: {err}")) };
        let name = std::path::Path::new(&path).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "file".into());
        let mime: mime::Mime = mime_s.parse().unwrap_or(mime::APPLICATION_OCTET_STREAM);
        let mut cfg = AttachmentConfig::new();
        if mime.type_() == mime::IMAGE && width > 0 && height > 0 {
            cfg = cfg.info(AttachmentInfo::Image(BaseImageInfo { width: Some(width.into()), height: Some(height.into()), size: matrix_sdk::ruma::UInt::new(data.len() as u64), blurhash: None, is_animated: None }));
        }
        if mime.type_() == mime::AUDIO {
            let info = BaseAudioInfo { duration: Some(Duration::from_millis(duration_ms)), size: matrix_sdk::ruma::UInt::new(data.len() as u64), waveform: None };
            cfg = cfg.info(if voice { AttachmentInfo::Voice(info) } else { AttachmentInfo::Audio(info) });
        }
        if !caption.is_empty() { cfg = cfg.caption(Some(matrix_sdk::ruma::events::room::message::TextMessageEventContent::plain(caption.clone()))); }
        match room.send_attachment(name, &mime, data, cfg).await {
            Ok(r) => e2.tell.say("sent", &json!({ "room": rid, "txn": txn, "event_id": r.event_id })),
            Err(err) => fail(err.to_string()),
        }
    });
}

/// Sends a file like pager_send_file but with extra fields in the message ([extra_json], an object: view-once, a full-screen attention picture...).
/// The file is encrypted in encrypted chats. Answers like pager_send_event.
#[no_mangle]
pub extern "C" fn pager_send_media(h: *mut Arc<Engine>, room_id: *const c_char, path: *const c_char, mime_type: *const c_char, caption: *const c_char, width: u32, height: u32, txn: *const c_char, extra_json: *const c_char) {
    let Some(e) = (unsafe { h.as_ref() }).cloned() else { return };
    let (rid, path, mime_s, caption, txn, extra) = (s(room_id), s(path), s(mime_type), s(caption), s(txn), s(extra_json));
    let e2 = e.clone();
    e.rt.spawn(async move {
        let fail = |why: String| e2.tell.say("send_failed", &json!({ "room": rid, "txn": txn, "error": why }));
        let Some(client) = e2.client() else { return fail("Not signed in".into()) };
        let Ok(id) = OwnedRoomId::try_from(rid.as_str()) else { return fail("Bad chat id".into()) };
        let Some(room) = client.get_room(&id) else { return fail("That chat isn't available".into()) };
        let data = match std::fs::read(&path) { Ok(d) => d, Err(err) => return fail(format!("Couldn't read the file: {err}")) };
        let name = std::path::Path::new(&path).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "file".into());
        let mime: mime::Mime = mime_s.parse().unwrap_or(mime::APPLICATION_OCTET_STREAM);
        let encrypted = room.latest_encryption_state().await.map(|st| st.is_encrypted()).unwrap_or(false);
        let msgtype = match mime.type_() { mime::IMAGE => "m.image", mime::VIDEO => "m.video", mime::AUDIO => "m.audio", _ => "m.file" };
        let mut info = json!({ "mimetype": mime_s, "size": data.len() });
        if width > 0 && height > 0 { info["w"] = json!(width); info["h"] = json!(height); }
        let mut content = json!({ "msgtype": msgtype, "body": if caption.is_empty() { name.clone() } else { caption.clone() }, "info": info });
        if !caption.is_empty() { content["filename"] = json!(name); }
        if encrypted {
            let mut cursor = std::io::Cursor::new(&data);
            match client.upload_encrypted_file(&mut cursor).await {
                Ok(f) => match serde_json::to_value(&f) { Ok(v) => content["file"] = v, Err(err) => return fail(err.to_string()) },
                Err(err) => return fail(err.to_string()),
            }
        } else {
            match client.media().upload(&mime, data, None).await {
                Ok(r) => content["url"] = json!(r.content_uri),
                Err(err) => return fail(err.to_string()),
            }
        }
        if let Ok(Value::Object(more)) = serde_json::from_str::<Value>(&extra) { for (k, v) in more { content[k] = v; } }
        match room.send_raw("m.room.message", content).await {
            Ok(r) => e2.tell.say("sent", &json!({ "room": rid, "txn": txn, "event_id": r.response.event_id })),
            Err(err) => fail(err.to_string()),
        }
    });
}

/// Uploads a file (not encrypted) and answers "uploaded" {key, url} or {key, error}. For stickers.
#[no_mangle]
pub extern "C" fn pager_upload(h: *mut Arc<Engine>, key: *const c_char, path: *const c_char, mime_type: *const c_char) {
    let Some(e) = (unsafe { h.as_ref() }).cloned() else { return };
    let (key, path, mime_s) = (s(key), s(path), s(mime_type));
    let e2 = e.clone();
    e.rt.spawn(async move {
        let fail = |why: String| e2.tell.say("uploaded", &json!({ "key": key, "error": why }));
        let Some(client) = e2.client() else { return fail("Not signed in".into()) };
        let data = match std::fs::read(&path) { Ok(d) => d, Err(err) => return fail(format!("Couldn't read the file: {err}")) };
        let mime: mime::Mime = mime_s.parse().unwrap_or(mime::APPLICATION_OCTET_STREAM);
        match client.media().upload(&mime, data, None).await {
            Ok(r) => e2.tell.say("uploaded", &json!({ "key": key, "url": r.content_uri })),
            Err(err) => fail(err.to_string()),
        }
    });
}

/// Fetches a picture or file of a message and saves it under the data folder (decrypting it if it was sent encrypted).
/// [content_json] is the message's content (it has the "url" or the encrypted "file"). The answer is "media" {key, path} or {key, error}.
#[no_mangle]
pub extern "C" fn pager_fetch_media(h: *mut Arc<Engine>, key: *const c_char, content_json: *const c_char, thumbnail: bool) {
    use matrix_sdk::media::{MediaFormat, MediaRequestParameters, MediaThumbnailSettings};
    use matrix_sdk::ruma::events::room::MediaSource;
    let Some(e) = (unsafe { h.as_ref() }).cloned() else { return };
    let (key, content) = (s(key), s(content_json));
    let e2 = e.clone();
    e.rt.spawn(async move {
        let fail = |why: String| e2.tell.say("media", &json!({ "key": key, "error": why }));
        let Some(client) = e2.client() else { return fail("Not signed in".into()) };
        let Ok(c) = serde_json::from_str::<Value>(&content) else { return fail("Bad message".into()) };
        // "thumb": {w, h} asks the server for a small version (people's pictures); otherwise a picture's own preview, or the whole file.
        let want_thumb = c.get("thumb").and_then(|t| Some((t.get("w")?.as_u64()? as u32, t.get("h")?.as_u64()? as u32)));
        let source_json = if want_thumb.is_some() { json!({ "url": c["url"] }) }
            else if thumbnail && (c.get("info").and_then(|i| i.get("thumbnail_url")).is_some() || c.get("info").and_then(|i| i.get("thumbnail_file")).is_some()) {
                let i = &c["info"]; if let Some(f) = i.get("thumbnail_file") { json!({ "file": f }) } else { json!({ "url": i["thumbnail_url"] }) }
            } else { c.clone() };
        let source: MediaSource = match serde_json::from_value(source_json) { Ok(m) => m, Err(_) => return fail("This message has no file".into()) };
        let ext = c.get("body").and_then(|b| b.as_str()).and_then(|b| std::path::Path::new(b).extension()).map(|x| x.to_string_lossy().into_owned()).unwrap_or_default();
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        std::hash::Hash::hash(&(&key, thumbnail, want_thumb), &mut hasher);
        let file = e2.dir.join("media").join(format!("{:016x}{}", std::hash::Hasher::finish(&hasher), if ext.is_empty() { String::new() } else { format!(".{ext}") }));
        if file.exists() { return e2.tell.say("media", &json!({ "key": key, "path": file })); }
        let _ = std::fs::create_dir_all(file.parent().unwrap());
        let format = match want_thumb { Some((w, hh)) => MediaFormat::Thumbnail(MediaThumbnailSettings::new(w.into(), hh.into())), None => MediaFormat::File };
        match client.media().get_media_content(&MediaRequestParameters { source, format }, false).await {
            Ok(bytes) => match std::fs::write(&file, bytes) { Ok(_) => e2.tell.say("media", &json!({ "key": key, "path": file })), Err(err) => fail(err.to_string()) },
            Err(err) => fail(err.to_string()),
        }
    });
}

/// Opens your history on a new device: [recovery_key] is the code the other Pager apps showed you (the standard Matrix recovery key). The keys it unlocks
/// are copied from the server's backup into this device, room by room; each step is reported as "recovery" and the end as "recovered".
#[no_mangle]
pub extern "C" fn pager_recover(h: *mut Arc<Engine>, recovery_key: *const c_char) {
    use matrix_sdk_base::crypto::store::types::BackupDecryptionKey;
    use matrix_sdk::ruma::api::client::backup::get_latest_backup_info;
    let Some(e) = (unsafe { h.as_ref() }).cloned() else { return };
    let key_text: String = s(recovery_key).split_whitespace().collect();
    let e2 = e.clone();
    e.rt.spawn(async move {
        let fail = |why: String| e2.tell.say("recovered", &json!({ "ok": false, "error": why }));
        let Some(client) = e2.client() else { return fail("Sign in first".into()) };
        let key = match BackupDecryptionKey::from_base58(&key_text) { Ok(k) => k, Err(_) => return fail("That isn't a recovery key. Check it for typing mistakes.".into()) };
        let info = match client.send(get_latest_backup_info::v3::Request::new()).await { Ok(i) => i, Err(_) => return fail("This account has no key backup to restore from.".into()) };
        let public: String = serde_json::from_str::<Value>(info.algorithm.json().get()).ok().and_then(|v| v.pointer("/auth_data/public_key").or_else(|| v.get("public_key")).and_then(|p| p.as_str().map(String::from))).unwrap_or_default();
        if key.megolm_v1_public_key().to_base64() != public { return fail("That recovery key doesn't match this account's backup.".into()); }
        {
            let guard = client.olm_machine_for_testing().await;
            let Some(machine) = guard.as_ref() else { return fail("Encryption isn't ready yet. Try again in a moment.".into()) };
            let backup = machine.backup_machine();
            if let Err(err) = backup.save_decryption_key(Some(key.clone()), Some(info.version.clone())).await { return fail(err.to_string()); }
            let public_key = key.megolm_v1_public_key();
            public_key.set_version(info.version.clone());
            if let Err(err) = backup.enable_backup_v1(public_key).await { return fail(err.to_string()); }
        }
        let rooms: Vec<_> = client.joined_rooms();
        let total = rooms.len();
        for (i, room) in rooms.iter().enumerate() {
            let _ = client.encryption().backups().download_room_keys_for_room(room.room_id()).await;
            if i % 5 == 0 || i + 1 == total { e2.tell.say("recovery", &json!({ "done": i + 1, "total": total })); }
        }
        e2.tell.say("recovered", &json!({ "ok": true, "rooms": total }));
    });
}

/// How this device stands with encryption: its id, its fingerprint, whether it is saving keys to the online backup and whether a backup exists. Answers "encryption".
#[no_mangle]
pub extern "C" fn pager_encryption_status(h: *mut Arc<Engine>) {
    let Some(e) = (unsafe { h.as_ref() }).cloned() else { return };
    let e2 = e.clone();
    e.rt.spawn(async move {
        let Some(client) = e2.client() else { return };
        let enc = client.encryption();
        let fp = enc.ed25519_key().await.unwrap_or_default();
        let here = enc.backups().are_enabled().await;
        let on_server = enc.backups().fetch_exists_on_server().await.unwrap_or(false);
        e2.tell.say("encryption", &json!({ "device_id": client.device_id().map(|d| d.to_string()).unwrap_or_default(), "fingerprint": fp, "backup_here": here, "backup_on_server": on_server }));
    });
}

/// Starts a new online key backup (replacing any old one) and answers "recovery_created" {ok, key} with the recovery key to show once.
#[no_mangle]
pub extern "C" fn pager_recovery_create(h: *mut Arc<Engine>) {
    let Some(e) = (unsafe { h.as_ref() }).cloned() else { return };
    let e2 = e.clone();
    e.rt.spawn(async move {
        let fail = |why: String| e2.tell.say("recovery_created", &json!({ "ok": false, "error": why }));
        let Some(client) = e2.client() else { return fail("Sign in first".into()) };
        let backups = client.encryption().backups();
        if let Err(err) = backups.disable_and_delete().await { return fail(format!("Couldn't remove the old backup: {err}")); }
        if let Err(err) = backups.create().await { return fail(format!("Couldn't start a new backup: {err}")); }
        let key = {
            let guard = client.olm_machine_for_testing().await;
            let Some(machine) = guard.as_ref() else { return fail("Encryption isn't ready yet. Try again in a moment.".into()) };
            match machine.backup_machine().get_backup_keys().await { Ok(k) => k.decryption_key.map(|d| d.to_base58()), Err(err) => return fail(err.to_string()) }
        };
        let Some(key) = key else { return fail("The new key could not be read back.".into()) };
        let spaced: String = key.chars().collect::<Vec<_>>().chunks(4).map(|c| c.iter().collect::<String>()).collect::<Vec<_>>().join(" ");
        e2.tell.say("recovery_created", &json!({ "ok": true, "key": spaced }));
    });
}

/// Saves every message key of this device into a file protected by [passphrase] (Element's format). Answers "keys_exported" {ok, error}.
#[no_mangle]
pub extern "C" fn pager_keys_export(h: *mut Arc<Engine>, path: *const c_char, passphrase: *const c_char) {
    let Some(e) = (unsafe { h.as_ref() }).cloned() else { return };
    let (path, pass) = (s(path), s(passphrase));
    let e2 = e.clone();
    e.rt.spawn(async move {
        let Some(client) = e2.client() else { return e2.tell.say("keys_exported", &json!({ "ok": false, "error": "Sign in first" })) };
        match client.encryption().export_room_keys(std::path::PathBuf::from(path), &pass, |_| true).await {
            Ok(_) => e2.tell.say("keys_exported", &json!({ "ok": true })),
            Err(err) => e2.tell.say("keys_exported", &json!({ "ok": false, "error": err.to_string() })),
        }
    });
}

/// Reads a key file (made here, on another Pager or by Element). Answers "keys_imported" {ok, imported, total, error}.
#[no_mangle]
pub extern "C" fn pager_keys_import(h: *mut Arc<Engine>, path: *const c_char, passphrase: *const c_char) {
    let Some(e) = (unsafe { h.as_ref() }).cloned() else { return };
    let (path, pass) = (s(path), s(passphrase));
    let e2 = e.clone();
    e.rt.spawn(async move {
        let Some(client) = e2.client() else { return e2.tell.say("keys_imported", &json!({ "ok": false, "error": "Sign in first" })) };
        match client.encryption().import_room_keys(std::path::PathBuf::from(path), &pass).await {
            Ok(r) => e2.tell.say("keys_imported", &json!({ "ok": true, "imported": r.imported_count, "total": r.total_count })),
            Err(err) => e2.tell.say("keys_imported", &json!({ "ok": false, "error": err.to_string() })),
        }
    });
}

/// Tells people you have read up to [event_id] (only you and the server when [private_receipt]) in a room (and clears its unread count).
#[no_mangle]
pub extern "C" fn pager_mark_read(h: *mut Arc<Engine>, room_id: *const c_char, event_id: *const c_char, private_receipt: bool) {
    use matrix_sdk::ruma::api::client::receipt::create_receipt::v3::ReceiptType;
    use matrix_sdk::ruma::events::receipt::ReceiptThread;
    let Some(e) = (unsafe { h.as_ref() }).cloned() else { return };
    let (rid, eid) = (s(room_id), s(event_id));
    let e2 = e.clone();
    e.rt.spawn(async move {
        let Some(client) = e2.client() else { return };
        let (Ok(id), Ok(ev)) = (OwnedRoomId::try_from(rid.as_str()), matrix_sdk::ruma::OwnedEventId::try_from(eid.as_str())) else { return };
        let Some(room) = client.get_room(&id) else { return };
        let kind = if private_receipt { ReceiptType::ReadPrivate } else { ReceiptType::Read };
        if let Err(err) = room.send_single_receipt(kind, ReceiptThread::Unthreaded, ev).await { e2.tell.problem("could not mark as read", err); }
    });
}

/// Starts again from nothing (for "reload everything from the server"): the sync stops, what the SDK remembers of chats is dropped, and a fresh first sync begins.
#[no_mangle]
pub extern "C" fn pager_resync(h: *mut Arc<Engine>) {
    let Some(e) = (unsafe { h.as_ref() }).cloned() else { return };
    let e2 = e.clone();
    e.rt.spawn(async move {
        let task = e2.sync.lock().unwrap().take();
        if let Some(t) = task { t.abort(); }
        let old = e2.client.lock().unwrap().take();
        drop(old);
        tokio::time::sleep(Duration::from_millis(300)).await;
        let saved: Option<(String, MatrixSession)> = std::fs::read_to_string(session_file(&e2.dir)).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()).and_then(|v| {
            Some((v.get("homeserver")?.as_str()?.to_string(), serde_json::from_value(v.get("session")?.clone()).ok()?))
        });
        let Some((hs, session)) = saved else { return };
        wipe_chat_cache(&e2.dir);
        match build_client(&e2.dir, &hs).await {
            Ok(client) => match client.restore_session(session).await { Ok(()) => e2.start_sync(client), Err(err) => e2.tell.problem("could not restore the sign-in", err) },
            Err(err) => e2.tell.problem("could not open the store", err),
        }
    });
}

#[no_mangle]
pub extern "C" fn pager_logout(h: *mut Arc<Engine>) {
    let Some(e) = (unsafe { h.as_ref() }).cloned() else { return };
    let e2 = e.clone();
    e.rt.spawn(async move {
        let task = e2.sync.lock().unwrap().take();
        if let Some(t) = task { t.abort(); }
        let client = e2.client.lock().unwrap().take();
        if let Some(c) = client { let _ = c.matrix_auth().logout().await; }
        let _ = std::fs::remove_file(session_file(&e2.dir)); let _ = std::fs::remove_dir_all(store_dir(&e2.dir)); let _ = std::fs::remove_file(e2.dir.join("store.key"));
        e2.tell.say("state", &json!({ "signedIn": false }));
    });
}

#[no_mangle]
pub extern "C" fn pager_stop(h: *mut Arc<Engine>) {
    if h.is_null() { return; }
    let e = unsafe { Box::from_raw(h) };
    let task = e.sync.lock().unwrap().take();
    if let Some(t) = task { t.abort(); }
    // The store's connection pool must be closed from inside the runtime that owns it.
    let client = e.client.lock().unwrap().take();
    e.rt.block_on(async move { drop(client); tokio::time::sleep(Duration::from_millis(50)).await; });
}

/// Talks to the Pager server (sign-in to chat apps, admin, updates) with this account's access token. [path] starts with "/api/...".
/// [body_json] may be empty. The answer is "http" {key, status, body} where body is the JSON the server sent (or its text).
#[no_mangle]
pub extern "C" fn pager_http(h: *mut Arc<Engine>, key: *const c_char, method: *const c_char, path: *const c_char, body_json: *const c_char) {
    let Some(e) = (unsafe { h.as_ref() }).cloned() else { return };
    let (key, method, path, body) = (s(key), s(method), s(path), s(body_json));
    let e2 = e.clone();
    e.rt.spawn(async move {
        let fail = |why: String| e2.tell.say("http", &json!({ "key": key, "status": 0, "body": { "error": why } }));
        let Some(client) = e2.client() else { return fail("Not signed in".into()) };
        let Some(token) = client.access_token() else { return fail("Not signed in".into()) };
        let url = format!("{}/{}", client.homeserver().as_str().trim_end_matches('/'), path.trim_start_matches('/'));
        let m = match method.to_uppercase().as_str() { "GET" => matrix_sdk::reqwest::Method::GET, "PUT" => matrix_sdk::reqwest::Method::PUT, "DELETE" => matrix_sdk::reqwest::Method::DELETE, _ => matrix_sdk::reqwest::Method::POST };
        let mut req = client.http_client().request(m.clone(), url).bearer_auth(token).timeout(Duration::from_secs(120));
        if m != matrix_sdk::reqwest::Method::GET && m != matrix_sdk::reqwest::Method::DELETE {
            req = req.header("content-type", "application/json").body(if body.is_empty() { "{}".to_string() } else { body });
        }
        match req.send().await {
            Ok(r) => {
                let status = r.status().as_u16();
                let text = r.text().await.unwrap_or_default();
                let parsed: Value = serde_json::from_str(&text).unwrap_or_else(|_| json!({ "text": text }));
                e2.tell.say("http", &json!({ "key": key, "status": status, "body": parsed }));
            }
            Err(err) => fail(err.to_string()),
        }
    });
}

/// Sends a file from this computer to the Pager server (POST, raw bytes) and answers "http" {key, status, body} like pager_http. For voice transcription.
#[no_mangle]
pub extern "C" fn pager_http_file(h: *mut Arc<Engine>, key: *const c_char, path: *const c_char, file: *const c_char, content_type: *const c_char) {
    let Some(e) = (unsafe { h.as_ref() }).cloned() else { return };
    let (key, path, file, ctype) = (s(key), s(path), s(file), s(content_type));
    let e2 = e.clone();
    e.rt.spawn(async move {
        let fail = |why: String| e2.tell.say("http", &json!({ "key": key, "status": 0, "body": { "error": why } }));
        let Some(client) = e2.client() else { return fail("Not signed in".into()) };
        let Some(token) = client.access_token() else { return fail("Not signed in".into()) };
        let data = match std::fs::read(&file) { Ok(d) => d, Err(err) => return fail(format!("Couldn't read the file: {err}")) };
        let url = format!("{}/{}", client.homeserver().as_str().trim_end_matches('/'), path.trim_start_matches('/'));
        let req = client.http_client().post(url).bearer_auth(token).timeout(Duration::from_secs(300)).header("content-type", if ctype.is_empty() { "application/octet-stream".to_string() } else { ctype }).body(data);
        match req.send().await {
            Ok(r) => {
                let status = r.status().as_u16();
                let text = r.text().await.unwrap_or_default();
                let parsed: Value = serde_json::from_str(&text).unwrap_or_else(|_| json!({ "text": text }));
                e2.tell.say("http", &json!({ "key": key, "status": status, "body": parsed }));
            }
            Err(err) => fail(err.to_string()),
        }
    });
}

/// Draws [text] as a QR code: {"size": N, "rows": ["0110…", …]} (1 = dark). Free the answer with pager_free_string.
#[no_mangle]
pub extern "C" fn pager_qr(text: *const c_char) -> *mut c_char {
    let code = qrcode::QrCode::new(s(text).as_bytes());
    let out = match code {
        Ok(c) => {
            let w = c.width();
            let colors = c.to_colors();
            let rows: Vec<String> = (0..w).map(|y| (0..w).map(|x| if colors[y * w + x] == qrcode::Color::Dark { '1' } else { '0' }).collect()).collect();
            json!({ "size": w, "rows": rows })
        }
        Err(_) => json!({ "size": 0, "rows": [] }),
    };
    CString::new(out.to_string()).unwrap().into_raw()
}

#[no_mangle]
pub extern "C" fn pager_free_string(p: *mut c_char) { if !p.is_null() { drop(unsafe { CString::from_raw(p) }); } }

// ---- updates -----------------------------------------------------------------------------------------------------------------------------
// The server publishes /updates/latest.json and a signature next to it. The public key is built into the app, so a file on the server can't be swapped
// for a different one without the release key (the same rule the other Pager apps follow).

fn update_key() -> Option<ed25519_dalek::VerifyingKey> {
    use base64::Engine as _;
    #[cfg(feature = "test-update-key")]
    if let Ok(raw) = std::env::var("PAGER_TEST_UPDATE_PUBKEY") {
        let bytes: [u8; 32] = base64::engine::general_purpose::STANDARD.decode(raw).ok()?.try_into().ok()?;
        return ed25519_dalek::VerifyingKey::from_bytes(&bytes).ok();
    }
    let pem = include_str!("../update-pubkey.pem");
    let b64: String = pem.lines().filter(|l| !l.starts_with("-----")).collect();
    let der = base64::engine::general_purpose::STANDARD.decode(b64.trim()).ok()?;
    let raw: [u8; 32] = der.get(der.len().checked_sub(32)?..)?.try_into().ok()?;
    ed25519_dalek::VerifyingKey::from_bytes(&raw).ok()
}

/// True when [manifest] was signed with the release key.
fn update_verified(manifest: &[u8], signature: &[u8]) -> bool {
    let (Some(key), Ok(sig)) = (update_key(), <[u8; 64]>::try_from(signature)) else { return false };
    key.verify_strict(manifest, &ed25519_dalek::Signature::from_bytes(&sig)).is_ok()
}

/// True when version a is newer than b (1.2.10 > 1.2.9).
fn version_newer(a: &str, b: &str) -> bool {
    let p = |v: &str| -> Vec<u64> { v.split('.').map(|n| n.parse().unwrap_or(0)).collect() };
    let (x, y) = (p(a), p(b));
    for i in 0..3 { let (m, n) = (x.get(i).copied().unwrap_or(0), y.get(i).copied().unwrap_or(0)); if m != n { return m > n; } }
    false
}

fn hex(bytes: &[u8]) -> String { bytes.iter().map(|b| format!("{b:02x}")).collect() }

/// Looks for a newer version. [server] is the Pager address (empty: the one you are signed in to), [current] this app's version, [entry] which
/// line of the update information fits this computer ("native" or "nativeWindows"). Answers "update" {state: "none"|"available"|"error", ...}.
#[no_mangle]
pub extern "C" fn pager_update_check(h: *mut Arc<Engine>, server: *const c_char, current: *const c_char, entry: *const c_char) {
    let Some(e) = (unsafe { h.as_ref() }).cloned() else { return };
    let (server, current, entry) = (s(server), s(current), s(entry));
    let e2 = e.clone();
    e.rt.spawn(async move {
        let say = |v: Value| e2.tell.say("update", &v);
        let base = if server.is_empty() { match e2.client() { Some(c) => c.homeserver().to_string(), None => return say(json!({ "state": "error", "error": "Sign in first" })) } } else { server };
        let base = format!("{}/updates/", base.trim_end_matches('/'));
        let http = matrix_sdk::reqwest::Client::new();
        let get = |name: &str| { let (http, url) = (http.clone(), format!("{base}{name}")); async move { let r = http.get(url).timeout(Duration::from_secs(30)).send().await.ok()?; if !r.status().is_success() { return None; } r.bytes().await.ok() } };
        let Some(man) = get("latest.json").await else { return say(json!({ "state": "none", "note": "Your server doesn't publish updates yet." })) };
        let Some(sig) = get("latest.json.sig").await else { return say(json!({ "state": "error", "error": "The update information isn't signed, so it was ignored." })) };
        if !update_verified(&man, &sig) { return say(json!({ "state": "error", "error": "The update information isn't signed by the Pager release key, so it was ignored." })); }
        let all: Value = match serde_json::from_slice(&man) { Ok(v) => v, Err(_) => return say(json!({ "state": "error", "error": "The update information is unreadable." })) };
        let Some(d) = all.get(&entry) else { return say(json!({ "state": "none", "note": "Your server doesn't publish a native app for this computer yet." })) };
        let (version, file, sha) = (d["version"].as_str().unwrap_or(""), d["file"].as_str().unwrap_or(""), d["sha256"].as_str().unwrap_or("").to_lowercase());
        if version.is_empty() || file.is_empty() || file.contains('/') || file.contains('\\') || sha.len() != 64 || !sha.chars().all(|c| c.is_ascii_hexdigit()) {
            return say(json!({ "state": "error", "error": "The update information is incomplete." }));
        }
        if !version_newer(version, &current) { return say(json!({ "state": "none", "version": current, "note": format!("You're up to date ({current}).") })); }
        say(json!({ "state": "available", "version": version, "file": file, "sha256": sha, "notes": d["notes"].as_str().unwrap_or(""), "base": base }));
    });
}

/// Downloads an update found by pager_update_check into [dest_dir], checking its checksum. Progress is "update_progress" {done, total};
/// the end is "update_ready" {path} or "update_failed" {error}.
#[no_mangle]
pub extern "C" fn pager_update_download(h: *mut Arc<Engine>, base: *const c_char, file: *const c_char, sha256: *const c_char, dest_dir: *const c_char) {
    use sha2::Digest;
    let Some(e) = (unsafe { h.as_ref() }).cloned() else { return };
    let (base, file, sha, dest) = (s(base), s(file), s(sha256).to_lowercase(), s(dest_dir));
    let e2 = e.clone();
    e.rt.spawn(async move {
        let fail = |why: String| e2.tell.say("update_failed", &json!({ "error": why }));
        if file.contains('/') || file.contains('\\') || file.is_empty() { return fail("The update information is incomplete.".into()); }
        let _ = std::fs::remove_dir_all(&dest);
        if let Err(err) = std::fs::create_dir_all(&dest) { return fail(err.to_string()); }
        let path = std::path::Path::new(&dest).join(&file);
        let http = matrix_sdk::reqwest::Client::new();
        let mut last_err = String::new();
        for attempt in 1..=3u64 {
            let res = async {
                let mut r = http.get(format!("{base}{file}")).timeout(Duration::from_secs(600)).send().await.map_err(|x| x.to_string())?;
                if !r.status().is_success() { return Err(format!("server said {}", r.status().as_u16())); }
                let total = r.content_length().unwrap_or(0);
                let (mut hasher, mut done, mut last_pc) = (sha2::Sha256::new(), 0u64, 101u64);
                let mut out = std::fs::File::create(&path).map_err(|x| x.to_string())?;
                while let Some(chunk) = r.chunk().await.map_err(|x| x.to_string())? {
                    std::io::Write::write_all(&mut out, &chunk).map_err(|x| x.to_string())?;
                    hasher.update(&chunk); done += chunk.len() as u64;
                    let pc = if total > 0 { done * 100 / total } else { 0 };
                    if pc != last_pc { last_pc = pc; e2.tell.say("update_progress", &json!({ "done": done, "total": total })); }
                }
                Ok::<String, String>(hex(&hasher.finalize()))
            }.await;
            match res {
                Ok(got) if got == sha => return e2.tell.say("update_ready", &json!({ "path": path })),
                Ok(_) => { let _ = std::fs::remove_file(&path); return fail("The download doesn't match its checksum, so it was not installed.".into()); }
                Err(err) => { last_err = err; tokio::time::sleep(Duration::from_secs(2 * attempt)).await; }
            }
        }
        fail(format!("The download kept stopping ({last_err}). Check your connection and try again."));
    });
}

/// The engine's version, for the About page.
#[no_mangle]
pub extern "C" fn pager_core_version() -> *const c_char { concat!(env!("CARGO_PKG_VERSION"), "\0").as_ptr() as *const c_char }

#[cfg(test)]
mod update_tests {
    use super::*;
    #[test]
    fn versions_compare_like_the_other_apps() {
        assert!(version_newer("1.2.10", "1.2.9")); assert!(!version_newer("1.2.9", "1.2.10")); assert!(!version_newer("0.5.73", "0.5.73")); assert!(version_newer("0.6.0", "0.5.99"));
    }
    #[test]
    fn the_release_key_loads_and_a_bad_signature_is_refused() {
        assert!(update_key().is_some());
        assert!(!update_verified(b"{}", &[0u8; 64]));
        assert!(!update_verified(b"{}", &[0u8; 10]));
    }
}
