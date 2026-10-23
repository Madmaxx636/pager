//! A real conversation through the engine's C interface against a real homeserver, with end-to-end encryption on.
//! Needs a server: PAGER_TEST_SERVER (like http://127.0.0.1:8008) with two accounts, PAGER_TEST_ALICE and PAGER_TEST_BOB as "name:password".
//! Without them the test does nothing (so a normal `cargo test` stays quick). See desktop-native/tests/run-live-test.sh.

use std::ffi::{c_char, c_void, CStr, CString};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::time::{Duration, Instant};

use matrix_sdk::config::SyncSettings;
use matrix_sdk::ruma::api::client::room::create_room::v3::Request as CreateRoom;
use matrix_sdk::ruma::events::room::message::RoomMessageEventContent;
use matrix_sdk::Client;
use pager_core::*;
use serde_json::Value;

extern "C" fn on_event(user: *mut c_void, kind: *const c_char, json: *const c_char) {
    let tx = unsafe { &*(user as *const Sender<(String, Value)>) };
    let k = unsafe { CStr::from_ptr(kind) }.to_string_lossy().into_owned();
    let v: Value = serde_json::from_str(&unsafe { CStr::from_ptr(json) }.to_string_lossy()).unwrap_or(Value::Null);
    let _ = tx.send((k, v));
}

fn creds(var: &str) -> Option<(String, String)> {
    let v = std::env::var(var).ok()?; let (a, b) = v.split_once(':')?; Some((a.into(), b.into()))
}

/// Waits for an event of this kind that [pick] likes.
fn wait_for(rx: &Receiver<(String, Value)>, secs: u64, mut pick: impl FnMut(&str, &Value) -> bool) -> Option<Value> {
    let end = Instant::now() + Duration::from_secs(secs);
    while Instant::now() < end {
        if let Ok((k, v)) = rx.recv_timeout(Duration::from_millis(500)) { if pick(&k, &v) { return Some(v); } }
    }
    None
}
fn has_body(v: &Value, room: &str, body: &str) -> bool {
    v["rooms"].as_array().into_iter().flatten().any(|r| (room.is_empty() || r["id"] == room) && r["events"].as_array().into_iter().flatten().any(|e| e["content"]["body"] == body && e["locked"] == false))
}

#[test]
fn encrypted_conversation_between_the_engine_and_another_client() {
    let (Ok(server), Some((alice, apw)), Some((bob, bpw))) = (std::env::var("PAGER_TEST_SERVER"), creds("PAGER_TEST_ALICE"), creds("PAGER_TEST_BOB")) else { eprintln!("no test server given: skipping"); return };
    let dir = std::env::temp_dir().join(format!("pager-live-{}", std::process::id())); let _ = std::fs::remove_dir_all(&dir);
    let (tx, rx) = channel::<(String, Value)>(); let tx = Box::leak(Box::new(tx));
    let dirc = CString::new(dir.to_str().unwrap()).unwrap();

    // ---- alice signs in through the engine
    let engine = pager_start(dirc.as_ptr(), on_event, tx as *mut _ as *mut c_void);
    assert!(wait_for(&rx, 20, |k, v| k == "state" && v["signedIn"] == false).is_some(), "the engine should say nobody is signed in yet");
    let (hs, u, p) = (CString::new(server.clone()).unwrap(), CString::new(alice.clone()).unwrap(), CString::new(apw).unwrap());
    pager_login(engine, hs.as_ptr(), u.as_ptr(), p.as_ptr());
    let st = wait_for(&rx, 60, |k, v| k == "state" && v["signedIn"] == true).expect("alice should be signed in");
    assert!(st["user"].as_str().unwrap().starts_with(&format!("@{alice}:")));

    // ---- bob (a plain client) makes an encrypted room and invites alice, then speaks
    let rt = tokio::runtime::Runtime::new().unwrap();
    let (room_id, bob_client) = rt.block_on(async {
        let c = Client::builder().homeserver_url(&server).build().await.unwrap();
        c.matrix_auth().login_username(&bob, &bpw).send().await.unwrap();
        c.sync_once(SyncSettings::default()).await.unwrap();
        let mut req = CreateRoom::new();
        req.invite = vec![format!("@{alice}:{}", c.user_id().unwrap().server_name()).try_into().unwrap()];
        req.initial_state = vec![serde_json::from_value(serde_json::json!({ "type": "m.room.encryption", "state_key": "", "content": { "algorithm": "m.megolm.v1.aes-sha2" } })).unwrap()];
        let room = c.create_room(req).await.unwrap();
        let id = room.room_id().to_string();
        (id, c)
    });
    // alice's engine joins by itself, then we speak in the encrypted room
    assert!(wait_for(&rx, 60, |k, v| k == "rooms" && v["rooms"].as_array().into_iter().flatten().any(|r| r["id"] == room_id.as_str())).is_some(), "alice should have joined bob's room");
    rt.block_on(async {
        let room = bob_client.get_room(room_id.as_str().try_into().unwrap()).unwrap();
        for _ in 0..20 { bob_client.sync_once(SyncSettings::default().timeout(Duration::from_millis(500))).await.ok(); if room.encryption_state().is_encrypted() { break; } }
        room.send(RoomMessageEventContent::text_plain("hello alice")).await.unwrap();
    });
    let got = wait_for(&rx, 60, |k, v| k == "rooms" && has_body(v, &room_id, "hello alice"));
    assert!(got.is_some(), "alice's engine should show bob's encrypted message in clear text");

    // ---- alice answers through the engine, bob reads it
    let rid = CString::new(room_id.clone()).unwrap(); let body = CString::new("hi bob").unwrap();
    pager_send_text(engine, rid.as_ptr(), body.as_ptr());
    assert!(wait_for(&rx, 60, |k, _| k == "sent").is_some(), "the engine should say the message was sent");
    let heard = rt.block_on(async {
        let end = Instant::now() + Duration::from_secs(60);
        let room = bob_client.get_room(room_id.as_str().try_into().unwrap()).unwrap();
        let mut ok = false;
        while Instant::now() < end && !ok {
            bob_client.sync_once(SyncSettings::default().timeout(Duration::from_secs(2))).await.ok();
            let m = room.messages(matrix_sdk::room::MessagesOptions::backward()).await.unwrap();
            ok = m.chunk.iter().any(|e| e.raw().json().get().contains("hi bob"));
        }
        ok
    });
    assert!(heard, "bob should read alice's encrypted message");

    // ---- close the engine and start it again: still signed in, no password needed, and the history is there
    pager_stop(engine);
    std::thread::sleep(Duration::from_millis(500));
    while rx.try_recv().is_ok() {}
    let engine2 = pager_start(dirc.as_ptr(), on_event, tx as *mut _ as *mut c_void);
    assert!(wait_for(&rx, 60, |k, v| k == "state" && v["signedIn"] == true).is_some(), "the saved sign-in should come back by itself");
    assert!(wait_for(&rx, 60, |k, v| k == "rooms" && v["rooms"].as_array().into_iter().flatten().any(|r| r["id"] == room_id.as_str())).is_some(), "after a restart the chats must be listed again, not only what changed");
    pager_load_history(engine2, rid.as_ptr(), c"".as_ptr());
    let hist = wait_for(&rx, 60, |k, v| k == "history" && v["room"] == room_id.as_str()).expect("history");
    let bodies: Vec<String> = hist["events"].as_array().unwrap().iter().filter_map(|e| e["content"]["body"].as_str().map(String::from)).collect();
    assert!(bodies.contains(&"hello alice".to_string()) && bodies.contains(&"hi bob".to_string()), "history should be readable after a restart, got {bodies:?}");
    // and again, and again: every start must list every chat (the SDK alone only reports what is new to it)
    let mut last = engine2;
    for round in 0..2 {
        pager_stop(last);
        std::thread::sleep(Duration::from_millis(500));
        while rx.try_recv().is_ok() {}
        last = pager_start(dirc.as_ptr(), on_event, tx as *mut _ as *mut c_void);
        assert!(wait_for(&rx, 60, |k, v| k == "rooms" && v["rooms"].as_array().into_iter().flatten().any(|r| r["id"] == room_id.as_str())).is_some(), "start number {} should list the chat again", round + 3);
    }
    pager_stop(last);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn a_new_device_gets_old_messages_back_with_the_recovery_key() {
    let (Ok(server), Some((alice, apw))) = (std::env::var("PAGER_TEST_SERVER"), creds("PAGER_TEST_ALICE")) else { eprintln!("no test server given: skipping"); return };
    let dir = std::env::temp_dir().join(format!("pager-recover-{}", std::process::id())); let _ = std::fs::remove_dir_all(&dir);
    let rt = tokio::runtime::Runtime::new().unwrap();

    // ---- alice's old device: key backup on, writes in an encrypted room of her own
    let (room_id, key) = rt.block_on(async {
        let c = Client::builder().homeserver_url(&server).build().await.unwrap();
        c.matrix_auth().login_username(&alice, &apw).send().await.unwrap();
        c.sync_once(SyncSettings::default()).await.unwrap();
        c.encryption().backups().create().await.unwrap();
        let mut req = CreateRoom::new();
        req.initial_state = vec![serde_json::from_value(serde_json::json!({ "type": "m.room.encryption", "state_key": "", "content": { "algorithm": "m.megolm.v1.aes-sha2" } })).unwrap()];
        let room = c.create_room(req).await.unwrap();
        for _ in 0..20 { c.sync_once(SyncSettings::default().timeout(Duration::from_millis(500))).await.ok(); if room.encryption_state().is_encrypted() { break; } }
        room.send(RoomMessageEventContent::text_plain("old secret one")).await.unwrap();
        room.send(RoomMessageEventContent::text_plain("old secret two")).await.unwrap();
        // let the keys reach the server backup
        let _ = tokio::time::timeout(Duration::from_secs(60), c.encryption().backups().wait_for_steady_state()).await;
        let key = {
            let g = c.olm_machine_for_testing().await;
            let keys = g.as_ref().unwrap().backup_machine().get_backup_keys().await.unwrap();
            keys.decryption_key.expect("the backup key").to_base58()
        };
        (room.room_id().to_string(), key)
    });

    // ---- a brand new device (the engine) signs in: it sees the room but cannot read it
    let (tx, rx) = channel::<(String, Value)>(); let tx = Box::leak(Box::new(tx));
    let dirc = CString::new(dir.to_str().unwrap()).unwrap();
    let engine = pager_start(dirc.as_ptr(), on_event, tx as *mut _ as *mut c_void);
    assert!(wait_for(&rx, 20, |k, v| k == "state" && v["signedIn"] == false).is_some());
    let (hs, u, p) = (CString::new(server.clone()).unwrap(), CString::new(alice.clone()).unwrap(), CString::new(apw).unwrap());
    pager_login(engine, hs.as_ptr(), u.as_ptr(), p.as_ptr());
    assert!(wait_for(&rx, 60, |k, v| k == "rooms" && v["rooms"].as_array().into_iter().flatten().any(|r| r["id"] == room_id.as_str())).is_some(), "the new device should see the room");
    let rid = CString::new(room_id.clone()).unwrap();
    pager_load_history(engine, rid.as_ptr(), c"".as_ptr());
    let before = wait_for(&rx, 60, |k, v| k == "history" && v["room"] == room_id.as_str()).expect("history");
    assert!(before["events"].as_array().unwrap().iter().all(|e| e["content"]["body"] != "old secret one"), "a new device must not read old messages yet");

    // ---- a wrong key is refused, the right one restores
    let wrong = CString::new("EsTc LW2K PGiF wKEA 3As5 g5c4 BXwk qeeJ ZJV8 Q9fu gUMN UE4d").unwrap();
    pager_recover(engine, wrong.as_ptr());
    let bad = wait_for(&rx, 60, |k, _| k == "recovered").expect("an answer");
    assert_eq!(bad["ok"], false, "{bad}");
    let good = CString::new(key).unwrap();
    pager_recover(engine, good.as_ptr());
    let done = wait_for(&rx, 120, |k, _| k == "recovered").expect("an answer");
    assert_eq!(done["ok"], true, "{done}");
    pager_load_history(engine, rid.as_ptr(), c"".as_ptr());
    let after = wait_for(&rx, 60, |k, v| k == "history" && v["room"] == room_id.as_str()).expect("history");
    let bodies: Vec<String> = after["events"].as_array().unwrap().iter().filter_map(|e| e["content"]["body"].as_str().map(String::from)).collect();
    assert!(bodies.contains(&"old secret one".to_string()) && bodies.contains(&"old secret two".to_string()), "restored history should be readable, got {bodies:?}");
    pager_stop(engine);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn reactions_files_and_pictures_work_in_an_encrypted_chat() {
    let (Ok(server), Some((alice, apw)), Some((bob, bpw))) = (std::env::var("PAGER_TEST_SERVER"), creds("PAGER_TEST_ALICE"), creds("PAGER_TEST_BOB")) else { eprintln!("no test server given: skipping"); return };
    let dir = std::env::temp_dir().join(format!("pager-media-{}", std::process::id())); let _ = std::fs::remove_dir_all(&dir);
    let (tx, rx) = channel::<(String, Value)>(); let tx = Box::leak(Box::new(tx));
    let dirc = CString::new(dir.to_str().unwrap()).unwrap();
    let engine = pager_start(dirc.as_ptr(), on_event, tx as *mut _ as *mut c_void);
    assert!(wait_for(&rx, 20, |k, v| k == "state" && v["signedIn"] == false).is_some());
    let (hs, u, p) = (CString::new(server.clone()).unwrap(), CString::new(alice.clone()).unwrap(), CString::new(apw).unwrap());
    pager_login(engine, hs.as_ptr(), u.as_ptr(), p.as_ptr());
    assert!(wait_for(&rx, 60, |k, v| k == "state" && v["signedIn"] == true).is_some());

    let rt = tokio::runtime::Runtime::new().unwrap();
    let (room_id, bob_client, first_id) = rt.block_on(async {
        let c = Client::builder().homeserver_url(&server).build().await.unwrap();
        c.matrix_auth().login_username(&bob, &bpw).send().await.unwrap();
        c.sync_once(SyncSettings::default()).await.unwrap();
        let mut req = CreateRoom::new();
        req.invite = vec![format!("@{alice}:{}", c.user_id().unwrap().server_name()).try_into().unwrap()];
        req.initial_state = vec![serde_json::from_value(serde_json::json!({ "type": "m.room.encryption", "state_key": "", "content": { "algorithm": "m.megolm.v1.aes-sha2" } })).unwrap()];
        let room = c.create_room(req).await.unwrap();
        (room.room_id().to_string(), c, String::new())
    });
    let _ = first_id;
    assert!(wait_for(&rx, 60, |k, v| k == "rooms" && v["rooms"].as_array().into_iter().flatten().any(|r| r["id"] == room_id.as_str())).is_some());
    let bob_room = || bob_client.get_room(room_id.as_str().try_into().unwrap()).unwrap();
    let (msg_id, _) = rt.block_on(async {
        let room = bob_room();
        for _ in 0..20 { bob_client.sync_once(SyncSettings::default().timeout(Duration::from_millis(500))).await.ok(); if room.encryption_state().is_encrypted() { break; } }
        let r = room.send(RoomMessageEventContent::text_plain("react to me")).await.unwrap();
        // bob also sends a small encrypted file
        let png = vec![137u8, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4];
        let f = room.send_attachment("pic.png", &"image/png".parse().unwrap(), png, matrix_sdk::attachment::AttachmentConfig::new()).await.unwrap();
        (r.response.event_id.to_string(), f.event_id.to_string())
    });
    let seen = wait_for(&rx, 60, |k, v| k == "rooms" && has_body(v, &room_id, "react to me")).expect("message");
    let room = seen["rooms"].as_array().unwrap().iter().find(|r| r["id"] == room_id.as_str()).unwrap().clone();
    let file_ev = room["events"].as_array().unwrap().iter().find(|e| e["content"]["body"] == "pic.png").expect("the file message").clone();

    // alice reacts and sends a file through the engine
    let rid = CString::new(room_id.clone()).unwrap();
    let content = CString::new(serde_json::json!({ "m.relates_to": { "rel_type": "m.annotation", "event_id": msg_id, "key": "👍" } }).to_string()).unwrap();
    pager_send_event(engine, rid.as_ptr(), c"m.reaction".as_ptr(), content.as_ptr(), c"t1".as_ptr());
    let sent = wait_for(&rx, 60, |k, v| (k == "sent" || k == "send_failed") && v["txn"] == "t1").unwrap();
    assert_eq!(sent["event_id"].is_string(), true, "{sent}");
    let up = dir.join("hello.txt"); std::fs::write(&up, "file from alice").unwrap();
    let upc = CString::new(up.to_str().unwrap()).unwrap();
    pager_send_file(engine, rid.as_ptr(), upc.as_ptr(), c"text/plain".as_ptr(), c"".as_ptr(), 0, 0, c"t2".as_ptr(), false, 0);
    let sent = wait_for(&rx, 60, |k, v| (k == "sent" || k == "send_failed") && v["txn"] == "t2").unwrap();
    assert!(sent["event_id"].is_string(), "{sent}");
    let voice = dir.join("note.ogg"); std::fs::write(&voice, b"OggS-not-really-audio").unwrap();
    let voicec = CString::new(voice.to_str().unwrap()).unwrap();
    pager_send_file(engine, rid.as_ptr(), voicec.as_ptr(), c"audio/ogg".as_ptr(), c"".as_ptr(), 0, 0, c"t3".as_ptr(), true, 4200);
    let sent = wait_for(&rx, 60, |k, v| (k == "sent" || k == "send_failed") && v["txn"] == "t3").unwrap();
    assert!(sent["event_id"].is_string(), "{sent}");
    let voice_seen = rt.block_on(async {
        let room = bob_room(); let end = Instant::now() + Duration::from_secs(60); let mut ok = false;
        while Instant::now() < end && !ok {
            bob_client.sync_once(SyncSettings::default().timeout(Duration::from_secs(2))).await.ok();
            let m = room.messages(matrix_sdk::room::MessagesOptions::backward()).await.unwrap();
            ok = m.chunk.iter().any(|e| { let j = e.raw().json().get(); j.contains("msc3245.voice") && j.contains("4200") });
        }
        ok
    });
    assert!(voice_seen, "bob should see alice's voice message with its length");
    let (heard, redact_ok) = rt.block_on(async {
        let room = bob_room(); let end = Instant::now() + Duration::from_secs(60); let (mut react, mut file) = (false, false);
        while Instant::now() < end && !(react && file) {
            bob_client.sync_once(SyncSettings::default().timeout(Duration::from_secs(2))).await.ok();
            let m = room.messages(matrix_sdk::room::MessagesOptions::backward()).await.unwrap();
            for e in &m.chunk { let j = e.raw().json().get(); react |= j.contains("m.annotation"); file |= j.contains("hello.txt"); }
        }
        (react && file, true)
    });
    assert!(heard && redact_ok, "bob should see alice's reaction and her file");

    // alice fetches bob's encrypted picture
    let key = CString::new("k1").unwrap(); let cj = CString::new(file_ev["content"].to_string()).unwrap();
    pager_fetch_media(engine, key.as_ptr(), cj.as_ptr(), false);
    let m = wait_for(&rx, 60, |k, v| k == "media" && v["key"] == "k1").unwrap();
    let bytes = std::fs::read(m["path"].as_str().unwrap_or_else(|| panic!("{m}"))).unwrap();
    assert_eq!(bytes, vec![137u8, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4], "the decrypted picture should match");
    // a picture that disappears after viewing (extra fields in the message), sent through the encrypted path
    let once = dir.join("once.png"); std::fs::write(&once, vec![137u8, 80, 78, 71, 13, 10, 26, 10, 9, 9, 9, 9]).unwrap();
    let oncec = CString::new(once.to_str().unwrap()).unwrap();
    let extra = CString::new(serde_json::json!({ "com.beeper.view_limited": { "type": "count", "count": 1 }, "app.pager.attention": { "kind": "image" } }).to_string()).unwrap();
    pager_send_media(engine, rid.as_ptr(), oncec.as_ptr(), c"image/png".as_ptr(), c"".as_ptr(), 4, 4, c"t4".as_ptr(), extra.as_ptr());
    let sent = wait_for(&rx, 60, |k, v| (k == "sent" || k == "send_failed") && v["txn"] == "t4").unwrap();
    assert!(sent["event_id"].is_string(), "{sent}");
    let once_seen = rt.block_on(async {
        let room = bob_room(); let end = Instant::now() + Duration::from_secs(60); let mut ok = false;
        while Instant::now() < end && !ok {
            bob_client.sync_once(SyncSettings::default().timeout(Duration::from_secs(2))).await.ok();
            let m = room.messages(matrix_sdk::room::MessagesOptions::backward()).await.unwrap();
            ok = m.chunk.iter().any(|e| { let j = e.raw().json().get(); j.contains("view_limited") && j.contains("\"file\"") });
        }
        ok
    });
    assert!(once_seen, "bob should see the view-once picture, its file encrypted");
    // an upload for stickers answers with the address of the file
    pager_upload(engine, c"up1".as_ptr(), oncec.as_ptr(), c"image/png".as_ptr());
    let up = wait_for(&rx, 60, |k, v| k == "uploaded" && v["key"] == "up1").unwrap();
    assert!(up["url"].as_str().unwrap_or_default().starts_with("mxc://"), "{up}");
    pager_stop(engine);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn the_engine_can_call_the_server_api_and_draw_qr_codes() {
    let qr = unsafe { CStr::from_ptr(pager_qr(c"https://example.com/pair?code=123".as_ptr())) }.to_string_lossy().into_owned();
    let q: Value = serde_json::from_str(&qr).unwrap();
    let n = q["size"].as_u64().unwrap() as usize;
    assert!(n >= 21 && q["rows"].as_array().unwrap().iter().all(|r| r.as_str().unwrap().len() == n), "a square QR code");
    let (Ok(server), Some((alice, apw))) = (std::env::var("PAGER_TEST_SERVER"), creds("PAGER_TEST_ALICE")) else { eprintln!("no test server given: skipping the api part"); return };
    let dir = std::env::temp_dir().join(format!("pager-http-{}", std::process::id())); let _ = std::fs::remove_dir_all(&dir);
    let (tx, rx) = channel::<(String, Value)>(); let tx = Box::leak(Box::new(tx));
    let dirc = CString::new(dir.to_str().unwrap()).unwrap();
    let engine = pager_start(dirc.as_ptr(), on_event, tx as *mut _ as *mut c_void);
    assert!(wait_for(&rx, 20, |k, v| k == "state" && v["signedIn"] == false).is_some());
    pager_http(engine, c"early".as_ptr(), c"GET".as_ptr(), c"/_matrix/client/v3/account/whoami".as_ptr(), c"".as_ptr());
    let early = wait_for(&rx, 20, |k, v| k == "http" && v["key"] == "early").unwrap();
    assert_eq!(early["status"], 0, "not signed in yet: {early}");
    let (hs, u, p) = (CString::new(server).unwrap(), CString::new(alice.clone()).unwrap(), CString::new(apw).unwrap());
    pager_login(engine, hs.as_ptr(), u.as_ptr(), p.as_ptr());
    assert!(wait_for(&rx, 60, |k, v| k == "state" && v["signedIn"] == true).is_some());
    pager_http(engine, c"k1".as_ptr(), c"GET".as_ptr(), c"/_matrix/client/v3/account/whoami".as_ptr(), c"".as_ptr());
    let r = wait_for(&rx, 20, |k, v| k == "http" && v["key"] == "k1").unwrap();
    assert_eq!(r["status"], 200, "{r}");
    assert!(r["body"]["user_id"].as_str().unwrap().starts_with(&format!("@{alice}:")));
    pager_http(engine, c"k2".as_ptr(), c"GET".as_ptr(), c"/api/definitely-not-there".as_ptr(), c"".as_ptr());
    let r = wait_for(&rx, 20, |k, v| k == "http" && v["key"] == "k2").unwrap();
    assert_eq!(r["status"], 404, "{r}");
    pager_stop(engine);
    let _ = std::fs::remove_dir_all(&dir);
}

/// A tiny web server that hands out fixed files (name -> bytes), for the update test.
fn serve(files: std::collections::HashMap<String, Vec<u8>>) -> u16 {
    use std::io::{Read, Write};
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut s) = stream else { continue };
            let mut buf = [0u8; 2048]; let n = s.read(&mut buf).unwrap_or(0);
            let req = String::from_utf8_lossy(&buf[..n]).to_string();
            let path = req.split_whitespace().nth(1).unwrap_or("/").trim_start_matches("/updates/").to_string();
            match files.get(&path) {
                Some(body) => { let _ = write!(s, "HTTP/1.1 200 OK\r\ncontent-length: {}\r\nconnection: close\r\n\r\n", body.len()); let _ = s.write_all(body); }
                None => { let _ = s.write_all(b"HTTP/1.1 404 Not Found\r\ncontent-length: 0\r\nconnection: close\r\n\r\n"); }
            }
        }
    });
    port
}

#[test]
fn updates_are_checked_against_the_release_key_and_downloads_against_their_checksum() {
    use base64::Engine as _;
    use ed25519_dalek::Signer;
    use sha2::Digest;
    let key = ed25519_dalek::SigningKey::from_bytes(&[7u8; 32]);
    std::env::set_var("PAGER_TEST_UPDATE_PUBKEY", base64::engine::general_purpose::STANDARD.encode(key.verifying_key().to_bytes()));
    let payload = b"pretend this is the app".to_vec();
    let sha: String = sha2::Sha256::digest(&payload).iter().map(|b| format!("{b:02x}")).collect();
    let manifest = serde_json::json!({ "released": "now", "native": { "version": "0.2.0", "file": "pager-native-0.2.0.tar.gz", "sha256": sha, "notes": "Faster" },
                                       "evil": { "version": "9.9.9", "file": "../x", "sha256": "00" } }).to_string().into_bytes();
    let good_sig = key.sign(&manifest).to_bytes().to_vec();
    let mut bad_sig = good_sig.clone(); bad_sig[0] ^= 1;
    let mut files = std::collections::HashMap::new();
    files.insert("latest.json".to_string(), manifest.clone()); files.insert("latest.json.sig".to_string(), good_sig);
    files.insert("pager-native-0.2.0.tar.gz".to_string(), payload.clone());
    let good_port = serve(files.clone());
    files.insert("latest.json.sig".to_string(), bad_sig);
    let bad_port = serve(files);
    let empty_port = serve(std::collections::HashMap::new());

    let dir = std::env::temp_dir().join(format!("pager-upd-{}", std::process::id())); let _ = std::fs::remove_dir_all(&dir);
    let (tx, rx) = channel::<(String, Value)>(); let tx = Box::leak(Box::new(tx));
    let dirc = CString::new(dir.to_str().unwrap()).unwrap();
    let engine = pager_start(dirc.as_ptr(), on_event, tx as *mut _ as *mut c_void);
    assert!(wait_for(&rx, 20, |k, _| k == "state").is_some());
    let check = |port: u16, current: &str, entry: &str| {
        let url = CString::new(format!("http://127.0.0.1:{port}")).unwrap(); let (c, e) = (CString::new(current).unwrap(), CString::new(entry).unwrap());
        pager_update_check(engine, url.as_ptr(), c.as_ptr(), e.as_ptr());
        wait_for(&rx, 30, |k, _| k == "update").expect("an answer")
    };
    assert_eq!(check(good_port, "0.1.0", "native")["state"], "available");
    let up = check(good_port, "0.1.0", "native");
    assert_eq!(up["version"], "0.2.0"); assert_eq!(up["notes"], "Faster");
    assert_eq!(check(good_port, "0.2.0", "native")["state"], "none");              // already current
    assert_eq!(check(good_port, "0.1.0", "nativeWindows")["state"], "none");       // nothing for this computer
    assert_eq!(check(good_port, "0.1.0", "evil")["state"], "error");               // a file name that tries to leave the folder
    assert_eq!(check(bad_port, "0.1.0", "native")["state"], "error");              // wrong signature: ignored
    assert_eq!(check(empty_port, "0.1.0", "native")["state"], "none");             // server publishes nothing

    // download: right checksum is kept, a wrong one is thrown away
    let (base, file) = (CString::new(up["base"].as_str().unwrap()).unwrap(), CString::new("pager-native-0.2.0.tar.gz").unwrap());
    let dest = dir.join("dl"); let destc = CString::new(dest.to_str().unwrap()).unwrap();
    let shac = CString::new(sha.clone()).unwrap();
    pager_update_download(engine, base.as_ptr(), file.as_ptr(), shac.as_ptr(), destc.as_ptr());
    let ready = wait_for(&rx, 30, |k, _| k == "update_ready" || k == "update_failed").unwrap();
    let path = ready["path"].as_str().unwrap_or_else(|| panic!("{ready}")).to_string();
    assert_eq!(std::fs::read(&path).unwrap(), payload);
    let wrong = CString::new("0".repeat(64)).unwrap();
    pager_update_download(engine, base.as_ptr(), file.as_ptr(), wrong.as_ptr(), destc.as_ptr());
    let failed = wait_for(&rx, 30, |k, _| k == "update_ready" || k == "update_failed").unwrap();
    assert!(failed["error"].as_str().unwrap().contains("checksum"), "{failed}");
    assert!(!std::path::Path::new(&path).exists(), "a download that fails its checksum must be deleted");
    pager_stop(engine);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn recovery_keys_and_key_files_work() {
    let (Ok(server), Some((alice, apw))) = (std::env::var("PAGER_TEST_SERVER"), creds("PAGER_TEST_ALICE")) else { eprintln!("no test server given: skipping"); return };
    let dir = std::env::temp_dir().join(format!("pager-keys-{}", std::process::id())); let _ = std::fs::remove_dir_all(&dir);
    let (tx, rx) = channel::<(String, Value)>(); let tx = Box::leak(Box::new(tx));
    let dirc = CString::new(dir.to_str().unwrap()).unwrap();
    let engine = pager_start(dirc.as_ptr(), on_event, tx as *mut _ as *mut c_void);
    assert!(wait_for(&rx, 20, |k, v| k == "state" && v["signedIn"] == false).is_some());
    let (hs, u, p) = (CString::new(server).unwrap(), CString::new(alice).unwrap(), CString::new(apw).unwrap());
    pager_login(engine, hs.as_ptr(), u.as_ptr(), p.as_ptr());
    assert!(wait_for(&rx, 60, |k, v| k == "state" && v["signedIn"] == true).is_some());
    pager_encryption_status(engine);
    let st = wait_for(&rx, 30, |k, _| k == "encryption").expect("status");
    assert!(st["device_id"].as_str().unwrap_or("").len() > 3 && st["fingerprint"].as_str().unwrap_or("").len() > 20, "{st}");
    pager_recovery_create(engine);
    let made = wait_for(&rx, 60, |k, _| k == "recovery_created").expect("recovery key");
    assert_eq!(made["ok"], true, "{made}");
    let key = made["key"].as_str().unwrap().to_string();
    assert!(key.contains(' ') && key.replace(' ', "").len() > 40, "{key}");
    // the key opens the backup it belongs to, with the same code the sign-in screen uses
    let keyc = CString::new(key.clone()).unwrap();
    pager_recover(engine, keyc.as_ptr());
    let rec = wait_for(&rx, 60, |k, _| k == "recovered").expect("recovered");
    assert_eq!(rec["ok"], true, "{rec}");
    pager_encryption_status(engine);
    let st = wait_for(&rx, 30, |k, _| k == "encryption").unwrap();
    assert_eq!(st["backup_on_server"], true, "{st}");
    // a key file and back
    let f = dir.join("keys.txt"); let fc = CString::new(f.to_str().unwrap()).unwrap();
    pager_keys_export(engine, fc.as_ptr(), c"correct horse".as_ptr());
    let ex = wait_for(&rx, 60, |k, _| k == "keys_exported").unwrap(); assert_eq!(ex["ok"], true, "{ex}");
    assert!(std::fs::read_to_string(&f).unwrap().contains("MEGOLM SESSION DATA"));
    pager_keys_import(engine, fc.as_ptr(), c"wrong".as_ptr());
    let bad = wait_for(&rx, 60, |k, _| k == "keys_imported").unwrap(); assert_eq!(bad["ok"], false, "{bad}");
    pager_keys_import(engine, fc.as_ptr(), c"correct horse".as_ptr());
    let good = wait_for(&rx, 60, |k, _| k == "keys_imported").unwrap(); assert_eq!(good["ok"], true, "{good}");
    pager_stop(engine);
    let _ = std::fs::remove_dir_all(&dir);
}
