#include "store.h"
#include <QJsonValue>
#include <algorithm>

QString Room::preview() const {
    for (int i = msgs.size() - 1; i >= 0; --i) {
        const Msg &m = msgs[i];
        QString t = m.locked ? QStringLiteral("\U0001F512 Message waiting for its key") : m.body;
        t.replace(QLatin1Char('\n'), QLatin1Char(' '));
        if (t.trimmed().isEmpty()) continue;
        if (m.kind == QLatin1String("image")) t = QStringLiteral("\U0001F4F7 ") + (m.body.isEmpty() ? QStringLiteral("Photo") : m.body);
        return t.trimmed();
    }
    return {};
}
const Msg *Room::find(const QString &id) const {
    for (const Msg &m : msgs) if (m.id == id) return &m;
    return nullptr;
}

QString Store::clock(qint64 ms) { return QDateTime::fromMSecsSinceEpoch(ms).time().toString(QStringLiteral("h:mm AP")); }
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

void Store::applyEvent(Room &r, const QJsonObject &ev) {
    const QString type = ev.value(QLatin1String("type")).toString(), id = ev.value(QLatin1String("event_id")).toString();
    const QString sender = ev.value(QLatin1String("sender")).toString();
    const qint64 ts = ev.value(QLatin1String("origin_server_ts")).toVariant().toLongLong();
    const QJsonObject content = ev.value(QLatin1String("content")).toObject();
    const QJsonObject rel = content.value(QLatin1String("m.relates_to")).toObject();

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
    const bool encrypted = type == QLatin1String("m.room.encrypted") || ev.value(QLatin1String("locked")).toBool();
    if (type != QLatin1String("m.room.message") && !encrypted) return;

    if (!encrypted && rel.value(QLatin1String("rel_type")).toString() == QLatin1String("m.replace")) {
        const QString target = rel.value(QLatin1String("event_id")).toString();
        const QJsonObject nc = content.value(QLatin1String("m.new_content")).toObject();
        for (Msg &m : r.msgs) if (m.id == target && m.sender == sender) { m.body = nc.value(QLatin1String("body")).toString(m.body); m.edited = true; return; }
        return;
    }
    for (int i = 0; i < r.msgs.size(); ++i) if (r.msgs[i].id == id) {        // already have it (history and live overlap)
        if (r.msgs[i].locked && !encrypted) { r.msgs.removeAt(i); break; }   // ...unless we could not read it before and now can
        return;
    }

    Msg m;
    m.id = id; m.sender = sender; m.ts = ts;
    m.senderName = ev.value(QLatin1String("sender_name")).toString(sender.mid(1).section(QLatin1Char(':'), 0, 0));
    m.replyTo = rel.value(QLatin1String("m.in_reply_to")).toObject().value(QLatin1String("event_id")).toString();
    if (encrypted) { m.locked = true; m.kind = QStringLiteral("locked"); m.body = QStringLiteral("Waiting for the key to read this message…"); }
    else {
        const QString mt = content.value(QLatin1String("msgtype")).toString();
        m.body = content.value(QLatin1String("body")).toString();
        if (!m.replyTo.isEmpty()) m.body = stripReplyFallback(m.body);
        m.kind = mt == QLatin1String("m.emote") ? QStringLiteral("emote") : mt == QLatin1String("m.notice") ? QStringLiteral("notice")
               : mt == QLatin1String("m.image") ? QStringLiteral("image") : (mt == QLatin1String("m.file") || mt == QLatin1String("m.video") || mt == QLatin1String("m.audio")) ? QStringLiteral("file")
               : mt == QLatin1String("m.location") ? QStringLiteral("location") : QStringLiteral("text");
    }
    // The echo of a message we just sent replaces the one we showed straight away.
    if (!m_me.isEmpty() && sender == m_me)
        for (int i = 0; i < r.msgs.size(); ++i) if (r.msgs[i].local && r.msgs[i].body == m.body) { r.msgs.removeAt(i); break; }
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
        r.name = o.value(QLatin1String("name")).toString(r.name);
        r.direct = o.value(QLatin1String("direct")).toBool(r.direct);
        r.encrypted = o.value(QLatin1String("encrypted")).toBool(r.encrypted);
        r.unread = o.value(QLatin1String("unread")).toInt(r.unread);
        r.highlights = o.value(QLatin1String("highlights")).toInt(r.highlights);
        r.avatar = o.value(QLatin1String("avatar")).toString(r.avatar);
        if (r.historyToken.isEmpty() && !r.reachedStart) r.historyToken = o.value(QLatin1String("prev_batch")).toString();
        for (const QJsonValue &e : o.value(QLatin1String("events")).toArray()) applyEvent(r, e.toObject());
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

void Store::addLocal(const QString &roomId, const QString &body) {
    Room *r = mutableRoom(roomId);
    if (!r) return;
    Msg m; m.id = QStringLiteral("local-%1").arg(++m_localCounter); m.sender = m_me; m.senderName = QStringLiteral("You"); m.body = body; m.kind = QStringLiteral("text");
    m.ts = QDateTime::currentMSecsSinceEpoch(); m.local = true;
    r->msgs.append(m);
}
