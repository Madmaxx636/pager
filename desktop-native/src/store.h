// What the app knows about its chats, built from the events the engine hands over (already decrypted where the keys were there).
// Plain Qt Core, no screen: it is tested on its own (tests/store_test.cpp).
#pragma once
#include <QDateTime>
#include <QHash>
#include <QJsonArray>
#include <QJsonObject>
#include <QMap>
#include <QPair>
#include <QSet>
#include <QString>
#include <QStringList>
#include <QVector>
#include <functional>

struct Poll {
    QString question;
    QVector<QPair<QString, QString>> answers;   // id, text
    int maxSelections = 1;
    bool disclosed = true;
};

struct Msg {
    QString id, sender, senderName, body, kind, replyTo;
    QString type, caption, html, captionHtml, mime, geo, attention, txn, poster;   // type = the Matrix msgtype
    QStringList mentions;
    qint64 ts = 0, size = 0, durationMs = 0;
    int status = 0;                                        // 0 sent, 1 sending, 2 failed
    bool locked = false, local = false, edited = false, voice = false, sticker = false, gifLike = false;
    QMap<QString, QStringList> reactions;   // key -> who reacted
    QString fileName; int width = 0, height = 0; QJsonObject content;   // pictures and files: what is needed to fetch them
    Poll poll;                                                           // kind == "poll"
};

struct Room {
    QString id, name, ownName, avatar, historyToken;
    QString network = QStringLiteral("matrix"), roomType;                 // which chat app this chat is on (from the bridge), and dm / group
    QHash<QString, QString> members, memberAvatars;                       // user id -> name / avatar address (people known so far)
    QStringList joined, heroes, typing, tags;
    int memberCount = 0;
    QHash<QString, QString> receipts; QHash<QString, qint64> receiptTs;   // who has read up to which message
    QHash<QString, QStringList> deliveredTo; bool statusSeen = false;     // the bridge's own reports that a message reached the other network
    double pinOrder = 0; bool markedUnread = false, initialDone = false;
    bool direct = false, encrypted = false, historyAsked = false, reachedStart = false;
    bool isGroup() const { return !roomType.isEmpty() ? roomType != QLatin1String("dm") : memberCount > 2; }
    bool pinned() const { return tags.contains(QLatin1String("m.favourite")); }
    bool archived() const { return tags.contains(QLatin1String("u.archived")); }
    bool lowPriority() const { return tags.contains(QLatin1String("m.lowpriority")); }
    QStringList labels() const { QStringList out; for (const QString &t : tags) if (t.startsWith(QLatin1String("u.label."))) out << t.mid(8); out.sort(); return out; }
    QString nameOf(const QString &user) const;
    int unread = 0, highlights = 0;
    QVector<Msg> msgs;                      // oldest first
    QHash<QString, QStringList> reactionRefs; // reaction event id -> {target, key, sender}
    QHash<QString, QHash<QString, QStringList>> votes;   // poll id -> who -> chosen answer ids
    QHash<QString, qint64> voteTs;                        // poll id + who -> when, so an old vote never beats a newer one
    QSet<QString> ended;                                  // polls that were closed
    qint64 lastTs() const { return msgs.isEmpty() ? 0 : msgs.last().ts; }
    QString preview() const;
    const Msg *find(const QString &id) const;
};

class Store {
public:
    void setMe(const QString &user) { m_me = user; }
    /// Chats you muted (from your push rules).
    void setMuted(const QSet<QString> &ids) { m_muted = ids; }
    bool muted(const QString &id) const { return m_muted.contains(id); }
    const QSet<QString> &mutedSet() const { return m_muted; }
    /// Your own accounts on other networks (so what you wrote on your phone shows as sent by you).
    void setOwnIdentity(const QStringList &names, const QStringList &ids);
    /// Switches a room's tag on or off right away (the server is told separately).
    void setTag(const QString &roomId, const QString &tag, bool on, double order = 0);
    void setMarkedUnread(const QString &roomId, bool on) { if (Room *r = mutableRoom(roomId)) r->markedUnread = on; }
    void markFailed(const QString &roomId, const QString &localId);
    /// Chats a person should see: not the bridges' own management chats.
    bool isBotRoom(const Room &r) const;
    const QString &me() const { return m_me; }
    /// Applies the rooms of one sync answer. Returns the ids of the rooms that changed.
    QStringList applyRooms(const QJsonArray &rooms);
    /// Applies a page of older messages (or the first look at a room). Returns the room id.
    QString applyHistory(const QJsonObject &page);
    QString addLocal(const QString &roomId, const QString &body, const QString &replyTo = QString(), const QString &html = QString());
    void removeMessage(const QString &roomId, const QString &id);
    QString addLocalFile(const QString &roomId, const QString &path, const QString &name, bool image, int w, int h);
    /// Applies one event we made ourselves (a reaction, an edit, a deletion) so it shows before the server echoes it.
    void applyLocalEvent(const QString &roomId, const QJsonObject &event);
    /// The event id of this person's reaction with [key] on [target], or empty.
    QString reactionIdOf(const QString &roomId, const QString &target, const QString &key, const QString &who) const;
    int nextLocalId() { return ++m_localCounter; }
    QString mediaPath(const QString &eventId) const { return m_media.value(eventId); }
    void setMediaPath(const QString &eventId, const QString &path) { m_media.insert(eventId, path); }
    void removeRoom(const QString &id) { m_rooms.remove(id); }
    const Room *room(const QString &id) const { auto it = m_rooms.constFind(id); return it == m_rooms.cend() ? nullptr : &*it; }
    Room *mutableRoom(const QString &id) { auto it = m_rooms.find(id); return it == m_rooms.end() ? nullptr : &*it; }
    /// Room ids, most recent activity first.
    QStringList order() const;
    int count() const { return m_rooms.size(); }
    QHash<QString, Room>::const_iterator roomsBegin() const { return m_rooms.constBegin(); }
    QHash<QString, Room>::const_iterator roomsEnd() const { return m_rooms.constEnd(); }
    /// Asked for when a picture of a person or chat is first needed; the engine fetches it and then calls setMediaPath("av:" + address, file).
    std::function<void(const QString &mxc)> avatarWanted;
    void wantAvatar(const QString &mxc) const { if (avatarWanted && !m_wantedAvatars.contains(mxc)) { m_wantedAvatars.insert(mxc); avatarWanted(mxc); } }
    void forgetWantedAvatar(const QString &mxc) const { m_wantedAvatars.remove(mxc); }
    static bool isBridgeBot(const QString &user);
    bool mine(const Msg &m) const { return !m_me.isEmpty() && m.sender == m_me; }
    static QString clock(qint64 ms);
    static QString dayLabel(qint64 ms);

private:
    void applyEvent(Room &r, const QJsonObject &ev);
    QString m_me;
    QHash<QString, Room> m_rooms;
    QHash<QString, QString> m_media;
    QSet<QString> m_muted, m_ownIds, m_ownNames;
    mutable QSet<QString> m_wantedAvatars;
    void applyState(Room &r, const QJsonObject &ev);
    void applyEphemeral(Room &r, const QJsonObject &ev);
    void applyRoomAccountData(Room &r, const QJsonObject &ev);
    QSet<QString> ownGhosts(const Room &r) const;
    int m_localCounter = 0;
};
