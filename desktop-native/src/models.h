#pragma once
#include <QAbstractListModel>
#include <QVector>
#include "store.h"

/// A list model that updates by what actually changed (rows added, removed, moved or redrawn), never by throwing everything away:
/// that is what keeps scrolling steady, keeps pictures from flickering and keeps your place while new messages arrive.
class DiffModel : public QAbstractListModel {
    Q_OBJECT
public:
    using QAbstractListModel::QAbstractListModel;
    int rowCount(const QModelIndex &p = {}) const override { return p.isValid() ? 0 : m_ids.size(); }
    int count() const { return m_ids.size(); }
    QString idAt(int row) const { return row >= 0 && row < m_ids.size() ? m_ids[row] : QString(); }
    int rowOf(const QString &id) const { return m_ids.indexOf(id); }
protected:
    /// Makes the list show [next] (ids, unique) in that order. Calls the hooks so the subclass can keep its own per-row data in step.
    void applyIds(const QStringList &next);
    virtual void rowRemoved(int row) = 0;
    virtual void rowInserted(int row, const QString &id) = 0;
    virtual void rowMoved(int from, int to) = 0;
    QStringList m_ids;
};

/// The list of chats on the left: filtered by tab and search, pinned first, then most recent first.
class RoomListModel : public DiffModel {
    Q_OBJECT
public:
    enum Role { IdRole = Qt::UserRole + 1, NameRole, PreviewRole, TimeRole, UnreadRole, DirectRole, EncryptedRole, LetterRole, AvatarRole, NetworkRole, PinnedRole, ArchivedRole,
                LowRole, MutedRole, MarkedUnreadRole, TypingRole, GroupRole, MentionRole, LabelsRole, TickRole };
    explicit RoomListModel(Store *store, QObject *parent = nullptr) : DiffModel(parent), m_store(store) {}
    QVariant data(const QModelIndex &i, int role) const override;
    QHash<int, QByteArray> roleNames() const override;
    void refresh();
    /// What to show: tab is inbox, unread, archive, low, pinned or label:NAME; [search] matches names and previews.
    void setFilter(const QString &tab, const QString &search);
    /// The filters of the filter window: {groups, dms, drafts, unanswered, network}. [drafts] are the chats you have an unsent draft in.
    void setFilters(const QVariantMap &f, const QSet<QString> &drafts) { m_filters = f; m_drafts = drafts; refresh(); }
    /// With the row of pinned chats shown above the list, the list itself leaves them out.
    void setExcludePinned(bool on) { m_excludePinned = on; }
    /// Networks whose chats stay out of the list, and whether unread chats come first.
    void setOptions(const QStringList &hiddenNetworks, bool unreadFirst) { m_hidden = hiddenNetworks; m_unreadFirst = unreadFirst; }
    QString tab() const { return m_tab; }
    int unreadChats() const;      // chats with something unread (not archived or muted), for the tab badge
    static QString displayName(const Room &r);
protected:
    void rowRemoved(int row) override { m_sig.remove(row); }
    void rowInserted(int row, const QString &id) override { m_sig.insert(row, signature(id)); }
    void rowMoved(int from, int to) override { m_sig.move(from, to); }
private:
    QString signature(const QString &id) const;
    Store *m_store;
    QString m_tab = QStringLiteral("inbox"), m_search;
    QStringList m_hidden; bool m_unreadFirst = false, m_excludePinned = false;
    QVariantMap m_filters; QSet<QString> m_drafts;
    QVector<QString> m_sig;
};

/// The messages of the chat that is open, NEWEST FIRST: the view is turned upside down, so the newest message stays at the bottom without any scrolling tricks.
class TimelineModel : public DiffModel {
    Q_OBJECT
public:
    enum Role { IdRole = Qt::UserRole + 1, SenderRole, SenderNameRole, BodyRole, KindRole, TimeRole, MineRole, LockedRole, LocalRole, FirstRole, LastRole, ReactionsRole, DayRole, EditedRole, ReplyRole,
                MediaRole, WidthRole, HeightRole, FileNameRole, PollRole, HtmlRole, CaptionRole, CaptionHtmlRole, MimeRole, SizeRole, DurationRole, VoiceRole, StickerRole, GifRole, GeoRole,
                TickRole, SenderAvatarRole, ReplyNameRole, ReplyTextRole, DividerRole, MentionedRole, BigEmojiRole, FullTimeRole, StatusRole, PosterRole };
    explicit TimelineModel(Store *store, QObject *parent = nullptr) : DiffModel(parent), m_store(store) {}
    QVariant data(const QModelIndex &i, int role) const override;
    QHash<int, QByteArray> roleNames() const override;
    /// Shows [roomId]: a different chat starts over, the same chat is brought up to date by what changed.
    void show(const QString &roomId);
    /// One message changed on its own (its picture arrived): redraw just that row.
    void touch(const QString &eventId);
    QString roomId() const { return m_room; }
    /// How far apart (minutes) messages of one person can be and still count as one run; and whether a message of only emoji is shown big.
    void setOptions(int groupGapMin, bool bigEmoji) { m_gapMs = qint64(qMax(1, groupGapMin)) * 60000; m_bigEmojiOn = bigEmoji; }
    /// Where the unread messages begin (set when the chat is opened).
    void setUnreadBefore(const QString &id) { m_unreadBefore = id; }
    Q_INVOKABLE int rowOfMessage(const QString &id) const { return rowOf(id); }
    int dividerRow() const { return m_unreadBefore.isEmpty() ? -1 : rowOf(m_unreadBefore); }
protected:
    void rowRemoved(int row) override { m_rows.remove(row); }
    void rowInserted(int row, const QString &) override { m_rows.insert(row, Row()); }
    void rowMoved(int from, int to) override { m_rows.move(from, to); }
private:
    struct Row { Msg msg; bool first = false, last = false; QString day, replyName, replyText, sig; int tick = 0; bool mentioned = false, big = false; };
    Row build(const Room &r, int storeIndex, int readPos, int deliveredPos, bool group) const;
    Store *m_store;
    QString m_room, m_unreadBefore;
    qint64 m_gapMs = 5 * 60000; bool m_bigEmojiOn = true;
    QVector<Row> m_rows;   // newest first
};
