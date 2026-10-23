// The C interface of pager-core (the Rust engine). Everything the engine says arrives through one callback as (kind, json).
#pragma once
#ifdef __cplusplus
extern "C" {
#endif

typedef void (*pager_callback)(void *user, const char *kind, const char *json);
typedef struct PagerEngine PagerEngine;

// Starts the engine. data_dir holds the saved sign-in and the encrypted store. Signed in before? Syncing starts at once.
PagerEngine *pager_start(const char *data_dir, pager_callback cb, void *user);
void pager_login(PagerEngine *e, const char *homeserver, const char *user, const char *password);
void pager_logout(PagerEngine *e);
// Older messages of a room: from = a token from an earlier answer, or "" for the newest.
void pager_load_history(PagerEngine *e, const char *room_id, const char *from);
void pager_send_text(PagerEngine *e, const char *room_id, const char *body);
// Opens your history on a new device with the recovery key the other Pager apps showed you. Progress arrives as "recovery", the end as "recovered".
void pager_send_event(PagerEngine *e, const char *room_id, const char *event_type, const char *content_json, const char *txn);
void pager_redact(PagerEngine *e, const char *room_id, const char *event_id);
void pager_send_file(PagerEngine *e, const char *room_id, const char *path, const char *mime_type, const char *caption, unsigned width, unsigned height, const char *txn, bool voice, unsigned long long duration_ms);
void pager_fetch_media(PagerEngine *e, const char *key, const char *content_json, bool thumbnail);
void pager_http(PagerEngine *e, const char *key, const char *method, const char *path, const char *body_json);
char *pager_qr(const char *text);
void pager_free_string(char *s);
void pager_update_check(PagerEngine *e, const char *server, const char *current, const char *entry);
void pager_update_download(PagerEngine *e, const char *base, const char *file, const char *sha256, const char *dest_dir);
void pager_recover(PagerEngine *e, const char *recovery_key);
// Says you have read up to this event.
void pager_mark_read(PagerEngine *e, const char *room_id, const char *event_id, bool private_receipt);
void pager_resync(PagerEngine *e);
void pager_stop(PagerEngine *e);
const char *pager_core_version(void);

#ifdef __cplusplus
}
#endif
