#include "engine.h"
#include "rich.h"
#include "names.h"
#include "notifypolicy.h"
#include <QCoreApplication>
#include <QDateTime>
#include <QFile>
#include <QFile>
#include <QFileInfo>
#include <QRegularExpression>
#include <QJSEngine>
#include <QQmlEngine>
#include <QStandardPaths>
#include <QJsonArray>
#include <QJsonDocument>
#include <QMetaObject>
#include <QTimer>
#include <QUrl>

Engine::Engine(const QString &dataDir, bool demo, QObject *parent) : QObject(parent) {
    m_store.avatarWanted = [this](const QString &mxc) {
        if (!m_core) return;
        const QByteArray json = QJsonDocument(QJsonObject{{"url", mxc}, {"thumb", QJsonObject{{"w", 96}, {"h", 96}}}}).toJson(QJsonDocument::Compact);
        pager_fetch_media(m_core, ("av:" + mxc).toUtf8().constData(), json.constData(), true);
    };
    m_dataDir = dataDir;
    if (!dataDir.isEmpty() && !demo) { Names::load(dataDir + QStringLiteral("/phonebook.json")); }
    Names::onChange = [this] { m_timeline.show(m_current); refreshLists(); };
    if (!dataDir.isEmpty()) { QFile f(dataDir + QStringLiteral("/drafts.json")); if (f.open(QIODevice::ReadOnly)) { const QJsonObject o = QJsonDocument::fromJson(f.readAll()).object(); for (auto it = o.begin(); it != o.end(); ++it) m_drafts.insert(it.key(), it.value().toString()); } }
    m_logFile = dataDir.isEmpty() ? QString() : dataDir + QStringLiteral("/pager-native.log");
    if (demo) { loadDemo(); return; }
    m_core = pager_start(dataDir.toUtf8().constData(), &Engine::callback, this);
}
Engine::~Engine() { if (m_core) pager_stop(m_core); }
QString Engine::version() const { return QString::fromUtf8(pager_core_version()); }

void Engine::callback(void *user, const char *kind, const char *json) {
    // Called from the engine's own threads: hop over to the screen's thread before touching anything.
    QPointer<Engine> self(static_cast<Engine *>(user));
    const QString k = QString::fromUtf8(kind);
    const QJsonObject body = QJsonDocument::fromJson(QByteArray(json)).object();
    QMetaObject::invokeMethod(QCoreApplication::instance(), [self, k, body] { if (self) self->handle(k, body); }, Qt::QueuedConnection);
}

void Engine::log(const QString &line) {
    if (m_logFile.isEmpty()) return;
    QFile f(m_logFile);
    if (f.size() > 512 * 1024) f.remove();                       // keep it small
    if (f.open(QIODevice::Append | QIODevice::Text)) f.write((QDateTime::currentDateTime().toString(Qt::ISODate) + QLatin1Char(' ') + line + QLatin1Char('\n')).toUtf8());
}

void Engine::handle(const QString &kind, const QJsonObject &b) {
    if (kind == QLatin1String("problem")) log(b.value(QLatin1String("what")).toString() + QStringLiteral(": ") + b.value(QLatin1String("message")).toString());
    else if (kind == QLatin1String("synced") && !m_synced) log(QStringLiteral("first sync done, %1 chats changed").arg(b.value(QLatin1String("rooms")).toInt()));
    else if (kind == QLatin1String("state")) log(QStringLiteral("state: ") + QString::fromUtf8(QJsonDocument(b).toJson(QJsonDocument::Compact)));
    if (kind == QLatin1String("state")) {
        m_starting = false;
        m_signedIn = b.value(QLatin1String("signedIn")).toBool();
        if (m_signedIn) {
            m_user = b.value(QLatin1String("user")).toString(m_user); m_store.setMe(m_user); m_error.clear();
            if (m_core) { api(QStringLiteral("GET"), QStringLiteral("/api/me"), QVariant(), QJSValue()); loadPushRules(); loadIdentity(); }   // admin? muted chats? your own accounts on other networks?
        }
        else { m_user.clear(); m_synced = false; m_error = b.value(QLatin1String("error")).toString(); }
        m_working = false;
        emit stateChanged();
    } else if (kind == QLatin1String("rooms")) {
        const QStringList changed = m_store.applyRooms(b.value(QLatin1String("rooms")).toArray());
        refreshLists();
        if (!m_pendingOpen.isEmpty() && m_store.room(m_pendingOpen)) { const QString id = m_pendingOpen; m_pendingOpen.clear(); openRoom(id); emit roomOpened(id); }
        for (const QString &id : changed) {        // pop-ups: only for new messages from others, never for the first catch-up or the chat in front of you
            const Room *r = m_store.room(id);
            if (!r || r->msgs.isEmpty()) continue;
            const Msg &last = r->msgs.last();
            if (m_seen.value(id) == last.id) continue;
            m_seen.insert(id, last.id);
            if (m_firstRooms || last.local || m_store.mine(last) || last.locked || (m_active && id == m_current)) continue;
            if (m_store.isBotRoom(*r)) continue;
            // what the rules say: about you? muted? quiet hours? do not disturb? per chat and per network overrides?
            NotifyPolicy::Input in; in.roomId = id; in.network = r->network; in.isGroup = r->isGroup(); in.text = last.body;
            const QString myName = r->nameOf(m_user).toLower();
            in.mentioned = last.mentions.contains(m_user) || (!myName.isEmpty() && last.body.toLower().contains(QLatin1Char('@') + myName));
            if (!last.replyTo.isEmpty()) if (const Msg *parent = r->find(last.replyTo)) in.replyToMe = m_store.mine(*parent);
            in.quiet = m_store.muted(id) || r->lowPriority(); in.pinned = r->pinned();
            const QDateTime now = QDateTime::currentDateTime(); in.nowMin = now.time().hour() * 60 + now.time().minute(); in.day = now.date().dayOfWeek() % 7; in.nowMs = now.toMSecsSinceEpoch();
            NotifyPolicy::Decision d; d.show = true; d.silent = false; d.preview = QStringLiteral("full");
            if (m_settings) d = NotifyPolicy::decide(in, m_settings->snapshot());
            if (!d.show) continue;
            const QString chatName = RoomListModel::displayName(*r);
            const QString who = r->nameOf(last.sender);
            QString what = last.kind == QLatin1String("image") ? QStringLiteral("Sent a photo") : last.kind == QLatin1String("video") ? QStringLiteral("Sent a video") : last.kind == QLatin1String("audio") ? (last.voice ? QStringLiteral("Voice message") : QStringLiteral("Sent audio")) : last.kind == QLatin1String("file") ? QStringLiteral("Sent a file")
                         : last.kind == QLatin1String("poll") ? QStringLiteral("Poll: ") + last.poll.question : Rich::plain(last.html.isEmpty() ? last.body : last.html);
            QString title = r->isGroup() ? chatName + QStringLiteral(" · ") + who : chatName;
            if (d.preview == QLatin1String("hidden")) { title = QStringLiteral("New message"); what = QString(); }
            else if (d.preview == QLatin1String("sender")) what = QString();
            emit notify(id, title, what, d.silent);
        }
        m_firstRooms = false;
        emit unreadChanged(totalUnread());
        if (!m_current.isEmpty() && changed.contains(m_current)) { m_timeline.show(m_current); emit currentChanged(); if (m_active) markCurrentRead(); }
    } else if (kind == QLatin1String("history")) {
        const QString id = m_store.applyHistory(b);
        if (id == m_current) { m_timeline.show(id); emit currentChanged(); }
        refreshLists();
    } else if (kind == QLatin1String("left")) {
        m_store.removeRoom(b.value(QLatin1String("id")).toString());
        if (m_current == b.value(QLatin1String("id")).toString()) { m_current.clear(); m_timeline.show({}); emit currentChanged(); }
        refreshLists();
    } else if (kind == QLatin1String("synced")) {
        if (!m_synced) { m_synced = true; emit stateChanged(); }
    } else if (kind == QLatin1String("recovery")) {
        m_recoveryMessage = QStringLiteral("Restoring messages… %1 of %2 chats").arg(b.value(QLatin1String("done")).toInt()).arg(b.value(QLatin1String("total")).toInt());
        emit recoveryChanged();
    } else if (kind == QLatin1String("recovered")) {
        m_recovering = false;
        m_recoveryDone = b.value(QLatin1String("ok")).toBool();
        m_recoveryMessage = m_recoveryDone ? QStringLiteral("Done. Your old messages are readable again.") : b.value(QLatin1String("error")).toString();
        emit recoveryChanged();
        if (m_recoveryDone) {                       // look at every chat again: what was locked may be readable now
            for (const QString &id : m_store.order()) { if (Room *r = m_store.mutableRoom(id)) { r->historyAsked = id == m_current; } }
            if (m_core && !m_current.isEmpty()) pager_load_history(m_core, m_current.toUtf8().constData(), "");
        }
    } else if (kind == QLatin1String("media")) {
        const QString key = b.value(QLatin1String("key")).toString();
        m_fetching.remove(key);
        if (b.contains(QLatin1String("path")) && (key.startsWith(QLatin1String("full:")))) { m_store.setMediaPath(key, b.value(QLatin1String("path")).toString()); emit mediaReady(key); }
        else if (b.contains(QLatin1String("path"))) {
            m_store.setMediaPath(key, b.value(QLatin1String("path")).toString());
            if (key.startsWith(QLatin1String("av:"))) { m_rooms.refresh(); m_timeline.show(m_current); } else { m_timeline.touch(key); emit mediaReady(key); }
        } else if (key.startsWith(QLatin1String("av:"))) m_store.forgetWantedAvatar(key.mid(3));
    } else if (kind == QLatin1String("http")) {
        const QString key = b.value(QLatin1String("key")).toString();
        if (m_internal.contains(key)) { auto fn = m_internal.take(key); fn(b.value(QLatin1String("status")).toInt(), b.value(QLatin1String("body"))); return; }
        if (m_meKey == key) { m_meKey.clear(); const bool a = b.value(QLatin1String("status")).toInt() == 200 && b.value(QLatin1String("body")).toObject().value(QLatin1String("admin")).toBool(); if (a != m_admin) { m_admin = a; emit stateChanged(); } return; }
        QJSValue cb = m_calls.take(key);
        if (cb.isCallable()) {
            QJSEngine *js = qjsEngine(this);
            const QJsonValue body = b.value(QLatin1String("body"));
            QJSValue arg = js ? js->toScriptValue(body.toVariant()) : QJSValue();
            QJSValueList args{QJSValue(b.value(QLatin1String("status")).toInt()), arg};
            const QJSValue r = cb.call(args);
            if (r.isError()) qWarning("api callback failed: %s", qPrintable(r.toString()));
        }
    } else if (kind == QLatin1String("update")) {
        const QString st = b.value(QLatin1String("state")).toString();
        if (st == QLatin1String("available")) {
            m_updState = QStringLiteral("available"); m_updVersion = b.value(QLatin1String("version")).toString(); m_updNotes = b.value(QLatin1String("notes")).toString();
            m_updFile = b.value(QLatin1String("file")).toString(); m_updSha = b.value(QLatin1String("sha256")).toString(); m_updBase = b.value(QLatin1String("base")).toString(); m_updMessage.clear();
        } else if (st == QLatin1String("none")) {
            m_updState = QStringLiteral("idle"); m_updMessage = m_updQuiet ? QString() : b.value(QLatin1String("note")).toString();
        } else {
            m_updState = QStringLiteral("error"); m_updMessage = m_updQuiet ? QString() : b.value(QLatin1String("error")).toString();
            if (m_updQuiet) m_updState = QStringLiteral("idle");
        }
        emit updateChanged();
    } else if (kind == QLatin1String("update_progress")) {
        const double total = b.value(QLatin1String("total")).toDouble();
        m_updProgress = total > 0 ? int(b.value(QLatin1String("done")).toDouble() * 100 / total) : 0;
        emit updateChanged();
    } else if (kind == QLatin1String("update_ready")) {
        m_updState = QStringLiteral("installing"); m_updProgress = 100; emit updateChanged();
        emit updateReady(b.value(QLatin1String("path")).toString());
    } else if (kind == QLatin1String("update_failed")) {
        m_updState = QStringLiteral("error"); m_updMessage = b.value(QLatin1String("error")).toString(); emit updateChanged();
    } else if (kind == QLatin1String("send_failed")) {
        const QString txn = b.value(QLatin1String("txn")).toString();
        if (txn.startsWith(QLatin1String("local-"))) { m_store.markFailed(b.value(QLatin1String("room")).toString(), txn); if (b.value(QLatin1String("room")).toString() == m_current) m_timeline.show(m_current); m_rooms.refresh(); }
        m_problem = QStringLiteral("Could not send: ") + b.value(QLatin1String("error")).toString();
        emit problemChanged();
    } else if (kind == QLatin1String("problem")) {
        m_problem = b.value(QLatin1String("what")).toString() + QStringLiteral(": ") + b.value(QLatin1String("message")).toString();
        emit problemChanged();
    }
}

int Engine::totalUnread() const { int n = 0; for (const QString &id : m_store.order()) if (const Room *r = m_store.room(id)) n += r->unread; return n; }
QString Engine::currentName() const { const Room *r = m_store.room(m_current); return r ? (r->name.isEmpty() ? r->id : r->name) : QString(); }
QString Engine::currentSub() const {
    const Room *r = m_store.room(m_current);
    if (!r) return {};
    QStringList parts;
    if (r->network != QLatin1String("matrix")) parts << (r->network == QLatin1String("gmessages") ? QStringLiteral("Messages") : r->network.left(1).toUpper() + r->network.mid(1));
    if (r->isGroup() && r->memberCount > 2) parts << QStringLiteral("%1 people").arg(qMax(2, r->memberCount - (r->roomType.isEmpty() ? 0 : 2)));
    parts << (r->encrypted ? QStringLiteral("End-to-end encrypted") : QStringLiteral("Not encrypted"));
    return parts.join(QStringLiteral(" · "));
}

void Engine::login(const QString &hs, const QString &user, const QString &pw) {
    if (!m_core) return;
    m_working = true; m_error.clear(); emit stateChanged();
    pager_login(m_core, hs.toUtf8().constData(), user.toUtf8().constData(), pw.toUtf8().constData());
}
void Engine::recover(const QString &key) {
    if (!m_core || m_recovering || key.trimmed().isEmpty()) return;
    m_recovering = true; m_recoveryDone = false; m_recoveryMessage = QStringLiteral("Checking your recovery key…"); emit recoveryChanged();
    pager_recover(m_core, key.toUtf8().constData());
}
void Engine::markCurrentRead() { if (!m_current.isEmpty()) markRead(m_current); }

void Engine::markRead(const QString &roomId) {
    Room *r = m_store.mutableRoom(roomId);
    if (!m_core || !r) return;
    const Msg *lastMsg = nullptr;
    for (int i = r->msgs.size() - 1; i >= 0; --i) if (!r->msgs[i].local && !r->msgs[i].id.isEmpty()) { lastMsg = &r->msgs[i]; break; }
    const bool wasMarked = r->markedUnread;
    if (!lastMsg || (r->unread == 0 && !wasMarked && (roomId != m_current || m_lastRead == lastMsg->id))) return;
    if (roomId == m_current) m_lastRead = lastMsg->id;
    const QString id = lastMsg->id;
    r->unread = 0; r->highlights = 0; r->markedUnread = false;
    refreshLists();
    pager_mark_read(m_core, roomId.toUtf8().constData(), id.toUtf8().constData());
    if (wasMarked) call(QStringLiteral("PUT"), QStringLiteral("/_matrix/client/v3/user/%1/rooms/%2/account_data/m.marked_unread").arg(pct(m_user), pct(roomId)), QVariantMap{{"unread", false}});
}
void Engine::markAllRead() { for (const QString &id : m_store.order()) if (const Room *r = m_store.room(id)) if (r->unread > 0 || r->markedUnread) markRead(id); }
void Engine::markUnread(const QString &roomId, bool on) {
    m_store.setMarkedUnread(roomId, on); refreshLists();
    call(QStringLiteral("PUT"), QStringLiteral("/_matrix/client/v3/user/%1/rooms/%2/account_data/m.marked_unread").arg(pct(m_user), pct(roomId)), QVariantMap{{"unread", on}});
}

void Engine::logout() { if (m_core) pager_logout(m_core); }

void Engine::openRoom(const QString &id) {
    if (id != m_current) setTyping(false);
    m_current = id; m_lastRead.clear();
    // Where the unread messages begin: the first one from someone else after what you last read.
    QString divider;
    if (const Room *rr = m_store.room(id)) {
        const QString read = rr->receipts.value(m_user);
        int from = -1;
        for (int i = rr->msgs.size() - 1; i >= 0 && !read.isEmpty(); --i) if (rr->msgs[i].id == read) { from = i + 1; break; }
        if (from < 0) from = rr->unread > 0 ? qMax(0, rr->msgs.size() - rr->unread) : rr->msgs.size();
        for (int i = from; i < rr->msgs.size(); ++i) if (!m_store.mine(rr->msgs[i])) { divider = rr->msgs[i].id; break; }
        if (rr->markedUnread && divider.isEmpty()) divider.clear();
    }
    m_timeline.setUnreadBefore(divider);
    m_timeline.show(QString()); m_timeline.show(id);          // a different chat: start the list over
    emit currentChanged();
    markCurrentRead();
    Room *r = m_store.mutableRoom(id);
    if (!r) return;
    // A room we only know from the latest sync has a few messages at best: ask for the newest page once.
    if (m_core && !r->historyAsked && r->msgs.size() < 25) { r->historyAsked = true; pager_load_history(m_core, id.toUtf8().constData(), ""); }
}
void Engine::loadOlder() {
    Room *r = m_store.mutableRoom(m_current);
    if (!m_core || !r || r->reachedStart || r->historyToken.isEmpty()) return;
    const QByteArray token = r->historyToken.toUtf8();
    r->historyToken.clear();                       // one request at a time: the answer brings the next token
    pager_load_history(m_core, m_current.toUtf8().constData(), token.constData());
}
void Engine::send(const QString &text, const QString &replyTo, bool markdown) {
    const QString body = text.trimmed();
    if (body.isEmpty() || m_current.isEmpty()) return;
    const QString html = markdown ? Rich::markdown(body) : QString();
    const QString local = m_store.addLocal(m_current, body, replyTo, html);
    setTyping(false); setDraft(m_current, QString());
    m_timeline.show(m_current); m_rooms.refresh(); emit currentChanged();
    if (!m_core) return;
    QJsonObject content{{"msgtype", "m.text"}, {"body", body}};
    if (!html.isEmpty()) { content.insert("format", "org.matrix.html"); content.insert("formatted_body", html); }
    if (!replyTo.isEmpty()) content.insert("m.relates_to", QJsonObject{{"m.in_reply_to", QJsonObject{{"event_id", replyTo}}}});
    sendEvent(m_current, QStringLiteral("m.room.message"), content, local);
}

void Engine::sendEvent(const QString &room, const QString &type, const QJsonObject &content, const QString &txn) {
    if (!m_core) return;
    const QByteArray json = QJsonDocument(content).toJson(QJsonDocument::Compact);
    pager_send_event(m_core, room.toUtf8().constData(), type.toUtf8().constData(), json.constData(), txn.toUtf8().constData());
}

void Engine::react(const QString &eventId, const QString &emoji) {
    if (m_current.isEmpty() || eventId.isEmpty() || eventId.startsWith(QLatin1String("local-"))) return;
    const qint64 now = QDateTime::currentMSecsSinceEpoch();
    const QString existing = m_store.reactionIdOf(m_current, eventId, emoji, m_user);
    if (!existing.isEmpty()) {
        if (!existing.startsWith(QLatin1String("local-")) && m_core) pager_redact(m_core, m_current.toUtf8().constData(), existing.toUtf8().constData());
        m_store.applyLocalEvent(m_current, QJsonObject{{"event_id", QStringLiteral("local-redact-%1").arg(m_store.nextLocalId())}, {"type", "m.room.redaction"}, {"sender", m_user}, {"redacts", existing}, {"origin_server_ts", double(now)}});
    } else {
        const QJsonObject content{{"m.relates_to", QJsonObject{{"rel_type", "m.annotation"}, {"event_id", eventId}, {"key", emoji}}}};
        m_store.applyLocalEvent(m_current, QJsonObject{{"event_id", QStringLiteral("local-react-%1").arg(m_store.nextLocalId())}, {"type", "m.reaction"}, {"sender", m_user}, {"origin_server_ts", double(now)}, {"content", content}});
        sendEvent(m_current, QStringLiteral("m.reaction"), content);
    }
    m_timeline.show(m_current); emit currentChanged();
}

void Engine::deleteMessage(const QString &eventId) {
    const Room *r = m_store.room(m_current);
    const Msg *m = r ? r->find(eventId) : nullptr;
    if (!m || !m_store.mine(*m) || m->local) return;
    if (m_core) pager_redact(m_core, m_current.toUtf8().constData(), eventId.toUtf8().constData());
    m_store.applyLocalEvent(m_current, QJsonObject{{"event_id", QStringLiteral("local-redact-%1").arg(m_store.nextLocalId())}, {"type", "m.room.redaction"}, {"sender", m_user}, {"redacts", eventId}, {"origin_server_ts", double(QDateTime::currentMSecsSinceEpoch())}});
    m_timeline.show(m_current); m_rooms.refresh(); emit currentChanged();
}

void Engine::edit(const QString &eventId, const QString &text) {
    const QString body = text.trimmed();
    const Room *r = m_store.room(m_current);
    const Msg *m = r ? r->find(eventId) : nullptr;
    if (body.isEmpty() || !m || !m_store.mine(*m) || m->local || m->body == body) return;
    const QJsonObject content{{"msgtype", "m.text"}, {"body", QStringLiteral("* ") + body}, {"m.new_content", QJsonObject{{"msgtype", "m.text"}, {"body", body}}},
                              {"m.relates_to", QJsonObject{{"rel_type", "m.replace"}, {"event_id", eventId}}}};
    m_store.applyLocalEvent(m_current, QJsonObject{{"event_id", QStringLiteral("local-edit-%1").arg(m_store.nextLocalId())}, {"type", "m.room.message"}, {"sender", m_user}, {"origin_server_ts", double(QDateTime::currentMSecsSinceEpoch())}, {"content", content}});
    sendEvent(m_current, QStringLiteral("m.room.message"), content);
    m_timeline.show(m_current); m_rooms.refresh(); emit currentChanged();
}

void Engine::fetchMedia(const QString &eventId) {
    const Room *r = m_store.room(m_current);
    const Msg *m = r ? r->find(eventId) : nullptr;
    if (!m_core || !m || m->content.isEmpty()) return;
    auto start = [&](const QString &key, QJsonObject content, bool thumbnail) {
        if (!m_store.mediaPath(key).isEmpty() || m_fetching.contains(key)) return;
        m_fetching.insert(key);
        const QByteArray json = QJsonDocument(content).toJson(QJsonDocument::Compact);
        pager_fetch_media(m_core, key.toUtf8().constData(), json.constData(), thumbnail);
    };
    if (m->kind == QLatin1String("video")) { start(QStringLiteral("poster:") + eventId, m->content, true); return; }
    if (m->kind != QLatin1String("image")) return;
    const bool gif = m->mime == QLatin1String("image/gif") || m->gifLike;
    QJsonObject c = m->content;
    if (!gif && c.contains(QLatin1String("url")) && !c.contains(QLatin1String("file"))) c.insert(QStringLiteral("thumb"), QJsonObject{{"w", 640}, {"h", 640}});   // a small copy is enough in the chat
    start(eventId, c, false);
}

void Engine::fetchFull(const QString &eventId) {
    const Room *r = m_store.room(m_current);
    const Msg *m = r ? r->find(eventId) : nullptr;
    const QString key = QStringLiteral("full:") + eventId;
    if (!m_core || !m || m->content.isEmpty()) return;
    if (!m_store.mediaPath(key).isEmpty()) { emit mediaReady(key); return; }
    if (m_fetching.contains(key)) return;
    m_fetching.insert(key);
    const QByteArray json = QJsonDocument(m->content).toJson(QJsonDocument::Compact);
    pager_fetch_media(m_core, key.toUtf8().constData(), json.constData(), false);
}

bool Engine::saveCopy(const QString &eventId, const QString &destination) const {
    const QString src = fullPath(eventId);
    if (src.isEmpty() || destination.isEmpty()) return false;
    QFile::remove(destination);
    return QFile::copy(src, destination);
}

void Engine::sendFile(const QString &path, const QString &mime, int w, int h, const QString &caption) {
    if (m_current.isEmpty()) return;
    const QString name = QFileInfo(path).fileName();
    const QString localFile = m_store.addLocalFile(m_current, path, name, mime.startsWith(QLatin1String("image/")), w, h);
    m_timeline.show(m_current); m_rooms.refresh(); emit currentChanged();
    if (m_core) pager_send_file(m_core, m_current.toUtf8().constData(), path.toUtf8().constData(), mime.toUtf8().constData(), caption.toUtf8().constData(), w, h, localFile.toUtf8().constData());
}

void Engine::createPoll(const QString &question, const QStringList &answers, int maxSelections, bool disclosed) {
    QStringList list; for (const QString &a : answers) if (!a.trimmed().isEmpty()) list << a.trimmed();
    if (m_current.isEmpty() || question.trimmed().isEmpty() || list.size() < 2) return;
    QJsonArray ans; QString fallback = question.trimmed();
    for (int i = 0; i < list.size(); ++i) { ans.append(QJsonObject{{"id", QStringLiteral("a%1").arg(i + 1)}, {"org.matrix.msc1767.text", list[i]}}); fallback += QStringLiteral("\n%1. %2").arg(i + 1).arg(list[i]); }
    const QString q = question.trimmed();
    const QJsonObject start{{"kind", disclosed ? "org.matrix.msc3381.poll.disclosed" : "org.matrix.msc3381.poll.undisclosed"}, {"max_selections", qBound(1, maxSelections, list.size())},
                            {"question", QJsonObject{{"org.matrix.msc1767.text", q}, {"body", q}, {"msgtype", "m.text"}}}, {"answers", ans}};
    const QJsonObject content{{"org.matrix.msc3381.poll.start", start}, {"org.matrix.msc1767.text", fallback}};
    m_store.applyLocalEvent(m_current, QJsonObject{{"event_id", QStringLiteral("local-poll-%1").arg(m_store.nextLocalId())}, {"type", "org.matrix.msc3381.poll.start"}, {"sender", m_user}, {"origin_server_ts", double(QDateTime::currentMSecsSinceEpoch())}, {"content", content}});
    sendEvent(m_current, QStringLiteral("org.matrix.msc3381.poll.start"), content);
    m_timeline.show(m_current); m_rooms.refresh(); emit currentChanged();
}

void Engine::vote(const QString &pollId, const QString &answerId) {
    const Room *r = m_store.room(m_current);
    const Msg *p = r ? r->find(pollId) : nullptr;
    if (!p || p->kind != QLatin1String("poll") || p->local || r->ended.contains(pollId)) return;
    QStringList mine = r->votes.value(pollId).value(m_user);
    if (p->poll.maxSelections <= 1) mine = QStringList{answerId};
    else if (mine.contains(answerId)) mine.removeAll(answerId);
    else if (mine.size() < p->poll.maxSelections) mine << answerId;
    else return;
    const QJsonObject content{{"m.relates_to", QJsonObject{{"rel_type", "m.reference"}, {"event_id", pollId}}}, {"org.matrix.msc3381.poll.response", QJsonObject{{"answers", QJsonArray::fromStringList(mine)}}}};
    m_store.applyLocalEvent(m_current, QJsonObject{{"event_id", QStringLiteral("local-vote-%1").arg(m_store.nextLocalId())}, {"type", "org.matrix.msc3381.poll.response"}, {"sender", m_user}, {"origin_server_ts", double(QDateTime::currentMSecsSinceEpoch())}, {"content", content}});
    sendEvent(m_current, QStringLiteral("org.matrix.msc3381.poll.response"), content);
    m_timeline.show(m_current); emit currentChanged();
}

void Engine::endPoll(const QString &pollId) {
    const Room *r = m_store.room(m_current);
    const Msg *p = r ? r->find(pollId) : nullptr;
    if (!p || p->kind != QLatin1String("poll") || !m_store.mine(*p) || p->local || r->ended.contains(pollId)) return;
    const QJsonObject content{{"m.relates_to", QJsonObject{{"rel_type", "m.reference"}, {"event_id", pollId}}}, {"org.matrix.msc1767.text", "The poll has ended."}};
    m_store.applyLocalEvent(m_current, QJsonObject{{"event_id", QStringLiteral("local-end-%1").arg(m_store.nextLocalId())}, {"type", "org.matrix.msc3381.poll.end"}, {"sender", m_user}, {"origin_server_ts", double(QDateTime::currentMSecsSinceEpoch())}, {"content", content}});
    sendEvent(m_current, QStringLiteral("org.matrix.msc3381.poll.end"), content);
    m_timeline.show(m_current); emit currentChanged();
}

void Engine::api(const QString &method, const QString &path, const QVariant &body, const QJSValue &callback) {
    const QString key = QStringLiteral("api-%1").arg(++m_callCounter);
    if (path == QLatin1String("/api/me") && !callback.isCallable()) m_meKey = key;
    if (callback.isCallable()) m_calls.insert(key, callback);
    if (!m_core) { QTimer::singleShot(0, this, [this, key] { handle(QStringLiteral("http"), QJsonObject{{"key", key}, {"status", 0}, {"body", QJsonObject{{"error", "Not connected"}}}}); }); return; }
    const QByteArray json = body.isValid() && !body.isNull() ? QJsonDocument::fromVariant(body).toJson(QJsonDocument::Compact) : QByteArray();
    pager_http(m_core, key.toUtf8().constData(), method.toUtf8().constData(), path.toUtf8().constData(), json.constData());
}

QVariantMap Engine::qr(const QString &text) const {
    char *raw = pager_qr(text.toUtf8().constData());
    const QJsonObject o = QJsonDocument::fromJson(QByteArray(raw)).object();
    pager_free_string(raw);
    return o.toVariantMap();
}

void Engine::checkForUpdates(bool quiet) {
    if (!m_core || m_updState == QLatin1String("checking") || m_updState == QLatin1String("downloading") || m_updState == QLatin1String("installing")) return;
    m_updQuiet = quiet; m_updState = QStringLiteral("checking"); if (!quiet) m_updMessage.clear(); emit updateChanged();
#ifdef Q_OS_WIN
    const char *entry = "nativeWindows";
#else
    const char *entry = "native";
#endif
    pager_update_check(m_core, "", PAGER_NATIVE_VERSION, entry);
}

void Engine::installUpdate() {
    if (!m_core || m_updState != QLatin1String("available")) return;
    m_updState = QStringLiteral("downloading"); m_updProgress = 0; m_updMessage.clear(); emit updateChanged();
    const QString dir = QStandardPaths::writableLocation(QStandardPaths::CacheLocation) + QStringLiteral("/updates");
    pager_update_download(m_core, m_updBase.toUtf8().constData(), m_updFile.toUtf8().constData(), m_updSha.toUtf8().constData(), dir.toUtf8().constData());
}

void Engine::updateInstalled(const QString &error) {
    if (error.isEmpty()) { emit restartRequested(); return; }
    m_updState = QStringLiteral("error"); m_updMessage = error; emit updateChanged();
}

QString Engine::pct(const QString &s) { return QString::fromUtf8(QUrl::toPercentEncoding(s)); }

void Engine::call(const QString &method, const QString &path, const QVariant &body, std::function<void(int, const QJsonValue &)> done) {
    const QString key = QStringLiteral("int-%1").arg(++m_callCounter);
    if (done) m_internal.insert(key, done);
    if (!m_core) return;
    const QByteArray json = body.isValid() && !body.isNull() ? QJsonDocument::fromVariant(body).toJson(QJsonDocument::Compact) : QByteArray();
    pager_http(m_core, key.toUtf8().constData(), method.toUtf8().constData(), path.toUtf8().constData(), json.constData());
}

void Engine::filter(const QString &tab, const QString &search) { m_tab = tab; m_search = search; m_rooms.setFilter(tab, search); emit listChanged(); }
QStringList Engine::labels() const {
    QSet<QString> all; for (auto it = m_store.roomsBegin(); it != m_store.roomsEnd(); ++it) for (const QString &l : it->labels()) all.insert(l);
    QStringList out(all.cbegin(), all.cend()); out.sort(Qt::CaseInsensitive); return out;
}
QString Engine::currentTyping() const {
    const Room *r = m_store.room(m_current);
    if (!r || r->typing.isEmpty()) return {};
    QStringList names; for (const QString &u : r->typing) names << r->nameOf(u).section(QLatin1Char(' '), 0, 0);
    return r->isGroup() ? names.join(QStringLiteral(", ")) + (names.size() > 1 ? QStringLiteral(" are typing…") : QStringLiteral(" is typing…")) : QStringLiteral("typing…");
}
QVariantMap Engine::roomInfo(const QString &id) const {
    const Room *r = m_store.room(id);
    if (!r) return {};
    return QVariantMap{{"name", RoomListModel::displayName(*r)}, {"pinned", r->pinned()}, {"archived", r->archived()}, {"lowPriority", r->lowPriority()}, {"muted", m_store.muted(id)},
                       {"unread", r->unread}, {"markedUnread", r->markedUnread}, {"labels", r->labels()}, {"isGroup", r->isGroup()}, {"network", r->network}, {"encrypted", r->encrypted}};
}

void Engine::setTag(const QString &roomId, const QString &tag, bool on, double order) {
    m_store.setTag(roomId, tag, on, order); refreshLists(); if (roomId == m_current) emit currentChanged();
    const QString path = QStringLiteral("/_matrix/client/v3/user/%1/rooms/%2/tags/%3").arg(pct(m_user), pct(roomId), pct(tag));
    if (on) call(QStringLiteral("PUT"), path, order != 0 ? QVariant(QVariantMap{{"order", order}}) : QVariant(QVariantMap()));
    else call(QStringLiteral("DELETE"), path, QVariant());
}
void Engine::pin(const QString &roomId, bool on) {
    if (!on) { setTag(roomId, QStringLiteral("m.favourite"), false); return; }
    double last = 0; for (auto it = m_store.roomsBegin(); it != m_store.roomsEnd(); ++it) if (it->pinned() && it->id != roomId) last = qMax(last, it->pinOrder);
    setTag(roomId, QStringLiteral("m.favourite"), true, last + 1);
}
void Engine::setMuted(const QString &roomId, bool on) {
    QSet<QString> s = m_store.mutedSet(); if (on) s.insert(roomId); else s.remove(roomId);
    m_store.setMuted(s); refreshLists();
    const QString path = QStringLiteral("/_matrix/client/v3/pushrules/global/override/") + pct(roomId);
    if (on) call(QStringLiteral("PUT"), path, QVariantMap{{"actions", QVariantList()}, {"conditions", QVariantList{QVariantMap{{"kind", "event_match"}, {"key", "room_id"}, {"pattern", roomId}}}}});
    else call(QStringLiteral("DELETE"), path, QVariant());
}
void Engine::leaveRoom(const QString &roomId, bool atSource) {
    m_store.removeRoom(roomId);
    if (m_current == roomId) { m_current.clear(); m_timeline.show({}); emit currentChanged(); }
    refreshLists();
    auto leave = [this, roomId] {
        call(QStringLiteral("POST"), QStringLiteral("/_matrix/client/v3/rooms/%1/leave").arg(pct(roomId)), QVariantMap(), [this, roomId](int, const QJsonValue &) {
            call(QStringLiteral("POST"), QStringLiteral("/_matrix/client/v3/rooms/%1/forget").arg(pct(roomId)), QVariantMap());
        });
    };
    if (atSource) {
        sendEvent(roomId, QStringLiteral("com.beeper.delete_chat"), QJsonObject{{"delete_for_everyone", false}}, QString());
        QTimer::singleShot(2500, this, leave);
    } else leave();
}
void Engine::renameRoom(const QString &roomId, const QString &name) {
    Room *r = m_store.mutableRoom(roomId); if (!r || name.trimmed().isEmpty()) return;
    r->name = name.trimmed(); refreshLists(); if (roomId == m_current) emit currentChanged();
    call(QStringLiteral("PUT"), QStringLiteral("/_matrix/client/v3/rooms/%1/state/m.room.name").arg(pct(roomId)), QVariantMap{{"name", name.trimmed()}});
}
void Engine::setTyping(bool on) {
    if (m_current.isEmpty() || !m_core) return;
    const qint64 now = QDateTime::currentMSecsSinceEpoch();
    if (on && now - m_lastTyping < 4000) return;
    if (!on && m_lastTyping == 0) return;
    m_lastTyping = on ? now : 0;
    call(QStringLiteral("PUT"), QStringLiteral("/_matrix/client/v3/rooms/%1/typing/%2").arg(pct(m_current), pct(m_user)),
         on ? QVariant(QVariantMap{{"typing", true}, {"timeout", 6000}}) : QVariant(QVariantMap{{"typing", false}}));
}

void Engine::loadPushRules() {
    call(QStringLiteral("GET"), QStringLiteral("/_matrix/client/v3/pushrules/"), QVariant(), [this](int status, const QJsonValue &v) {
        if (status != 200) return;
        QSet<QString> muted;
        const QJsonObject global = v.toObject().value(QLatin1String("global")).toObject();
        auto silent = [](const QJsonObject &rule) { if (rule.value(QLatin1String("enabled")).isBool() && !rule.value(QLatin1String("enabled")).toBool()) return false; for (const QJsonValue &a : rule.value(QLatin1String("actions")).toArray()) if (a.toString() == QLatin1String("notify")) return false; return true; };
        for (const QJsonValue &rv : global.value(QLatin1String("override")).toArray()) {
            const QJsonObject rule = rv.toObject(); if (!silent(rule)) continue;
            const QJsonArray cond = rule.value(QLatin1String("conditions")).toArray();
            if (cond.size() != 1) continue;
            const QJsonObject c = cond[0].toObject();
            if (c.value(QLatin1String("kind")).toString() == QLatin1String("event_match") && c.value(QLatin1String("key")).toString() == QLatin1String("room_id")) muted.insert(c.value(QLatin1String("pattern")).toString());
        }
        for (const QJsonValue &rv : global.value(QLatin1String("room")).toArray()) { const QJsonObject rule = rv.toObject(); if (silent(rule)) muted.insert(rule.value(QLatin1String("rule_id")).toString()); }
        m_store.setMuted(muted); refreshLists();
    });
}

static QString escLocalpart(const QString &s) {
    QString out;
    for (const QChar c : s) { const ushort u = c.unicode(); if ((u >= 'a' && u <= 'z') || (u >= '0' && u <= '9') || u == '-' || u == '.' || u == '_' || u == '/') out += c; else out += QStringLiteral("=%1").arg(u, 2, 16, QLatin1Char('0')); }
    return out;
}
void Engine::loadIdentity() {
    call(QStringLiteral("GET"), QStringLiteral("/api/bridges"), QVariant(), [this](int status, const QJsonValue &v) {
        if (status != 200) return;
        const QString domain = m_user.section(QLatin1Char(':'), 1);
        QStringList names, ids;
        for (const QJsonValue &nv : v.toObject().value(QLatin1String("networks")).toArray()) {
            const QJsonObject n = nv.toObject();
            for (const QJsonValue &lv : n.value(QLatin1String("logins")).toArray()) {
                const QJsonObject l = lv.toObject();
                ids << QStringLiteral("@%1_%2:%3").arg(n.value(QLatin1String("id")).toString(), escLocalpart(l.value(QLatin1String("id")).toString()), domain);
                for (const QString &nm : {l.value(QLatin1String("name")).toString(), l.value(QLatin1String("profile")).toObject().value(QLatin1String("name")).toString()}) if (!nm.isEmpty()) names << nm;
            }
        }
        m_store.setOwnIdentity(names, ids); m_timeline.show(m_current); refreshLists();
        // names for the phone numbers bridges show: each of your accounts' contact lists
        for (const QJsonValue &nv : v.toObject().value(QLatin1String("networks")).toArray()) {
            const QJsonObject n = nv.toObject();
            for (const QJsonValue &lv : n.value(QLatin1String("logins")).toArray()) {
                const QString lid = lv.toObject().value(QLatin1String("id")).toString();
                call(QStringLiteral("GET"), QStringLiteral("/api/bridges/%1/contacts?login_id=%2").arg(pct(n.value(QLatin1String("id")).toString()), pct(lid)), QVariant(), [](int st, const QJsonValue &cv) {
                    if (st != 200) return;
                    const QJsonObject o = cv.toObject(); QJsonArray arr = o.value(QLatin1String("contacts")).toArray(); if (arr.isEmpty()) arr = o.value(QLatin1String("results")).toArray();
                    QList<QPair<QString, QString>> entries;
                    for (const QJsonValue &c : arr) { const QJsonObject co = c.toObject(); const QJsonArray idn = co.value(QLatin1String("identifiers")).toArray(); if (idn.isEmpty()) continue; QString num = idn[0].toString(); if (num.startsWith(QLatin1String("tel:"))) num = num.mid(4); entries.append({num, co.value(QLatin1String("name")).toString()}); }
                    Names::add(entries);
                });
            }
        }
    });
}

void Engine::demoReceive(const QString &room, const QString &text) {
    if (m_core) return;                                           // only for the made-up chats (tests, screenshots)
    const Room *r = m_store.room(room); if (!r) return;
    handle(QStringLiteral("rooms"), QJsonObject{{"rooms", QJsonArray{QJsonObject{{"id", room}, {"events", QJsonArray{QJsonObject{{"event_id", QStringLiteral("d%1").arg(++m_callCounter)}, {"type", "m.room.message"}, {"sender", "@someone:demo.test"}, {"sender_name", "Someone"},
        {"origin_server_ts", double(QDateTime::currentMSecsSinceEpoch())}, {"content", QJsonObject{{"msgtype", "m.text"}, {"body", text}}}}}}}}}});
}

void Engine::openWhenAvailable(const QString &roomId) {
    if (m_store.room(roomId)) { openRoom(roomId); emit roomOpened(roomId); return; }
    m_pendingOpen = roomId;
    QTimer::singleShot(30000, this, [this, roomId] { if (m_pendingOpen == roomId) m_pendingOpen.clear(); });
}
void Engine::addToPhonebook(const QVariantList &entries, bool override) {
    QList<QPair<QString, QString>> list;
    for (const QVariant &v : entries) { const QVariantMap m = v.toMap(); list.append({m.value("number").toString(), m.value("name").toString()}); }
    Names::add(list, override);
}
int Engine::importContacts(const QString &path) {
    QFile f(path); if (!f.open(QIODevice::ReadOnly)) return 0;
    const auto entries = Names::parseVcf(QString::fromUtf8(f.readAll()));
    Names::add(entries, true);
    QSet<QString> numbers; for (const auto &e : entries) numbers.insert(Names::phoneKey(e.first));
    numbers.remove(QString()); return numbers.size();
}
QString Engine::prettyName(const QString &raw) const { return Names::pretty(raw); }

static QVariantMap hitOf(const Store &store, const Room &r, const Msg &m) {
    QString text = m.body;
    if (m.kind == QLatin1String("image")) text = m.sticker ? QStringLiteral("Sticker") : QStringLiteral("Photo") + (m.caption.isEmpty() ? QString() : QStringLiteral(": ") + m.caption);
    else if (m.kind == QLatin1String("video")) text = QStringLiteral("Video") + (m.caption.isEmpty() ? QString() : QStringLiteral(": ") + m.caption);
    else if (m.kind == QLatin1String("poll")) text = QStringLiteral("Poll: ") + m.poll.question;
    const QString av = r.avatar.isEmpty() ? QString() : store.mediaPath(QStringLiteral("av:") + r.avatar);
    if (!r.avatar.isEmpty() && av.isEmpty()) store.wantAvatar(r.avatar);
    return QVariantMap{{"roomId", r.id}, {"eventId", m.id}, {"sender", m.sender}, {"senderName", store.mine(m) ? QStringLiteral("You") : r.nameOf(m.sender)}, {"text", text}, {"ts", m.ts},
                       {"time", QDateTime::fromMSecsSinceEpoch(m.ts).toString(QStringLiteral("MMM d, h:mm AP"))}, {"chat", RoomListModel::displayName(r)}, {"avatar", av}, {"network", r.network}, {"kind", m.kind}};
}

QVariantList Engine::searchLocal(const QString &term, const QString &roomId, const QString &kind) const {
    const QString t = term.trimmed().toLower();
    static const QRegularExpression url(QStringLiteral("https?://\\S+|www\\.\\S+"));
    QVector<QPair<qint64, QVariantMap>> found;
    for (auto it = m_store.roomsBegin(); it != m_store.roomsEnd(); ++it) {
        const Room &r = *it;
        if ((!roomId.isEmpty() && r.id != roomId) || m_store.isBotRoom(r)) continue;
        for (const Msg &m : r.msgs) {
            if (m.local || m.locked) continue;
            const bool kindOk = kind == QLatin1String("all") || (kind == QLatin1String("images") && m.kind == QLatin1String("image") && !m.sticker) || (kind == QLatin1String("videos") && m.kind == QLatin1String("video"))
                || (kind == QLatin1String("files") && m.kind == QLatin1String("file")) || (kind == QLatin1String("links") && url.match(m.body).hasMatch());
            if (!kindOk) continue;
            if (!t.isEmpty() && !m.body.toLower().contains(t) && !m.caption.toLower().contains(t) && !m.poll.question.toLower().contains(t)) continue;
            if (t.isEmpty() && kind == QLatin1String("all")) continue;
            found.append({m.ts, hitOf(m_store, r, m)});
        }
    }
    std::sort(found.begin(), found.end(), [](const auto &a, const auto &b) { return a.first > b.first; });
    QVariantList out; for (int i = 0; i < found.size() && i < 200; ++i) out << found[i].second;
    return out;
}

void Engine::searchRemote(const QString &term, const QString &roomId, const QJSValue &callback) {
    QVariantMap roomEvents{{"search_term", term}, {"keys", QVariantList{"content.body"}}, {"order_by", "recent"}};
    if (!roomId.isEmpty()) roomEvents.insert("filter", QVariantMap{{"rooms", QVariantList{roomId}}});
    QJSValue cb = callback;
    call(QStringLiteral("POST"), QStringLiteral("/_matrix/client/v3/search"), QVariantMap{{"search_categories", QVariantMap{{"room_events", roomEvents}}}}, [this, cb](int status, const QJsonValue &v) mutable {
        QVariantList out;
        if (status == 200) for (const QJsonValue &rv : v.toObject().value(QLatin1String("search_categories")).toObject().value(QLatin1String("room_events")).toObject().value(QLatin1String("results")).toArray()) {
            const QJsonObject ev = rv.toObject().value(QLatin1String("result")).toObject();
            const QString room = ev.value(QLatin1String("room_id")).toString(); const Room *r = m_store.room(room); if (!r) continue;
            const QString body = ev.value(QLatin1String("content")).toObject().value(QLatin1String("body")).toString(); if (body.isEmpty()) continue;
            const QString sender = ev.value(QLatin1String("sender")).toString(); const qint64 ts = ev.value(QLatin1String("origin_server_ts")).toVariant().toLongLong();
            out << QVariantMap{{"roomId", room}, {"eventId", ev.value(QLatin1String("event_id")).toString()}, {"sender", sender}, {"senderName", sender == m_user ? QStringLiteral("You") : r->nameOf(sender)}, {"text", body}, {"ts", ts},
                               {"time", QDateTime::fromMSecsSinceEpoch(ts).toString(QStringLiteral("MMM d, h:mm AP"))}, {"chat", RoomListModel::displayName(*r)}, {"avatar", r->avatar.isEmpty() ? QString() : m_store.mediaPath(QStringLiteral("av:") + r->avatar)}, {"network", r->network}, {"kind", "text"}};
        }
        if (cb.isCallable()) { QJSEngine *js = qjsEngine(this); if (js) cb.call({js->toScriptValue(out)}); }
    });
}

void Engine::openAt(const QString &roomId, const QString &eventId) {
    openRoom(roomId); emit roomOpened(roomId);
    const Room *r = m_store.room(roomId); if (!r) return;
    if (r->find(eventId)) { QTimer::singleShot(120, this, [this, eventId] { emit jumpRequested(eventId); }); return; }
    // older than what is loaded: ask the server for the stretch around it
    call(QStringLiteral("GET"), QStringLiteral("/_matrix/client/v3/rooms/%1/context/%2?limit=30").arg(pct(roomId), pct(eventId)), QVariant(), [this, roomId, eventId](int status, const QJsonValue &v) {
        if (status != 200) return;
        const QJsonObject o = v.toObject(); QJsonArray evs = o.value(QLatin1String("events_before")).toArray();
        QJsonArray ordered; for (int i = evs.size() - 1; i >= 0; --i) ordered.append(evs[i]);           // oldest first
        ordered.append(o.value(QLatin1String("event"))); for (const QJsonValue &a : o.value(QLatin1String("events_after")).toArray()) ordered.append(a);
        Room *r = m_store.mutableRoom(roomId); if (!r) return;
        for (const QJsonValue &e : ordered) m_store.applyLocalEvent(roomId, e.toObject());
        if (roomId == m_current) m_timeline.show(roomId);
        QTimer::singleShot(150, this, [this, eventId] { emit jumpRequested(eventId); });
    });
}

void Engine::retry(const QString &localId) {
    Room *r = m_store.mutableRoom(m_current);
    const Msg *m = r ? r->find(localId) : nullptr;
    if (!m || m->status != 2) return;
    const QString body = m->body, reply = m->replyTo;
    m_store.removeMessage(m_current, localId);
    send(body, reply, true);
}
void Engine::setDraft(const QString &roomId, const QString &text) {
    if (text.isEmpty()) m_drafts.remove(roomId); else m_drafts.insert(roomId, text);
    QTimer::singleShot(1000, this, [this] { saveDrafts(); });
}
void Engine::saveDrafts() {
    if (m_dataDir.isEmpty()) return;
    QJsonObject o; for (auto it = m_drafts.cbegin(); it != m_drafts.cend(); ++it) o.insert(it.key(), it.value());
    QFile f(m_dataDir + QStringLiteral("/drafts.json"));
    if (f.open(QIODevice::WriteOnly | QIODevice::Truncate)) f.write(QJsonDocument(o).toJson(QJsonDocument::Compact));
}
QString Engine::nameOfMessage(const QString &id) const {
    const Room *r = m_store.room(m_current); const Msg *m = r ? r->find(id) : nullptr;
    return !m ? QString() : (m_store.mine(*m) ? QStringLiteral("yourself") : r->nameOf(m->sender));
}
bool Engine::isMediaMessage(const QString &id) const {
    const Room *r = m_store.room(m_current); const Msg *m = r ? r->find(id) : nullptr;
    return m && !m->content.isEmpty() && (m->kind == QLatin1String("image") || m->kind == QLatin1String("video") || m->kind == QLatin1String("audio") || m->kind == QLatin1String("file"));
}
QString Engine::fileNameOf(const QString &id) const {
    const Room *r = m_store.room(m_current); const Msg *m = r ? r->find(id) : nullptr;
    return m ? (m->fileName.isEmpty() ? m->body : m->fileName) : QString();
}
QString Engine::messageDetails(const QString &id) const {
    const Room *r = m_store.room(m_current); const Msg *m = r ? r->find(id) : nullptr;
    if (!m) return {};
    return QStringLiteral("Sent: %1\nFrom: %2 (%3)\nType: %4\nEvent: %5").arg(QDateTime::fromMSecsSinceEpoch(m->ts).toString(QStringLiteral("dddd, MMMM d, yyyy h:mm:ss AP")), r->nameOf(m->sender), m->sender, m->type.isEmpty() ? m->kind : m->type, m->id);
}
void Engine::forward(const QString &id, const QString &toRoom) {
    const Room *r = m_store.room(m_current); const Msg *m = r ? r->find(id) : nullptr;
    if (!m || !m_store.room(toRoom) || m->locked) return;
    QJsonObject content;
    if (!m->content.isEmpty()) { content = m->content; content.remove(QStringLiteral("m.relates_to")); }
    else { content = QJsonObject{{"msgtype", "m.text"}, {"body", m->body}}; if (!m->html.isEmpty()) { content.insert("format", "org.matrix.html"); content.insert("formatted_body", m->html); } }
    sendEvent(toRoom, QStringLiteral("m.room.message"), content, QString());
}
QVariantList Engine::chatChoices(const QString &query) const {
    QVariantList out; const QString q = query.trimmed().toLower();
    for (const QString &id : m_store.order()) {
        const Room *r = m_store.room(id); if (!r || m_store.isBotRoom(*r)) continue;
        const QString name = RoomListModel::displayName(*r);
        if (!q.isEmpty() && !name.toLower().contains(q)) continue;
        const QString av = r->avatar.isEmpty() ? QString() : m_store.mediaPath(QStringLiteral("av:") + r->avatar);
        if (!r->avatar.isEmpty() && av.isEmpty()) m_store.wantAvatar(r->avatar);
        out << QVariantMap{{"id", id}, {"name", name}, {"avatar", av}, {"network", r->network}};
        if (out.size() >= 60) break;
    }
    return out;
}
QString Engine::mediaNeighbor(const QString &id, int dir) const {
    const Room *r = m_store.room(m_current); if (!r) return {};
    int at = -1; for (int i = 0; i < r->msgs.size(); ++i) if (r->msgs[i].id == id) { at = i; break; }
    if (at < 0 || dir == 0) return {};
    for (int i = at + (dir > 0 ? 1 : -1); i >= 0 && i < r->msgs.size(); i += dir > 0 ? 1 : -1) {
        const Msg &m = r->msgs[i]; if ((m.kind == QLatin1String("image") || m.kind == QLatin1String("video")) && !m.sticker && !m.content.isEmpty()) return m.id;
    }
    return {};
}
QVariantList Engine::members() const {
    QVariantList out; const Room *r = m_store.room(m_current); if (!r) return out;
    QStringList ids = r->joined; for (auto it = r->members.cbegin(); it != r->members.cend(); ++it) if (!ids.contains(it.key()) && r->joined.isEmpty()) ids << it.key();
    for (const QString &u : ids) {
        if (Store::isBridgeBot(u) || QRegularExpression(QStringLiteral("^@[a-z0-9_-]*bot:")).match(u).hasMatch()) continue;
        const QString av = r->memberAvatars.value(u); QString path = av.isEmpty() ? QString() : m_store.mediaPath(QStringLiteral("av:") + av);
        if (!av.isEmpty() && path.isEmpty()) m_store.wantAvatar(av);
        out << QVariantMap{{"id", u}, {"name", r->nameOf(u)}, {"avatar", path}, {"you", u == m_user}};
    }
    std::sort(out.begin(), out.end(), [](const QVariant &a, const QVariant &b) { const auto x = a.toMap(), y = b.toMap(); if (x["you"].toBool() != y["you"].toBool()) return x["you"].toBool(); return x["name"].toString().toLower() < y["name"].toString().toLower(); });
    return out;
}

QString Engine::bodyOf(const QString &eventId) const { const Room *r = m_store.room(m_current); const Msg *m = r ? r->find(eventId) : nullptr; return m ? m->body : QString(); }

// Made-up chats for screenshots and for trying the screens without a server (run with --demo).
void Engine::loadDemo() {
    m_starting = false; m_signedIn = true; m_user = QStringLiteral("@me:demo.test"); m_store.setMe(m_user);
    const qint64 now = QDateTime::currentMSecsSinceEpoch();
    auto ev = [&](const QString &id, const QString &who, const QString &name, const QString &body, qint64 minAgo) {
        return QJsonObject{{"event_id", id}, {"type", "m.room.message"}, {"sender", who}, {"sender_name", name}, {"origin_server_ts", double(now - minAgo * 60000)}, {"content", QJsonObject{{"msgtype", "m.text"}, {"body", body}}}};
    };
    const QString maya = QStringLiteral("@maya:demo.test"), me = m_user, dad = QStringLiteral("@dad:demo.test"), priya = QStringLiteral("@priya:demo.test"), leo = QStringLiteral("@leo:demo.test");
    QJsonArray mayaEv{ev("a1", maya, "Maya", "Are we still on for dinner tonight?", 62), ev("a2", maya, "Maya", "I can book somewhere around 7", 61), ev("a3", me, "You", "Yes! Booking sounds great", 55),
                      ev("a4", me, "You", "Can we do Italian?", 54), ev("a5", maya, "Maya", "Perfect, I know a place \U0001F35D", 12), ev("a6", maya, "Maya", "Sending the address now", 11),
                      ev("a7", me, "You", "See you there", 9), ev("a8", maya, "Maya", "Running 5 min late, sorry!", 2),
                      QJsonObject{{"event_id", "r1"}, {"type", "m.reaction"}, {"sender", me}, {"origin_server_ts", double(now - 10 * 60000)}, {"content", QJsonObject{{"m.relates_to", QJsonObject{{"rel_type", "m.annotation"}, {"event_id", "a5"}, {"key", "\U0001F44D"}}}}}},
                      QJsonObject{{"event_id", "r2"}, {"type", "m.reaction"}, {"sender", maya}, {"origin_server_ts", double(now - 9 * 60000)}, {"content", QJsonObject{{"m.relates_to", QJsonObject{{"rel_type", "m.annotation"}, {"event_id", "a5"}, {"key", "\U0001F525"}}}}}}};
    mayaEv.append(QJsonObject{{"event_id", "p1"}, {"type", "org.matrix.msc3381.poll.start"}, {"sender", maya}, {"sender_name", "Maya"}, {"origin_server_ts", double(now - 90 * 1000)}, {"content", QJsonObject{{"org.matrix.msc3381.poll.start", QJsonObject{
        {"max_selections", 1}, {"question", QJsonObject{{"body", "Where should we eat?"}}}, {"answers", QJsonArray{QJsonObject{{"id", "a1"}, {"body", "Pasta place"}}, QJsonObject{{"id", "a2"}, {"body", "Tacos"}}, QJsonObject{{"id", "a3"}, {"body", "Sushi"}}}}}}}}});
    for (const auto &v : QList<QPair<QString, QString>>{{maya, "a1"}, {me, "a1"}, {dad, "a2"}})
        mayaEv.append(QJsonObject{{"event_id", "v" + v.first}, {"type", "org.matrix.msc3381.poll.response"}, {"sender", v.first}, {"origin_server_ts", double(now - 60 * 1000)}, {"content", QJsonObject{{"m.relates_to", QJsonObject{{"rel_type", "m.reference"}, {"event_id", "p1"}}}, {"org.matrix.msc3381.poll.response", QJsonObject{{"answers", QJsonArray{v.second}}}}}}});
    mayaEv.append(QJsonObject{{"event_id", "f1"}, {"type", "m.room.message"}, {"sender", me}, {"origin_server_ts", double(now - 30 * 1000)}, {"content", QJsonObject{{"msgtype", "m.file"}, {"body", "menu.pdf"}, {"url", "mxc://demo/menu"}}}});
    QJsonArray rooms{
        QJsonObject{{"id", "!maya"}, {"name", "Maya"}, {"direct", true}, {"encrypted", true}, {"unread", 2}, {"events", mayaEv}},
        QJsonObject{{"id", "!work"}, {"name", "Work chat"}, {"direct", false}, {"encrypted", true}, {"unread", 5}, {"events", QJsonArray{ev("w1", priya, "Priya", "Shipping the release now", 300), ev("w2", leo, "Leo", "Nice, I'll watch the dashboards", 295), ev("w3", priya, "Priya", "All green so far", 290)}}},
        QJsonObject{{"id", "!dad"}, {"name", "Dad"}, {"direct", true}, {"encrypted", true}, {"unread", 0}, {"events", QJsonArray{ev("d1", dad, "Dad", "Call me when you land", 190), ev("d2", me, "You", "Will do", 185)}}},
        QJsonObject{{"id", "!sam"}, {"name", "Sam"}, {"direct", true}, {"encrypted", false}, {"unread", 0}, {"events", QJsonArray{ev("s1", QStringLiteral("@sam:demo.test"), "Sam", "lol that's great", 1500), ev("s2", me, "You", "I know right", 1490)}}},
    };
    QJsonArray longEv;
    for (int i = 0; i < 400; ++i) longEv.append(ev(QStringLiteral("L%1").arg(i), i % 3 ? priya : leo, i % 3 ? "Priya" : "Leo", QStringLiteral("Message number %1 in a long chat, with enough words to wrap onto a second line sometimes").arg(i), 4000 - i * 3));
    rooms.append(QJsonObject{{"id", "!long"}, {"name", "Long chat"}, {"direct", false}, {"encrypted", true}, {"unread", 0}, {"events", longEv}});
    m_store.applyRooms(rooms); m_rooms.refresh();
    openRoom(QStringLiteral("!maya"));
}
