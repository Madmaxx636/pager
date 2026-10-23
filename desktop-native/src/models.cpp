#include "models.h"
#include <QVariantMap>

QHash<int, QByteArray> RoomListModel::roleNames() const {
    return {{IdRole, "roomId"}, {NameRole, "name"}, {PreviewRole, "preview"}, {TimeRole, "time"}, {UnreadRole, "unread"}, {DirectRole, "direct"}, {EncryptedRole, "encrypted"}, {LetterRole, "letter"}};
}
void RoomListModel::refresh() { beginResetModel(); m_ids = m_store->order(); endResetModel(); }
QVariant RoomListModel::data(const QModelIndex &i, int role) const {
    if (!i.isValid() || i.row() >= m_ids.size()) return {};
    const Room *r = m_store->room(m_ids[i.row()]);
    if (!r) return {};
    switch (role) {
    case IdRole: return r->id;
    case NameRole: return r->name.isEmpty() ? r->id : r->name;
    case PreviewRole: return r->preview();
    case TimeRole: return r->msgs.isEmpty() ? QString() : (QDateTime::fromMSecsSinceEpoch(r->lastTs()).date() == QDate::currentDate() ? Store::clock(r->lastTs()) : QDateTime::fromMSecsSinceEpoch(r->lastTs()).date().toString(QStringLiteral("MMM d")));
    case UnreadRole: return r->unread;
    case DirectRole: return r->direct;
    case EncryptedRole: return r->encrypted;
    case LetterRole: { const QString n = r->name.trimmed(); return n.isEmpty() ? QStringLiteral("#") : n.left(1).toUpper(); }
    }
    return {};
}

QHash<int, QByteArray> TimelineModel::roleNames() const {
    return {{IdRole, "eventId"}, {SenderRole, "sender"}, {SenderNameRole, "senderName"}, {BodyRole, "body"}, {KindRole, "kind"}, {TimeRole, "time"}, {MineRole, "mine"}, {LockedRole, "locked"},
            {LocalRole, "local"}, {FirstRole, "first"}, {LastRole, "last"}, {ReactionsRole, "reactions"}, {DayRole, "day"}, {EditedRole, "edited"}, {ReplyRole, "replyTo"}, {MediaRole, "media"}, {WidthRole, "imgWidth"}, {HeightRole, "imgHeight"}, {FileNameRole, "fileName"}, {PollRole, "poll"}};
}
void TimelineModel::show(const QString &roomId) {
    beginResetModel();
    m_room = roomId; m_rows.clear(); m_first.clear(); m_last.clear(); m_day.clear();
    if (const Room *r = m_store->room(roomId)) {
        const int n = r->msgs.size();
        for (int i = n - 1; i >= 0; --i) m_rows.append(r->msgs[i]);
        for (int k = 0; k < m_rows.size(); ++k) {
            const Msg &m = m_rows[k];
            const Msg *older = k + 1 < m_rows.size() ? &m_rows[k + 1] : nullptr;   // the message just before it in time
            const Msg *newer = k > 0 ? &m_rows[k - 1] : nullptr;
            const bool sameRunOlder = older && older->sender == m.sender && m.ts - older->ts < 5 * 60 * 1000 && QDateTime::fromMSecsSinceEpoch(older->ts).date() == QDateTime::fromMSecsSinceEpoch(m.ts).date();
            const bool sameRunNewer = newer && newer->sender == m.sender && newer->ts - m.ts < 5 * 60 * 1000 && QDateTime::fromMSecsSinceEpoch(newer->ts).date() == QDateTime::fromMSecsSinceEpoch(m.ts).date();
            m_first.append(!sameRunOlder); m_last.append(!sameRunNewer);
            const bool newDay = !older || QDateTime::fromMSecsSinceEpoch(older->ts).date() != QDateTime::fromMSecsSinceEpoch(m.ts).date();
            m_day.append(newDay ? Store::dayLabel(m.ts) : QString());
        }
    }
    endResetModel();
}
QVariant TimelineModel::data(const QModelIndex &i, int role) const {
    if (!i.isValid() || i.row() >= m_rows.size()) return {};
    const Msg &m = m_rows[i.row()];
    switch (role) {
    case IdRole: return m.id;
    case SenderRole: return m.sender;
    case SenderNameRole: return m.senderName;
    case BodyRole: return m.kind == QLatin1String("emote") ? QStringLiteral("* %1 %2").arg(m.senderName, m.body) : m.body;
    case KindRole: return m.kind;
    case TimeRole: return Store::clock(m.ts);
    case MineRole: return m_store->mine(m);
    case LockedRole: return m.locked;
    case LocalRole: return m.local;
    case FirstRole: return m_first[i.row()];
    case LastRole: return m_last[i.row()];
    case DayRole: return m_day[i.row()];
    case EditedRole: return m.edited;
    case ReplyRole: return m.replyTo;
    case MediaRole: return m_store->mediaPath(m.id);
    case WidthRole: return m.width;
    case HeightRole: return m.height;
    case FileNameRole: return m.fileName;
    case PollRole: {
        if (m.kind != QLatin1String("poll")) return {};
        const Room *r = m_store->room(m_room);
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
        for (auto it = m.reactions.cbegin(); it != m.reactions.cend(); ++it)
            out << QVariantMap{{QStringLiteral("key"), it.key()}, {QStringLiteral("count"), it.value().size()}, {QStringLiteral("mine"), it.value().contains(m_store->me())}};
        return out;
    }
    }
    return {};
}

void TimelineModel::touch(const QString &eventId) {
    for (int i = 0; i < m_rows.size(); ++i) if (m_rows[i].id == eventId) { emit dataChanged(index(i), index(i)); return; }
}
