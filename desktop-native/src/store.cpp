#include "store.h"
#include "names.h"
#include <QJsonValue>
#include <QRegularExpression>
#include <algorithm>

QString Room::preview() const {
    for (int i = msgs.size() - 1; i >= 0; --i) {
        const Msg &m = msgs[i];
        QString t = m.locked ? QStringLiteral("\U0001F512 Message waiting for its key") : m.body;
        t.replace(QLatin1Char('\n'), QLatin1Char(' '));
        if (t.trimmed().isEmpty()) continue;
        if (m.kind == QLatin1String("image")) t = QStringLiteral("\U0001F4F7 ") + (m.body.isEmpty() ? QStringLiteral("Photo") : m.body);
        else if (m.kind == QLatin1String("poll")) t = QStringLiteral("\U0001F4CA ") + t;
        else if (m.kind == QLatin1String("file")) t = QStringLiteral("\U0001F4CE ") + (m.fileName.isEmpty() ? t : m.fileName);
        return t.trimmed();
    }
    return {};
}
QString Room::nameOf(const QString &user) const { const QString n = members.value(user); return Names::pretty(n.isEmpty() ? user.mid(1).section(QLatin1Char(':'), 0, 0) : n); }
const Msg *Room::find(const QString &id) const {
    for (const Msg &m : msgs) if (m.id == id) return &m;
    return nullptr;
}

QString Store::lockedText(qint64 ts) {
    return QDateTime::currentMSecsSinceEpoch() - ts < 10 * 60000 ? QStringLiteral("Waiting for the key to read this message…") : QStringLiteral("Can't be read on this device. It was probably sent before this device was added.");
}
QString Store::s_timeFormat = QStringLiteral("system");
QString Store::clock(qint64 ms) {
    const QTime t = QDateTime::fromMSecsSinceEpoch(ms).time();
    if (s_timeFormat == QLatin1String("24")) return t.toString(QStringLiteral("HH:mm"));
    if (s_timeFormat == QLatin1String("12")) return t.toString(QStringLiteral("h:mm AP"));
    return QLocale::system().toString(t, QLocale::ShortFormat);
}
QString Store::dayLabel(qint64 ms) {
    const QDate d = QDateTime::fromMSecsSinceEpoch(ms).date(), today = QDate::currentDate();
    if (d == today) return QStringLiteral("Today");
    if (d == today.addDays(-1)) return QStringLiteral("Yesterday");
    return d.year() == today.year() ? d.toString(QStringLiteral("dddd, MMMM d")) : d.toString(QStringLiteral("MMMM d, yyyy"));
}

QStringList Store::order() const {
    QStringList ids = m_rooms.keys();
    std::sort(ids.begin(), ids.end(), [&](const QString &a, const QString &b) {
        const qint64 ta = m_rooms[a].lastTs(), tb = m_rooms[b].lastTs();
        return ta != tb ? ta > tb : m_rooms[a].name.toLower() < m_rooms[b].name.toLower();
    });
    return ids;
}

static QString stripReplyFallback(const QString &body) {
    // Older clients put the quoted message in front of a reply as "> ..." lines.
    QStringList lines = body.split(QLatin1Char('\n'));
    int i = 0;
    while (i < lines.size() && lines[i].startsWith(QLatin1String("> "))) ++i;
    if (i > 0 && i < lines.size() && lines[i].isEmpty()) ++i;
    return i > 0 ? lines.mid(i).join(QLatin1Char('\n')) : body;
}

// ---- who is "me" on other networks ----------------------------------------------------------------------------------------------------------------
static QString baseName(QString n) { n = n.trimmed().toLower(); static const QRegularExpression suffix(QStringLiteral("\\s*\\([^)]{1,12}\\)$")); return n.remove(suffix); }

void Store::setOwnIdentity(const QStringList &names, const QStringList &ids) {
    m_ownNames.clear(); m_ownIds.clear();
    for (const QString &n : names) if (n.trimmed().size() >= 2) m_ownNames.insert(n.trimmed().toLower());
    for (const QString &i : ids) m_ownIds.insert(i);
    // Messages already loaded were attributed before we knew who you are on each network: fix them now.
    for (auto it = m_rooms.begin(); it != m_rooms.end(); ++it) {
        Room &r = *it; const QSet<QString> ghosts = ownGhosts(r);
        if (ghosts.isEmpty()) continue;
        for (Msg &m : r.msgs) if (ghosts.contains(m.sender)) m.sender = m_me;
        for (const QString &g : ghosts) if (r.receipts.contains(g)) { r.receipts.insert(m_me, r.receipts.take(g)); }
    }
}
QSet<QString> Store::ownGhosts(const Room &r) const {
    QSet<QString> out;
    for (auto it = r.members.cbegin(); it != r.members.cend(); ++it) if (it.key() != m_me && (m_ownIds.contains(it.key()) || m_ownNames.contains(baseName(it.value())))) out.insert(it.key());
    for (const QString &i : m_ownIds) if (i != m_me) out.insert(i);
    return out;
}

bool Store::isBridgeBot(const QString &user) {
    static const QRegularExpression bot(QStringLiteral("^@(whatsapp|signal|gmessages|messenger|instagram|slack|twitter|bluesky|linkedin|telegram|discord|googlechat|imessage|gvoice|teams)bot:"));
    return bot.match(user).hasMatch();
}

bool Store::isBotRoom(const Room &r) const {
    QStringList others; for (const QString &u : r.joined) if (u != m_me) others << u;
    static const QRegularExpression bot(QStringLiteral("^@(?!discordbot:)[a-z]*bot:"));
    return others.size() == 1 && bot.match(others[0]).hasMatch() && (r.memberCount <= 2) && r.network == QLatin1String("matrix");
}

void Store::setTag(const QString &roomId, const QString &tag, bool on, double order) {
    Room *r = mutableRoom(roomId);
    if (!r) return;
    if (on) { if (!r->tags.contains(tag)) r->tags << tag; if (tag == QLatin1String("m.favourite")) r->pinOrder = order; }
    else r->tags.removeAll(tag);
}
void Store::markFailed(const QString &roomId, const QString &localId) {
    if (Room *r = mutableRoom(roomId)) for (Msg &m : r->msgs) if (m.id == localId) { m.status = 2; m.local = true; }
}

// ---- state, typing, receipts, tags ------------------------------------------------------------------------------------------------------------
void Store::applyState(Room &r, const QJsonObject &ev) {
    const QString type = ev.value(QLatin1String("type")).toString(), key = ev.value(QLatin1String("state_key")).toString();
    const QJsonObject c = ev.value(QLatin1String("content")).toObject();
    if (type == QLatin1String("m.room.name")) r.ownName = c.value(QLatin1String("name")).toString();
    else if (type == QLatin1String("m.room.encryption")) r.encrypted = true;
    else if (type == QLatin1String("m.room.avatar")) { const QString u = c.value(QLatin1String("url")).toString(); if (!u.isEmpty()) r.avatar = u; }
    else if (type == QLatin1String("m.bridge") || type == QLatin1String("uk.half-shot.bridge")) {
        const QString id = c.value(QLatin1String("protocol")).toObject().value(QLatin1String("id")).toString();
        QString rt = c.value(QLatin1String("com.beeper.room_type")).toString(); if (rt.isEmpty()) rt = c.value(QLatin1String("com.beeper.room_type.v2")).toString();
        if (!id.isEmpty()) { r.network = id == QLatin1String("facebook") ? QStringLiteral("messenger") : id; if (!rt.isEmpty()) r.roomType = rt; }
    } else if (type == QLatin1String("m.room.member")) {
        const bool joined = c.value(QLatin1String("membership")).toString() == QLatin1String("join");
        if (joined) {
            r.members.insert(key, c.value(QLatin1String("displayname")).toString(key.mid(1).section(QLatin1Char(':'), 0, 0)));
            const QString av = c.value(QLatin1String("avatar_url")).toString(); if (!av.isEmpty()) r.memberAvatars.insert(key, av);
            if (!r.joined.contains(key)) r.joined << key;
        } else r.joined.removeAll(key);
    }
}
void Store::applyEphemeral(Room &r, const QJsonObject &ev) {
    const QString type = ev.value(QLatin1String("type")).toString();
    const QJsonObject c = ev.value(QLatin1String("content")).toObject();
    if (type == QLatin1String("m.typing")) {
        r.typing.clear();
        for (const QJsonValue &u : c.value(QLatin1String("user_ids")).toArray()) if (u.toString() != m_me) r.typing << u.toString();
    } else if (type == QLatin1String("m.receipt")) {
        const QSet<QString> mine = ownGhosts(r);
        for (auto it = c.begin(); it != c.end(); ++it) {
            const QJsonObject readers = it.value().toObject().value(QLatin1String("m.read")).toObject();
            for (auto u = readers.begin(); u != readers.end(); ++u) {
                const QString user = mine.contains(u.key()) ? m_me : u.key();
                r.receipts.insert(user, it.key());
                const qint64 ts = u.value().toObject().value(QLatin1String("ts")).toVariant().toLongLong();
                if (ts) r.receiptTs.insert(user, ts);
            }
        }
    }
}
void Store::applyRoomAccountData(Room &r, const QJsonObject &ev) {
    const QString type = ev.value(QLatin1String("type")).toString();
    const QJsonObject c = ev.value(QLatin1String("content")).toObject();
    if (type == QLatin1String("m.tag")) {
        const QJsonObject tags = c.value(QLatin1String("tags")).toObject();
        r.tags = tags.keys();
        r.pinOrder = tags.value(QLatin1String("m.favourite")).toObject().value(QLatin1String("order")).toDouble(0);
    } else if (type == QLatin1String("m.marked_unread") || type == QLatin1String("com.famedly.marked_unread")) r.markedUnread = c.value(QLatin1String("unread")).toBool();
}

// ---- the timeline ----------------------------------------------------------------------------------------------------------------------------
static QString pollText(const QJsonObject &o) {
    QString s = o.value(QLatin1String("org.matrix.msc1767.text")).toString();
    if (s.isEmpty()) s = o.value(QLatin1String("body")).toString();
    if (s.isEmpty()) for (const QJsonValue &x : o.value(QLatin1String("m.text")).toArray()) { s = x.toObject().value(QLatin1String("body")).toString(); if (!s.isEmpty()) break; }
    return s;
}
static QString kindOf(const QString &mt, bool sticker) {
    if (sticker) return QStringLiteral("image");
    if (mt == QLatin1String("m.emote")) return QStringLiteral("emote");
    if (mt == QLatin1String("m.notice")) return QStringLiteral("notice");
    if (mt == QLatin1String("m.image")) return QStringLiteral("image");
    if (mt == QLatin1String("m.video")) return QStringLiteral("video");
    if (mt == QLatin1String("m.audio")) return QStringLiteral("audio");
    if (mt == QLatin1String("m.file")) return QStringLiteral("file");
    if (mt == QLatin1String("m.location")) return QStringLiteral("location");
    return QStringLiteral("text");
}
static bool isMedia(const QString &mt) { return mt == QLatin1String("m.image") || mt == QLatin1String("m.video") || mt == QLatin1String("m.audio") || mt == QLatin1String("m.file"); }

/// Fills a message from a Matrix room message (or sticker) event's content.
static void fillFromContent(Msg &m, const QString &mt, const QJsonObject &content, bool sticker) {
    const QJsonObject info = content.value(QLatin1String("info")).toObject();
    m.type = sticker ? QStringLiteral("m.image") : mt; m.sticker = sticker;
    m.body = content.value(QLatin1String("body")).toString();
    m.kind = kindOf(mt, sticker);
    m.mime = info.value(QLatin1String("mimetype")).toString();
    m.size = qint64(info.value(QLatin1String("size")).toDouble());
    m.width = info.value(QLatin1String("w")).toInt(); m.height = info.value(QLatin1String("h")).toInt();
    m.durationMs = qint64(info.value(QLatin1String("duration")).toDouble());
    if (!m.durationMs) m.durationMs = qint64(content.value(QLatin1String("org.matrix.msc1767.audio")).toObject().value(QLatin1String("duration")).toDouble());
    m.voice = content.contains(QLatin1String("org.matrix.msc3245.voice")) || content.value(QLatin1String("org.matrix.msc1767.audio")).toObject().contains(QLatin1String("waveform"));
    m.gifLike = info.value(QLatin1String("fi.mau.gif")).toBool() || info.value(QLatin1String("fi.mau.loop")).toBool() || info.value(QLatin1String("fi.mau.autoplay")).toBool() || info.value(QLatin1String("fi.mau.hide_controls")).toBool();
    m.geo = content.value(QLatin1String("geo_uri")).toString();
    for (const QJsonValue &u : content.value(QLatin1String("m.mentions")).toObject().value(QLatin1String("user_ids")).toArray()) m.mentions << u.toString();
    if (content.value(QLatin1String("format")).toString() == QLatin1String("org.matrix.html")) m.html = content.value(QLatin1String("formatted_body")).toString();
    if (isMedia(mt) || sticker) {
        m.content = content;
        m.fileName = content.value(QLatin1String("filename")).toString(m.body);
        // A picture, video or file with words: the file's own name is "filename" and the body is what was written (MSC2530).
        const QString fn = content.value(QLatin1String("filename")).toString();
        if (!fn.isEmpty() && !m.body.isEmpty() && m.body != fn && !sticker) { m.caption = m.body; m.captionHtml = m.html; m.html.clear(); m.body = fn; }
    }
}

void Store::applyEvent(Room &r, const QJsonObject &ev) {
    const QString type = ev.value(QLatin1String("type")).toString(), id = ev.value(QLatin1String("event_id")).toString();
    QString sender = ev.value(QLatin1String("sender")).toString();
    const qint64 ts = ev.value(QLatin1String("origin_server_ts")).toVariant().toLongLong();
    const QJsonObject content = ev.value(QLatin1String("content")).toObject();
    const QJsonObject rel = content.value(QLatin1String("m.relates_to")).toObject();

    if (ev.contains(QLatin1String("state_key"))) { applyState(r, ev); return; }
    if (!m_me.isEmpty() && !sender.isEmpty() && sender != m_me && ownGhosts(r).contains(sender)) sender = m_me;   // what you wrote on your phone

    if (type == QLatin1String("m.room.redaction")) {
        const QString target = ev.value(QLatin1String("redacts")).toString().isEmpty() ? content.value(QLatin1String("redacts")).toString() : ev.value(QLatin1String("redacts")).toString();
        for (int i = 0; i < r.msgs.size(); ++i) if (r.msgs[i].id == target) { r.msgs.removeAt(i); return; }
        if (r.reactionRefs.contains(target)) {
            const QStringList ref = r.reactionRefs.take(target);   // {target, key, sender}
            for (Msg &m : r.msgs) if (m.id == ref[0]) { m.reactions[ref[1]].removeAll(ref[2]); if (m.reactions[ref[1]].isEmpty()) m.reactions.remove(ref[1]); }
        }
        return;
    }
    if (type == QLatin1String("m.reaction")) {
        if (rel.value(QLatin1String("rel_type")).toString() != QLatin1String("m.annotation") || r.reactionRefs.contains(id)) return;
        const QString target = rel.value(QLatin1String("event_id")).toString(), key = rel.value(QLatin1String("key")).toString();
        r.reactionRefs.insert(id, {target, key, sender});
        for (Msg &m : r.msgs) if (m.id == target) { if (!m.reactions[key].contains(sender)) m.reactions[key].append(sender); return; }
        return;
    }
    if (type == QLatin1String("com.beeper.message_send_status")) {
        const QString target = rel.value(QLatin1String("event_id")).toString();
        if (target.isEmpty()) return;
        r.statusSeen = true;
        QStringList who; for (const QJsonValue &u : content.value(QLatin1String("delivered_to")).toArray()) if (u.isString()) who << u.toString();
        if (!who.isEmpty()) r.deliveredTo.insert(target, who);
        return;
    }
    if (type == QLatin1String("org.matrix.msc3381.poll.response") || type == QLatin1String("m.poll.response")) {
        const QString target = rel.value(QLatin1String("event_id")).toString();
        if (target.isEmpty() || sender.isEmpty() || r.ended.contains(target)) return;
        QJsonValue ans = content.value(QLatin1String("org.matrix.msc3381.poll.response")).toObject().value(QLatin1String("answers"));
        if (!ans.isArray()) ans = content.value(QLatin1String("m.selections"));
        QStringList chosen; for (const QJsonValue &a : ans.toArray()) if (a.isString()) chosen << a.toString();
        const QString tk = target + QLatin1Char('|') + sender;
        if (r.voteTs.value(tk, -1) > ts) return;
        r.voteTs.insert(tk, ts); r.votes[target].insert(sender, chosen);
        return;
    }
    if (type == QLatin1String("org.matrix.msc3381.poll.end") || type == QLatin1String("m.poll.end")) {
        const QString target = rel.value(QLatin1String("event_id")).toString();
        const Msg *p = r.find(target);
        if (!target.isEmpty() && (!p || p->sender == sender)) r.ended.insert(target);
        return;
    }
    const QString senderName = ev.value(QLatin1String("sender_name")).toString(r.members.contains(sender) ? r.members.value(sender) : sender.mid(1).section(QLatin1Char(':'), 0, 0));
    if (type == QLatin1String("org.matrix.msc3381.poll.start") || type == QLatin1String("m.poll.start")) {
        const QJsonObject p = content.contains(QLatin1String("org.matrix.msc3381.poll.start")) ? content.value(QLatin1String("org.matrix.msc3381.poll.start")).toObject() : content.value(QLatin1String("m.poll")).toObject();
        Msg m; m.id = id; m.sender = sender; m.ts = ts; m.kind = QStringLiteral("poll"); m.type = QStringLiteral("m.poll"); m.local = id.startsWith(QLatin1String("local-"));
        m.senderName = senderName;
        m.poll.question = pollText(p.value(QLatin1String("question")).toObject());
        for (const QJsonValue &a : p.value(QLatin1String("answers")).toArray()) { const QJsonObject o = a.toObject(); const QString at = pollText(o); if (!o.value(QLatin1String("id")).toString().isEmpty() && !at.isEmpty()) m.poll.answers.append({o.value(QLatin1String("id")).toString(), at}); }
        m.poll.maxSelections = p.value(QLatin1String("max_selections")).toInt(1);
        m.poll.disclosed = !p.value(QLatin1String("kind")).toString().endsWith(QLatin1String("undisclosed"));
        if (m.poll.question.isEmpty() || m.poll.answers.size() < 2) return;
        m.body = m.poll.question;
        for (const Msg &x : r.msgs) if (x.id == id) return;
        if (!m_me.isEmpty() && sender == m_me)
            for (int i = 0; i < r.msgs.size(); ++i) if (r.msgs[i].local && r.msgs[i].kind == QLatin1String("poll") && r.msgs[i].body == m.body) { r.msgs.removeAt(i); break; }
        r.msgs.append(m);
        return;
    }
    const bool sticker = type == QLatin1String("m.sticker");
    const bool encrypted = type == QLatin1String("m.room.encrypted") || ev.value(QLatin1String("locked")).toBool();
    if (type != QLatin1String("m.room.message") && !encrypted && !sticker) return;

    if (!encrypted && !sticker && rel.value(QLatin1String("rel_type")).toString() == QLatin1String("m.replace")) {
        const QString target = rel.value(QLatin1String("event_id")).toString();
        const QJsonObject nc = content.value(QLatin1String("m.new_content")).toObject();
        for (Msg &m : r.msgs) if (m.id == target && m.sender == sender) {
            m.body = nc.value(QLatin1String("body")).toString(m.body); m.edited = true;
            if (nc.value(QLatin1String("format")).toString() == QLatin1String("org.matrix.html")) m.html = nc.value(QLatin1String("formatted_body")).toString(); else m.html.clear();
            // Some bridges send a picture or file as an edit of an earlier message: take its media too.
            if (nc.contains(QLatin1String("url")) || nc.contains(QLatin1String("file"))) { const QString mt = nc.value(QLatin1String("msgtype")).toString(m.type); Msg tmp; fillFromContent(tmp, mt, nc, false); const bool keepEdited = m.edited; const qint64 ots = m.ts; const QString oid = m.id, osender = m.sender, oname = m.senderName; const auto oreact = m.reactions; m = tmp; m.id = oid; m.sender = osender; m.senderName = oname; m.ts = ots; m.reactions = oreact; m.edited = keepEdited && false; }
            return;
        }
        return;
    }
    for (int i = 0; i < r.msgs.size(); ++i) if (r.msgs[i].id == id) {        // already have it (history and live overlap)
        if (r.msgs[i].locked && !encrypted) { r.msgs.removeAt(i); break; }   // ...unless we could not read it before and now can
        if (r.msgs[i].content.isEmpty() && !content.value(QLatin1String("url")).toString().isEmpty()) { Msg fresh; fillFromContent(fresh, content.value(QLatin1String("msgtype")).toString(), content, sticker); r.msgs[i].content = fresh.content; r.msgs[i].mime = fresh.mime; }
        return;
    }

    Msg m;
    m.id = id; m.sender = sender; m.ts = ts; m.senderName = senderName;
    m.replyTo = rel.value(QLatin1String("m.in_reply_to")).toObject().value(QLatin1String("event_id")).toString();
    m.txn = ev.value(QLatin1String("unsigned")).toObject().value(QLatin1String("transaction_id")).toString();
    if (encrypted) { m.locked = true; m.kind = QStringLiteral("locked"); m.type = QStringLiteral("m.text"); m.body = QStringLiteral("Waiting for the key to read this message…"); }
    else {
        fillFromContent(m, content.value(QLatin1String("msgtype")).toString(), content, sticker);
        if (!m.replyTo.isEmpty()) m.body = stripReplyFallback(m.body);
        m.attention = content.value(QLatin1String("app.pager.attention")).toObject().value(QLatin1String("kind")).toString();
    }
    // The echo of a message we just sent replaces the one we showed straight away.
    if (!m_me.isEmpty() && sender == m_me)
        for (int i = 0; i < r.msgs.size(); ++i) if (r.msgs[i].local && ((!m.txn.isEmpty() && r.msgs[i].txn == m.txn) || r.msgs[i].body == m.body)) { r.msgs.removeAt(i); break; }
    r.msgs.append(m);
}

static void sortMsgs(Room &r) { std::stable_sort(r.msgs.begin(), r.msgs.end(), [](const Msg &a, const Msg &b) { return a.ts < b.ts; }); }

QStringList Store::applyRooms(const QJsonArray &rooms) {
    QStringList changed;
    for (const QJsonValue &v : rooms) {
        const QJsonObject o = v.toObject();
        const QString id = o.value(QLatin1String("id")).toString();
        if (id.isEmpty()) continue;
        Room &r = m_rooms[id];
        r.id = id;
        const bool initial = !r.initialDone; r.initialDone = true;
        const QString prev = o.value(QLatin1String("prev_batch")).toString();
        if (!initial && o.value(QLatin1String("limited")).toBool() && !r.msgs.isEmpty()) {   // a gap: what we had no longer joins up, start again from here
            r.msgs.clear(); r.historyToken = prev; r.reachedStart = false; r.historyAsked = false;
        }
        r.name = o.value(QLatin1String("name")).toString(r.name);
        r.ownName = o.value(QLatin1String("own_name")).toString(r.ownName);
        r.direct = o.value(QLatin1String("direct")).toBool(r.direct);
        r.encrypted = o.value(QLatin1String("encrypted")).toBool(r.encrypted) || r.encrypted;
        r.unread = o.value(QLatin1String("unread")).toInt(r.unread);
        r.highlights = o.value(QLatin1String("highlights")).toInt(r.highlights);
        r.avatar = o.value(QLatin1String("avatar")).toString(r.avatar);
        if (o.contains(QLatin1String("heroes"))) { r.heroes.clear(); for (const QJsonValue &h : o.value(QLatin1String("heroes")).toArray()) r.heroes << h.toString(); }
        if (o.contains(QLatin1String("member_count"))) r.memberCount = o.value(QLatin1String("member_count")).toInt(r.memberCount);
        if (r.historyToken.isEmpty() && !r.reachedStart) r.historyToken = prev;
        for (const QJsonValue &e : o.value(QLatin1String("state")).toArray()) applyState(r, e.toObject());
        for (const QJsonValue &e : o.value(QLatin1String("events")).toArray()) applyEvent(r, e.toObject());
        for (const QJsonValue &e : o.value(QLatin1String("ephemeral")).toArray()) applyEphemeral(r, e.toObject());
        for (const QJsonValue &e : o.value(QLatin1String("account_data")).toArray()) applyRoomAccountData(r, e.toObject());
        sortMsgs(r);
        changed << id;
    }
    return changed;
}

QString Store::applyHistory(const QJsonObject &page) {
    const QString id = page.value(QLatin1String("room")).toString();
    Room *r = mutableRoom(id);
    if (!r) return {};
    for (const QJsonValue &e : page.value(QLatin1String("events")).toArray()) applyEvent(*r, e.toObject());
    sortMsgs(*r);
    const QString end = page.value(QLatin1String("end")).toString();
    r->historyToken = end; r->reachedStart = end.isEmpty(); r->historyAsked = true;
    return id;
}

QString Store::addLocal(const QString &roomId, const QString &body, const QString &replyTo, const QString &html) {
    Room *r = mutableRoom(roomId);
    if (!r) return {};
    Msg m; m.id = QStringLiteral("local-%1").arg(++m_localCounter); m.sender = m_me; m.senderName = QStringLiteral("You"); m.body = body; m.kind = QStringLiteral("text");
    m.ts = QDateTime::currentMSecsSinceEpoch(); m.local = true; m.replyTo = replyTo; m.html = html; m.status = 1; m.type = QStringLiteral("m.text");
    r->msgs.append(m);
    return m.id;
}

void Store::applyLocalEvent(const QString &roomId, const QJsonObject &event) {
    Room *r = mutableRoom(roomId);
    if (!r) return;
    applyEvent(*r, event);
    sortMsgs(*r);
}

QString Store::reactionIdOf(const QString &roomId, const QString &target, const QString &key, const QString &who) const {
    const Room *r = room(roomId);
    if (!r) return {};
    for (auto it = r->reactionRefs.cbegin(); it != r->reactionRefs.cend(); ++it)
        if (it.value().size() == 3 && it.value()[0] == target && it.value()[1] == key && it.value()[2] == who) return it.key();
    return {};
}

QString Store::addLocalFile(const QString &roomId, const QString &path, const QString &name, bool image, int w, int h) {
    Room *r = mutableRoom(roomId);
    if (!r) return {};
    Msg m; m.id = QStringLiteral("local-%1").arg(++m_localCounter); m.sender = m_me; m.senderName = QStringLiteral("You"); m.body = name; m.fileName = name;
    m.kind = image ? QStringLiteral("image") : QStringLiteral("file"); m.width = w; m.height = h;
    m.ts = QDateTime::currentMSecsSinceEpoch(); m.local = true; m.status = 1;
    m_media.insert(m.id, path);
    r->msgs.append(m);
    return m.id;
}

void Store::removeMessage(const QString &roomId, const QString &id) {
    if (Room *r = mutableRoom(roomId)) for (int i = 0; i < r->msgs.size(); ++i) if (r->msgs[i].id == id) { r->msgs.removeAt(i); return; }
}

int Store::trimRoom(const QString &id, int keep) {
    Room *r = mutableRoom(id);
    if (!r || r->msgs.size() <= keep) return 0;
    const int drop = r->msgs.size() - keep;
    QSet<QString> gone; for (int i = 0; i < drop; ++i) gone.insert(r->msgs[i].id);
    r->msgs.remove(0, drop);
    for (auto it = r->reactionRefs.begin(); it != r->reactionRefs.end();) { if (gone.contains(it.value().value(0))) it = r->reactionRefs.erase(it); else ++it; }
    for (const QString &g : gone) { r->votes.remove(g); r->deliveredTo.remove(g); r->ended.remove(g); m_media.remove(g); m_media.remove(QStringLiteral("poster:") + g); m_media.remove(QStringLiteral("full:") + g); }
    r->historyToken.clear(); r->reachedStart = false; r->historyAsked = false;     // the way back to what was dropped is asked for again
    return drop;
}
