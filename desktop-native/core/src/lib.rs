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

async fn build_client(dir: &std::path::Path, homeserver: &str) -> anyhow::Result<Client> {
    let key = store_key(dir)?;
    Ok(Client::builder().homeserver_url(homeserver).sqlite_store(store_dir(dir), Some(&key)).build().await?)
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
    json!({
        "id": room.room_id(), "name": name, "direct": room.is_direct().await.unwrap_or(false), "encrypted": room.encryption_state().is_encrypted(),
        "unread": counts.notification_count, "highlights": counts.highlight_count, "avatar": room.avatar_url().map(|u| u.to_string()), "events": events,
    })
}

async fn run_sync(client: Client, tell: Tell) {
    tell.say("state", &json!({ "signedIn": true, "user": client.user_id().map(|u| u.to_string()), "device": client.device_id().map(|d| d.to_string()), "syncing": true }));
    let settings = SyncSettings::default().timeout(Duration::from_secs(30));
    let c2 = client.clone(); let t2 = tell.clone();
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
                rooms.push(r);
            }
            // Bridges and people invite you into chats: say yes, like the other Pager apps do.
            for id in resp.rooms.invited.keys() { if let Some(room) = client.get_room(id) { if let Err(e) = room.join().await { tell.problem("could not join an invitation", e); } } }
            for id in resp.rooms.left.keys() { tell.say("left", &json!({ "id": id })); }
            if !rooms.is_empty() { tell.say("rooms", &json!({ "rooms": rooms })); }
            LoopCtrl::Continue
        }
    }).await;
    if let Err(e) = result { tell.problem("sync stopped", e); tell.say("state", &json!({ "signedIn": true, "syncing": false })); }
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
            Some((hs, session)) => match build_client(&e.dir, &hs).await {
                Ok(client) => match client.restore_session(session).await {
                    Ok(()) => e.start_sync(client),
                    Err(err) => { e.tell.problem("could not restore the sign-in", err); e.tell.say("state", &json!({ "signedIn": false })); }
                },
                Err(err) => { e.tell.problem("could not open the store", err); e.tell.say("state", &json!({ "signedIn": false })); }
            },
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
pub extern "C" fn pager_send_file(h: *mut Arc<Engine>, room_id: *const c_char, path: *const c_char, mime_type: *const c_char, caption: *const c_char, width: u32, height: u32, txn: *const c_char) {
    use matrix_sdk::attachment::{AttachmentConfig, AttachmentInfo, BaseImageInfo};
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
        if !caption.is_empty() { cfg = cfg.caption(Some(matrix_sdk::ruma::events::room::message::TextMessageEventContent::plain(caption.clone()))); }
        match room.send_attachment(name, &mime, data, cfg).await {
            Ok(r) => e2.tell.say("sent", &json!({ "room": rid, "txn": txn, "event_id": r.event_id })),
            Err(err) => fail(err.to_string()),
        }
    });
}

/// Fetches a picture or file of a message and saves it under the data folder (decrypting it if it was sent encrypted).
/// [content_json] is the message's content (it has the "url" or the encrypted "file"). The answer is "media" {key, path} or {key, error}.
#[no_mangle]
pub extern "C" fn pager_fetch_media(h: *mut Arc<Engine>, key: *const c_char, content_json: *const c_char, thumbnail: bool) {
    use matrix_sdk::media::{MediaFormat, MediaRequestParameters};
    use matrix_sdk::ruma::events::room::MediaSource;
    let Some(e) = (unsafe { h.as_ref() }).cloned() else { return };
    let (key, content) = (s(key), s(content_json));
    let e2 = e.clone();
    e.rt.spawn(async move {
        let fail = |why: String| e2.tell.say("media", &json!({ "key": key, "error": why }));
        let Some(client) = e2.client() else { return fail("Not signed in".into()) };
        let Ok(c) = serde_json::from_str::<Value>(&content) else { return fail("Bad message".into()) };
        let source_json = if thumbnail && (c.get("info").and_then(|i| i.get("thumbnail_url")).is_some() || c.get("info").and_then(|i| i.get("thumbnail_file")).is_some()) {
            let i = &c["info"]; if let Some(f) = i.get("thumbnail_file") { json!({ "file": f }) } else { json!({ "url": i["thumbnail_url"] }) }
        } else { c.clone() };
        let source: MediaSource = match serde_json::from_value(source_json) { Ok(m) => m, Err(_) => return fail("This message has no file".into()) };
        let ext = c.get("body").and_then(|b| b.as_str()).and_then(|b| std::path::Path::new(b).extension()).map(|x| x.to_string_lossy().into_owned()).unwrap_or_default();
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        std::hash::Hash::hash(&(&key, thumbnail), &mut hasher);
        let file = e2.dir.join("media").join(format!("{:016x}{}", std::hash::Hasher::finish(&hasher), if ext.is_empty() { String::new() } else { format!(".{ext}") }));
        if file.exists() { return e2.tell.say("media", &json!({ "key": key, "path": file })); }
        let _ = std::fs::create_dir_all(file.parent().unwrap());
        match client.media().get_media_content(&MediaRequestParameters { source, format: MediaFormat::File }, false).await {
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

/// Tells everyone you have read up to [event_id] in a room (and clears its unread count).
#[no_mangle]
pub extern "C" fn pager_mark_read(h: *mut Arc<Engine>, room_id: *const c_char, event_id: *const c_char) {
    use matrix_sdk::ruma::api::client::receipt::create_receipt::v3::ReceiptType;
    use matrix_sdk::ruma::events::receipt::ReceiptThread;
    let Some(e) = (unsafe { h.as_ref() }).cloned() else { return };
    let (rid, eid) = (s(room_id), s(event_id));
    let e2 = e.clone();
    e.rt.spawn(async move {
        let Some(client) = e2.client() else { return };
        let (Ok(id), Ok(ev)) = (OwnedRoomId::try_from(rid.as_str()), matrix_sdk::ruma::OwnedEventId::try_from(eid.as_str())) else { return };
        let Some(room) = client.get_room(&id) else { return };
        if let Err(err) = room.send_single_receipt(ReceiptType::Read, ReceiptThread::Unthreaded, ev).await { e2.tell.problem("could not mark as read", err); }
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

/// The engine's version, for the About page.
#[no_mangle]
pub extern "C" fn pager_core_version() -> *const c_char { concat!(env!("CARGO_PKG_VERSION"), "\0").as_ptr() as *const c_char }
