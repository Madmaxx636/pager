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
    pager_load_history(engine2, rid.as_ptr(), c"".as_ptr());
    let hist = wait_for(&rx, 60, |k, v| k == "history" && v["room"] == room_id.as_str()).expect("history");
    let bodies: Vec<String> = hist["events"].as_array().unwrap().iter().filter_map(|e| e["content"]["body"].as_str().map(String::from)).collect();
    assert!(bodies.contains(&"hello alice".to_string()) && bodies.contains(&"hi bob".to_string()), "history should be readable after a restart, got {bodies:?}");
    pager_stop(engine2);
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
