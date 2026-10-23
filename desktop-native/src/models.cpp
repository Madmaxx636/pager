#include "models.h"
#include <QDateTime>
#include <QRegularExpression>

#include <QVariantMap>
#include <algorithm>
#include "rich.h"
#include "names.h"

// ---- keeping a list in step with what changed ---------------------------------------------------------------------------------------------------
void DiffModel::applyIds(const QStringList &next) {
    if (m_ids == next) return;
    const QSet<QString> keep(next.cbegin(), next.cend());
    for (int i = m_ids.size() - 1; i >= 0; --i) if (!keep.contains(m_ids[i])) { beginRemoveRows({}, i, i); m_ids.removeAt(i); rowRemoved(i); endRemoveRows(); }
    for (int i = 0; i < next.size(); ++i) {
        if (i < m_ids.size() && m_ids[i] == next[i]) continue;
        const int at = i < m_ids.size() ? m_ids.indexOf(next[i], i + 1) : -1;
        if (at > i) { beginMoveRows({}, at, at, {}, i); m_ids.move(at, i); rowMoved(at, i); endMoveRows(); }
        else { beginInsertRows({}, i, i); m_ids.insert(i, next[i]); rowInserted(i, next[i]); endInsertRows(); }
    }
}

// ---- the list of chats --------------------------------------------------------------------------------------------------------------------------
QHash<int, QByteArray> RoomListModel::roleNames() const {
    return {{IdRole, "roomId"}, {NameRole, "name"}, {PreviewRole, "preview"}, {TimeRole, "time"}, {UnreadRole, "unread"}, {DirectRole, "direct"}, {EncryptedRole, "encrypted"}, {LetterRole, "letter"},
            {AvatarRole, "avatar"}, {NetworkRole, "network"}, {PinnedRole, "pinned"}, {ArchivedRole, "archived"}, {LowRole, "lowPriority"}, {MutedRole, "muted"}, {MarkedUnreadRole, "markedUnread"},
            {TypingRole, "typing"}, {GroupRole, "isGroup"}, {MentionRole, "mention"}, {LabelsRole, "labels"}, {TickRole, "tick"}, {LinkedRole, "linked"}};
}

QHash<QString, QString> RoomListModel::s_aliases;
QString RoomListModel::displayName(const Room &r) {
    if (const QString a = s_aliases.value(r.id); !a.isEmpty()) return a;
    static const QRegularExpression empty(QStringLiteral("^Empty Room( \\(was .*\\))?$"));
    if (Store::isStoriesRoom(r)) return QStringLiteral("Stories");
    if (!r.name.trimmed().isEmpty() && r.name != r.id && !empty.match(r.name).hasMatch()) return Names::pretty(r.name);
    for (const QString &h : r.heroes) return r.nameOf(h);
    for (const QString &u : r.joined) if (u != QString() && !Store::isBridgeBot(u)) { /* someone else in it */ }
    return QStringLiteral("Unnamed chat");
}

static QString previewOf(const Room &r, const QString &me) {
    for (int i = r.msgs.size() - 1; i >= 0; --i) {
        const Msg &m = r.msgs[i];
        QString t;
        if (m.locked) t = QStringLiteral("\U0001F512 ") + Store::lockedText(m.ts);
        else if (m.kind == QLatin1String("image")) t = m.sticker ? QStringLiteral("Sticker") : (m.mime == QLatin1String("image/gif") ? QStringLiteral("GIF") : QStringLiteral("Photo"));
        else if (m.kind == QLatin1String("video")) t = QStringLiteral("Video");
        else if (m.kind == QLatin1String("audio")) t = m.voice ? QStringLiteral("Voice message") : m.body;
        else if (m.kind == QLatin1String("location")) t = QStringLiteral("Location");
        else if (m.kind == QLatin1String("poll")) t = QStringLiteral("Poll: ") + m.poll.question;
        else if (m.kind == QLatin1String("emote")) t = QStringLiteral("* ") + m.body;
        else t = m.body;
        if (!m.caption.isEmpty() && !m.voice && !m.locked && m.kind != QLatin1String("poll")) t += QStringLiteral(": ") + m.caption;
        t.replace(QLatin1Char('\n'), QLatin1Char(' '));
        t = t.trimmed();
        if (t.isEmpty()) continue;
        if (m.sender == me && !r.isGroup()) return QStringLiteral("You: ") + t;
        if (r.isGroup() && m.sender != me) return r.nameOf(m.sender).section(QLatin1Char(' '), 0, 0) + QStringLiteral(": ") + t;
        if (m.sender == me) return QStringLiteral("You: ") + t;
        return t;
    }
    return {};
}

static QString timeLabel(qint64 ts) {
    if (!ts) return {};
    const QDateTime d = QDateTime::fromMSecsSinceEpoch(ts);
    if (d.date() == QDate::currentDate()) return Store::clock(ts);
    if (d.date() == QDate::currentDate().addDays(-1)) return QStringLiteral("Yesterday");
    if (d.date().daysTo(QDate::currentDate()) < 7) return d.date().toString(QStringLiteral("dddd"));
    return d.date().toString(d.date().year() == QDate::currentDate().year() ? QStringLiteral("MMM d") : QStringLiteral("M/d/yy"));
}



QString RoomListModel::signature(const QString &id) const {
    const Room *r = m_store->room(id);
    if (!r) return {};
    const Store::LinkAgg a = m_store->linkAgg(*r);
    QString s = displayName(*r) + QLatin1Char('\x1f') + previewOf(*r, m_store->me()) + QLatin1Char('\x1f') + QString::number(r->lastTs()) + QLatin1Char('\x1f') + QString::number(a.unread) + QLatin1Char('\x1f')
        + (a.marked ? '1' : '0') + (a.pinned ? '1' : '0') + (a.archived ? '1' : '0') + (r->lowPriority() ? '1' : '0') + (a.muted ? '1' : '0') + (r->encrypted ? '1' : '0') + (r->isGroup() ? '1' : '0')
        + QLatin1Char('\x1f') + r->network + QLatin1Char('\x1f') + m_store->mediaPath(QStringLiteral("av:") + r->avatar) + QLatin1Char('\x1f') + r->typing.join(QLatin1Char(',')) + QLatin1Char('\x1f') + r->labels().join(QLatin1Char(','))
        + QLatin1Char('\x1f') + QString::number(r->highlights) + QLatin1Char('\x1f') + a.ids.join(QLatin1Char(','));
    return s;
}

int RoomListModel::unreadChats() const {
    int n = 0;
    for (auto it = m_store->roomsBegin(); it != m_store->roomsEnd(); ++it) { const Room &r = *it; if (m_store->isBotRoom(r)) continue; const Store::LinkAgg a = m_store->linkAgg(r); if (a.top == &r && !a.archived && !a.muted && !r.lowPriority() && (a.unread > 0 || a.marked)) ++n; }
    return n;
}

void RoomListModel::setFilter(const QString &tab, const QString &search) { m_tab = tab; m_search = search.trimmed(); refresh(); }

void RoomListModel::refresh() {
    const QString q = m_search.toLower();
    QVector<const Room *> keep; QHash<QString, Store::LinkAgg> aggs;
    for (auto it = m_store->roomsBegin(); it != m_store->roomsEnd(); ++it) {
        const Room &r = *it;
        if (m_store->isBotRoom(r) || m_hidden.contains(r.network) || Store::isStoriesRoom(r)) continue;
        const Store::LinkAgg ag = m_store->linkAgg(r);
        if (ag.top != &r) continue;                                   // shown as part of another chat of the same person
        const bool unread = ag.unread > 0 || ag.marked;
        if (m_tab == QLatin1String("archive")) { if (!ag.archived) continue; }
        else if (ag.archived) { if (q.isEmpty()) continue; }
        else if (m_tab == QLatin1String("unread")) { if (!unread) continue; }
        else if (m_tab == QLatin1String("low")) { if (!r.lowPriority()) continue; }
        else if (m_tab.startsWith(QLatin1String("label:"))) { if (!r.labels().contains(m_tab.mid(6))) continue; }
        else if (m_tab == QLatin1String("inbox")) { if (r.lowPriority() && q.isEmpty()) continue; }
        if (m_filters.value("groups").toBool() && !r.isGroup()) continue;
        if (m_filters.value("dms").toBool() && r.isGroup()) continue;
        if (m_filters.value("drafts").toBool() && !m_drafts.contains(r.id)) continue;
        if (m_filters.value("unanswered").toBool() && (r.msgs.isEmpty() || r.msgs.last().sender == m_store->me())) continue;
        if (!m_filters.value("network").toString().isEmpty() && r.network != m_filters.value("network").toString()) continue;
        if (m_excludePinned && ag.pinned && !ag.archived && !r.lowPriority()) continue;
        if (!q.isEmpty()) {
            bool hit = displayName(r).toLower().contains(q);
            if (!hit) for (int i = r.msgs.size() - 1; i >= 0 && i >= r.msgs.size() - 40 && !hit; --i) hit = r.msgs[i].body.toLower().contains(q) || r.msgs[i].caption.toLower().contains(q);
            if (!hit) continue;
        }
        keep.append(&r); aggs.insert(r.id, ag);
    }
    QStringList ids;
    const bool pinsFirst = q.isEmpty() && (m_tab == QLatin1String("inbox") || m_tab == QLatin1String("unread"));
    std::sort(keep.begin(), keep.end(), [&](const Room *a, const Room *b) {
        const Store::LinkAgg &x = aggs[a->id], &y = aggs[b->id];
        if (pinsFirst && x.pinned != y.pinned) return x.pinned;
        if (pinsFirst && x.pinned && y.pinned && a->pinOrder != b->pinOrder) return a->pinOrder < b->pinOrder;
        const bool ux = x.unread > 0 || x.marked, uy = y.unread > 0 || y.marked;
        if (m_unreadFirst && pinsFirst && ux != uy) return ux;
        const qint64 ta = a->lastTs(), tb = b->lastTs();
        return ta != tb ? ta > tb : a->id < b->id;
    });
    for (const Room *r : keep) ids << r->id;
    applyIds(ids);
    for (int i = 0; i < m_ids.size(); ++i) {
        const QString s = signature(m_ids[i]);
        if (m_sig[i] != s) { m_sig[i] = s; emit dataChanged(index(i), index(i)); }
    }
}

QVariant RoomListModel::data(const QModelIndex &i, int role) const {
    if (!i.isValid() || i.row() >= m_ids.size()) return {};
    const Room *r = m_store->room(m_ids[i.row()]);
    if (!r) return {};
    switch (role) {
    case IdRole: return r->id;
    case NameRole: return displayName(*r);
    case PreviewRole: return previewOf(*r, m_store->me());
    case TimeRole: return timeLabel(r->lastTs());
    case UnreadRole: return m_store->linkAgg(*r).unread;
    case DirectRole: return r->direct;
    case EncryptedRole: return r->encrypted;
    case LetterRole: { const QString n = displayName(*r).trimmed(); return n.isEmpty() ? QStringLiteral("#") : n.left(1).toUpper(); }
    case AvatarRole: {
        if (r->avatar.isEmpty()) return QString();
        const QString p = m_store->mediaPath(QStringLiteral("av:") + r->avatar);
        if (p.isEmpty()) m_store->wantAvatar(r->avatar);
        return p;
    }
    case NetworkRole: return r->network;
    case PinnedRole: return m_store->linkAgg(*r).pinned;
    case ArchivedRole: return m_store->linkAgg(*r).archived;
    case LowRole: return r->lowPriority();
    case MutedRole: return m_store->linkAgg(*r).muted;
    case MarkedUnreadRole: return m_store->linkAgg(*r).marked;
    case LinkedRole: { QVariantList out; for (const QString &id : m_store->linkAgg(*r).ids) if (const Room *x = m_store->room(id)) out << QVariantMap{{"id", id}, {"network", x->network}}; return out; }
    case TypingRole: {
        if (r->typing.isEmpty()) return QString();
        QStringList names; for (const QString &u : r->typing) names << r->nameOf(u).section(QLatin1Char(' '), 0, 0);
        return r->isGroup() ? names.join(QStringLiteral(", ")) + QStringLiteral(" typing…") : QStringLiteral("typing…");
    }
    case GroupRole: return r->isGroup();
    case MentionRole: return r->highlights > 0;
    case LabelsRole: return r->labels();
    case TickRole: {
        if (r->msgs.isEmpty() || r->msgs.last().sender != m_store->me()) return 0;
        const Msg &m = r->msgs.last();
        if (m.status == 1 || m.local) return 1;
        if (m.status == 2) return 2;
        int readPos, deliveredPos; m_store->receiptPositions(*r, readPos, deliveredPos);
        const int last = r->msgs.size() - 1;
        return readPos >= last ? 5 : deliveredPos >= last ? 4 : 3;
    }
    }
    return {};
}

// ---- the open chat ------------------------------------------------------------------------------------------------------------------------------
QHash<int, QByteArray> TimelineModel::roleNames() const {
    return {{IdRole, "eventId"}, {SenderRole, "sender"}, {SenderNameRole, "senderName"}, {BodyRole, "body"}, {KindRole, "kind"}, {TimeRole, "time"}, {MineRole, "mine"}, {LockedRole, "locked"},
            {LocalRole, "local"}, {FirstRole, "first"}, {LastRole, "last"}, {ReactionsRole, "reactions"}, {DayRole, "day"}, {EditedRole, "edited"}, {ReplyRole, "replyTo"}, {MediaRole, "media"},
            {WidthRole, "imgWidth"}, {HeightRole, "imgHeight"}, {FileNameRole, "fileName"}, {PollRole, "poll"}, {HtmlRole, "html"}, {CaptionRole, "caption"}, {CaptionHtmlRole, "captionHtml"}, {MimeRole, "mime"},
            {SizeRole, "size"}, {DurationRole, "durationMs"}, {VoiceRole, "voice"}, {StickerRole, "sticker"}, {GifRole, "gifLike"}, {GeoRole, "geo"}, {TickRole, "tick"}, {SenderAvatarRole, "senderAvatar"},
            {ReplyNameRole, "replyName"}, {ReplyTextRole, "replyText"}, {DividerRole, "unreadDivider"}, {MentionedRole, "mentioned"}, {BigEmojiRole, "bigEmoji"}, {FullTimeRole, "fullTime"}, {StatusRole, "status"},
            {PosterRole, "poster"}, {FreshRole, "fresh"}};
}

TimelineModel::Row TimelineModel::build(const Room &r, int si, int readPos, int deliveredPos, bool group) const {
    Row row; const Msg &m = r.msgs[si]; row.msg = m;
    const Msg *older = si > 0 ? &r.msgs[si - 1] : nullptr, *newer = si + 1 < r.msgs.size() ? &r.msgs[si + 1] : nullptr;
    const qint64 gap = m_gapMs;
    auto sameDay = [](qint64 a, qint64 b) { return QDateTime::fromMSecsSinceEpoch(a).date() == QDateTime::fromMSecsSinceEpoch(b).date(); };
    const bool sameRunOlder = older && older->sender == m.sender && m.ts - older->ts < gap && sameDay(older->ts, m.ts) && older->id != m_unreadBefore + QString() && m.id != m_unreadBefore;
    const bool sameRunNewer = newer && newer->sender == m.sender && newer->ts - m.ts < gap && sameDay(newer->ts, m.ts) && newer->id != m_unreadBefore;
    row.first = !sameRunOlder; row.last = !sameRunNewer;
    row.day = (!older || !sameDay(older->ts, m.ts)) ? Store::dayLabel(m.ts) : QString();
    if (!m.replyTo.isEmpty()) {
        if (const Msg *p = r.find(m.replyTo)) { row.replyName = p->sender == m_store->me() ? QStringLiteral("You") : r.nameOf(p->sender); row.replyText = p->kind == QLatin1String("image") ? QStringLiteral("Photo") : p->body; }
    }
    const QString me = m_store->me();
    if (m.sender == me) {
        row.tick = m.status == 2 ? 2 : (m.status == 1 || m.local) ? 1 : si <= readPos ? 5 : si <= deliveredPos ? 4 : 3;
    }
    row.mentioned = m.sender != me && (m.mentions.contains(me) || (!me.isEmpty() && m.body.toLower().contains(QLatin1Char('@') + r.nameOf(me).toLower())));
    row.big = m_bigEmojiOn && m.kind == QLatin1String("text") && m.html.isEmpty() && Rich::emojiOnly(m.body);
    Q_UNUSED(group)
    QString s;
    s.reserve(160);
    s += m.id; s += QLatin1Char('\x1f'); s += m.body; s += QLatin1Char('\x1f'); s += m.html; s += QLatin1Char('\x1f'); s += m.caption; s += QLatin1Char('\x1f'); s += m.kind;
    s += m.locked ? '1' : '0'; s += m.local ? '1' : '0'; s += m.edited ? '1' : '0'; s += row.first ? '1' : '0'; s += row.last ? '1' : '0'; s += row.mentioned ? '1' : '0'; s += row.big ? '1' : '0';
    s += QLatin1Char('\x1f'); s += row.day; s += QLatin1Char('\x1f'); s += QString::number(row.tick); s += QString::number(m.status);
    s += QLatin1Char('\x1f'); s += row.replyName + row.replyText; s += QLatin1Char('\x1f');
    for (auto it = m.reactions.cbegin(); it != m.reactions.cend(); ++it) { s += it.key(); s += QString::number(it.value().size()); s += it.value().contains(me) ? '*' : ' '; }
    s += QLatin1Char('\x1f'); s += m_store->mediaPath(m.id); s += m_store->mediaPath(QStringLiteral("poster:") + m.id);
    s += QLatin1Char('\x1f'); s += QString::number(m.height) + QLatin1Char('x') + QString::number(m.width);
    if (m.kind == QLatin1String("poll")) {
        s += QLatin1Char('\x1f'); s += r.ended.contains(m.id) ? '1' : '0';
        const auto votes = r.votes.value(m.id);
        QStringList vs; for (auto v = votes.cbegin(); v != votes.cend(); ++v) vs << v.key() + QLatin1Char('=') + v.value().join(QLatin1Char('+'));
        vs.sort(); s += vs.join(QLatin1Char(';'));
    }
    if (group && m.sender != me) { const QString av = r.memberAvatars.value(m.sender); s += QLatin1Char('\x1f'); s += m_store->mediaPath(QStringLiteral("av:") + av); }
    row.sig = s;
    return row;
}

void TimelineModel::show(const QString &roomId) {
    const bool sameRoom = roomId == m_room;
    if (!sameRoom) {
        beginResetModel(); m_room = roomId; m_ids.clear(); m_rows.clear(); endResetModel();
        if (roomId.isEmpty()) return;
    }
    const Room *r = m_store->view(roomId, m_merged, true);
    if (!r) { if (!m_ids.isEmpty()) { beginResetModel(); m_ids.clear(); m_rows.clear(); endResetModel(); } return; }
    const int n = r->msgs.size();
    int readPos = -1, deliveredPos = -1; m_store->receiptPositions(*r, readPos, deliveredPos);      // how far the others have read, how far the bridge says it was delivered
    const bool group = r->isGroup();
    QStringList ids; QVector<Row> fresh; ids.reserve(n); fresh.reserve(n);
    for (int si = n - 1; si >= 0; --si) { ids << r->msgs[si].id; fresh << build(*r, si, readPos, deliveredPos, group); }
    // duplicate ids would break the diff: keep the first of each
    { QSet<QString> seen; QStringList u; QVector<Row> f; for (int i = 0; i < ids.size(); ++i) if (!seen.contains(ids[i])) { seen.insert(ids[i]); u << ids[i]; f << fresh[i]; } ids = u; fresh = f; }
    applyIds(ids);
    for (int i = 0; i < m_ids.size(); ++i) {
        if (m_rows[i].sig != fresh[i].sig) { m_rows[i] = fresh[i]; emit dataChanged(index(i), index(i)); }
    }
}

void TimelineModel::touch(const QString &eventId) { show(m_room); Q_UNUSED(eventId) }

QVariant TimelineModel::data(const QModelIndex &i, int role) const {
    if (!i.isValid() || i.row() >= m_rows.size()) return {};
    const Row &row = m_rows[i.row()]; const Msg &m = row.msg;
    switch (role) {
    case IdRole: return m.id;
    case FreshRole: return QDateTime::currentMSecsSinceEpoch() - m.ts < 5000;     // arrived just now: gets the entrance animation
    case SenderRole: return m.sender;
    case SenderNameRole: return Names::pretty(m.senderName);
    case BodyRole: if (m.locked) return Store::lockedText(m.ts);
        return m.kind == QLatin1String("emote") ? QStringLiteral("* %1 %2").arg(m.senderName, m.body) : m.body;
    case KindRole: return m.kind;
    case TimeRole: return Store::clock(m.ts);
    case FullTimeRole: return QDateTime::fromMSecsSinceEpoch(m.ts).toString(QStringLiteral("ddd, MMM d, h:mm:ss AP"));
    case MineRole: return m_store->mine(m);
    case LockedRole: return m.locked;
    case LocalRole: return m.local;
    case StatusRole: return m.status;
    case FirstRole: return row.first;
    case LastRole: return row.last;
    case DayRole: return row.day;
    case EditedRole: return m.edited;
    case ReplyRole: return m.replyTo;
    case ReplyNameRole: return row.replyName;
    case ReplyTextRole: return row.replyText;
    case TickRole: return row.tick;
    case DividerRole: return !m_unreadBefore.isEmpty() && m.id == m_unreadBefore;
    case MentionedRole: return row.mentioned;
    case BigEmojiRole: return row.big;
    case MediaRole: return m_store->mediaPath(m.id);
    case PosterRole: return m_store->mediaPath(QStringLiteral("poster:") + m.id);
    case WidthRole: return m.width;
    case HeightRole: return m.height;
    case FileNameRole: return m.fileName;
    case HtmlRole: return m.html;
    case CaptionRole: return m.caption;
    case CaptionHtmlRole: return m.captionHtml;
    case MimeRole: return m.mime;
    case SizeRole: return m.size;
    case DurationRole: return m.durationMs;
    case VoiceRole: return m.voice;
    case StickerRole: return m.sticker;
    case GifRole: return m.gifLike || m.mime == QLatin1String("image/gif");
    case GeoRole: return m.geo;
    case SenderAvatarRole: {
        const Room *r = m_store->view(m_room, m_merged, false);
        const QString av = r ? r->memberAvatars.value(m.sender) : QString();
        if (av.isEmpty()) return QString();
        const QString p = m_store->mediaPath(QStringLiteral("av:") + av);
        if (p.isEmpty()) m_store->wantAvatar(av);
        return p;
    }
    case PollRole: {
        if (m.kind != QLatin1String("poll")) return {};
        const Room *r = m_store->view(m_room, m_merged, false);
        const bool ended = r && r->ended.contains(m.id);
        const QHash<QString, QStringList> votes = r ? r->votes.value(m.id) : QHash<QString, QStringList>();
        int voters = 0; QStringList mine = votes.value(m_store->me());
        for (auto it = votes.cbegin(); it != votes.cend(); ++it) if (!it.value().isEmpty()) ++voters;
        QVariantList answers; int best = 0;
        for (const auto &a : m.poll.answers) { int n = 0; for (auto it = votes.cbegin(); it != votes.cend(); ++it) if (it.value().contains(a.first)) ++n; best = qMax(best, n); }
        const bool showCounts = m.poll.disclosed || ended;
        for (const auto &a : m.poll.answers) {
            int n = 0; for (auto it = votes.cbegin(); it != votes.cend(); ++it) if (it.value().contains(a.first)) ++n;
            answers << QVariantMap{{"id", a.first}, {"text", a.second}, {"votes", showCounts ? n : -1}, {"mine", mine.contains(a.first)}, {"winner", ended && n > 0 && n == best}};
        }
        return QVariantMap{{"question", m.poll.question}, {"answers", answers}, {"ended", ended}, {"voters", showCounts ? voters : -1}, {"max", m.poll.maxSelections}, {"disclosed", m.poll.disclosed}, {"mineVoted", !mine.isEmpty()}};
    }
    case ReactionsRole: {
        QVariantList out;
        for (auto it = m.reactions.cbegin(); it != m.reactions.cend(); ++it) {
            const Room *r = m_store->view(m_room, m_merged, false); QStringList names;
            for (const QString &u : it.value()) names << (u == m_store->me() ? QStringLiteral("You") : (r ? r->nameOf(u) : u));
            out << QVariantMap{{QStringLiteral("key"), it.key()}, {QStringLiteral("count"), it.value().size()}, {QStringLiteral("mine"), it.value().contains(m_store->me())}, {QStringLiteral("who"), names.join(QStringLiteral(", "))}};
        }
        return out;
    }
    }
    return {};
}
