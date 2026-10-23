// What the app knows about its chats, built from the events the engine hands over (already decrypted where the keys were there).
// Plain Qt Core, no screen: it is tested on its own (tests/store_test.cpp).
#pragma once
#include <QDateTime>
#include <QHash>
#include <QJsonArray>
#include <QJsonObject>
#include <QMap>
#include <QString>
#include <QStringList>
#include <QVector>

struct Msg {
    QString id, sender, senderName, body, kind, replyTo;
    qint64 ts = 0;
    bool locked = false, local = false, edited = false;
    QMap<QString, QStringList> reactions;   // key -> who reacted
};

struct Room {
    QString id, name, avatar, historyToken;
    bool direct = false, encrypted = false, historyAsked = false, reachedStart = false;
    int unread = 0, highlights = 0;
    QVector<Msg> msgs;                      // oldest first
    QHash<QString, QStringList> reactionRefs; // reaction event id -> {target, key, sender}
    qint64 lastTs() const { return msgs.isEmpty() ? 0 : msgs.last().ts; }
    QString preview() const;
    const Msg *find(const QString &id) const;
};

class Store {
public:
    void setMe(const QString &user) { m_me = user; }
    const QString &me() const { return m_me; }
    /// Applies the rooms of one sync answer. Returns the ids of the rooms that changed.
    QStringList applyRooms(const QJsonArray &rooms);
    /// Applies a page of older messages (or the first look at a room). Returns the room id.
    QString applyHistory(const QJsonObject &page);
    void addLocal(const QString &roomId, const QString &body, const QString &replyTo = QString());
    /// Applies one event we made ourselves (a reaction, an edit, a deletion) so it shows before the server echoes it.
    void applyLocalEvent(const QString &roomId, const QJsonObject &event);
    /// The event id of this person's reaction with [key] on [target], or empty.
    QString reactionIdOf(const QString &roomId, const QString &target, const QString &key, const QString &who) const;
    int nextLocalId() { return ++m_localCounter; }
    void removeRoom(const QString &id) { m_rooms.remove(id); }
    const Room *room(const QString &id) const { auto it = m_rooms.constFind(id); return it == m_rooms.cend() ? nullptr : &*it; }
    Room *mutableRoom(const QString &id) { auto it = m_rooms.find(id); return it == m_rooms.end() ? nullptr : &*it; }
    /// Room ids, most recent activity first.
    QStringList order() const;
    int count() const { return m_rooms.size(); }
    bool mine(const Msg &m) const { return !m_me.isEmpty() && m.sender == m_me; }
    static QString clock(qint64 ms);
    static QString dayLabel(qint64 ms);

private:
    void applyEvent(Room &r, const QJsonObject &ev);
    QString m_me;
    QHash<QString, Room> m_rooms;
    int m_localCounter = 0;
};
