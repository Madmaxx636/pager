#include "engine.h"
#include <QCoreApplication>
#include <QDateTime>
#include <QFile>
#include <QFileInfo>
#include <QJSEngine>
#include <QQmlEngine>
#include <QStandardPaths>
#include <QJsonArray>
#include <QJsonDocument>
#include <QMetaObject>
#include <QTimer>

Engine::Engine(const QString &dataDir, bool demo, QObject *parent) : QObject(parent) {
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
            if (m_core) api(QStringLiteral("GET"), QStringLiteral("/api/me"), QVariant(), QJSValue());   // is this an admin? (answered below)
        }
        else { m_user.clear(); m_synced = false; m_error = b.value(QLatin1String("error")).toString(); }
        m_working = false;
        emit stateChanged();
    } else if (kind == QLatin1String("rooms")) {
        const QStringList changed = m_store.applyRooms(b.value(QLatin1String("rooms")).toArray());
        m_rooms.refresh();
        for (const QString &id : changed) {        // pop-ups: only for new messages from others, never for the first catch-up or the chat in front of you
            const Room *r = m_store.room(id);
            if (!r || r->msgs.isEmpty()) continue;
            const Msg &last = r->msgs.last();
            if (m_seen.value(id) == last.id) continue;
            m_seen.insert(id, last.id);
            if (m_firstRooms || last.local || m_store.mine(last) || last.locked || (m_active && id == m_current)) continue;
            const QString who = r->direct ? r->name : last.senderName;
            emit notify(id, r->direct ? r->name : r->name + QStringLiteral(" · ") + who, last.kind == QLatin1String("image") ? QStringLiteral("Sent a photo") : last.kind == QLatin1String("file") ? QStringLiteral("Sent a file") : last.body);
        }
        m_firstRooms = false;
        emit unreadChanged(totalUnread());
        if (!m_current.isEmpty() && changed.contains(m_current)) { m_timeline.show(m_current); emit currentChanged(); if (m_active) markCurrentRead(); }
    } else if (kind == QLatin1String("history")) {
        const QString id = m_store.applyHistory(b);
        if (id == m_current) { m_timeline.show(id); emit currentChanged(); }
        m_rooms.refresh();
    } else if (kind == QLatin1String("left")) {
        m_store.removeRoom(b.value(QLatin1String("id")).toString());
        if (m_current == b.value(QLatin1String("id")).toString()) { m_current.clear(); m_timeline.show({}); emit currentChanged(); }
        m_rooms.refresh();
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
        if (b.contains(QLatin1String("path"))) { m_store.setMediaPath(key, b.value(QLatin1String("path")).toString()); m_timeline.touch(key); }
    } else if (kind == QLatin1String("http")) {
        const QString key = b.value(QLatin1String("key")).toString();
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
    return r->encrypted ? QStringLiteral("End-to-end encrypted") : QStringLiteral("Not encrypted");
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
void Engine::markCurrentRead() {
    const Room *r = m_store.room(m_current);
    if (!m_core || !r || r->msgs.isEmpty()) return;
    const Msg &last = r->msgs.last();
    if (last.local || last.id.isEmpty()) return;
    const bool needed = r->unread > 0 || m_lastRead != last.id;
    if (!needed) return;
    m_lastRead = last.id;
    if (Room *w = m_store.mutableRoom(m_current)) { w->unread = 0; w->highlights = 0; }
    m_rooms.refresh();
    pager_mark_read(m_core, m_current.toUtf8().constData(), last.id.toUtf8().constData());
}
void Engine::logout() { if (m_core) pager_logout(m_core); }

void Engine::openRoom(const QString &id) {
    m_current = id; m_lastRead.clear();
    m_timeline.show(id);
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
void Engine::send(const QString &text, const QString &replyTo) {
    const QString body = text.trimmed();
    if (body.isEmpty() || m_current.isEmpty()) return;
    m_store.addLocal(m_current, body, replyTo);
    m_timeline.show(m_current); m_rooms.refresh(); emit currentChanged();
    if (!m_core) return;
    if (replyTo.isEmpty()) { pager_send_text(m_core, m_current.toUtf8().constData(), body.toUtf8().constData()); return; }
    sendEvent(m_current, QStringLiteral("m.room.message"), QJsonObject{{"msgtype", "m.text"}, {"body", body}, {"m.relates_to", QJsonObject{{"m.in_reply_to", QJsonObject{{"event_id", replyTo}}}}}});
}

void Engine::sendEvent(const QString &room, const QString &type, const QJsonObject &content) {
    if (!m_core) return;
    const QByteArray json = QJsonDocument(content).toJson(QJsonDocument::Compact);
    pager_send_event(m_core, room.toUtf8().constData(), type.toUtf8().constData(), json.constData(), "");
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
    if (!m_core || !m || m->content.isEmpty() || !m_store.mediaPath(eventId).isEmpty() || m_fetching.contains(eventId)) return;
    m_fetching.insert(eventId);
    const QByteArray json = QJsonDocument(m->content).toJson(QJsonDocument::Compact);
    pager_fetch_media(m_core, eventId.toUtf8().constData(), json.constData(), m->kind == QLatin1String("image"));
}

void Engine::sendFile(const QString &path, const QString &mime, int w, int h, const QString &caption) {
    if (m_current.isEmpty()) return;
    const QString name = QFileInfo(path).fileName();
    m_store.addLocalFile(m_current, path, name, mime.startsWith(QLatin1String("image/")), w, h);
    m_timeline.show(m_current); m_rooms.refresh(); emit currentChanged();
    if (m_core) pager_send_file(m_core, m_current.toUtf8().constData(), path.toUtf8().constData(), mime.toUtf8().constData(), caption.toUtf8().constData(), w, h, "");
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
    m_store.applyRooms(rooms); m_rooms.refresh();
    openRoom(QStringLiteral("!maya"));
}
