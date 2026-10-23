#pragma once
#include <QAbstractListModel>
#include "store.h"

/// The list of chats on the left, most recent first.
class RoomListModel : public QAbstractListModel {
    Q_OBJECT
public:
    enum Role { IdRole = Qt::UserRole + 1, NameRole, PreviewRole, TimeRole, UnreadRole, DirectRole, EncryptedRole, LetterRole };
    explicit RoomListModel(Store *store, QObject *parent = nullptr) : QAbstractListModel(parent), m_store(store) {}
    int rowCount(const QModelIndex &p = {}) const override { return p.isValid() ? 0 : m_ids.size(); }
    QVariant data(const QModelIndex &i, int role) const override;
    QHash<int, QByteArray> roleNames() const override;
    void refresh();
private:
    Store *m_store;
    QStringList m_ids;
};

/// The messages of the chat that is open, NEWEST FIRST: the view is turned upside down, so the newest message stays at the bottom without any scrolling tricks.
class TimelineModel : public QAbstractListModel {
    Q_OBJECT
public:
    enum Role { IdRole = Qt::UserRole + 1, SenderRole, SenderNameRole, BodyRole, KindRole, TimeRole, MineRole, LockedRole, LocalRole, FirstRole, LastRole, ReactionsRole, DayRole, EditedRole, ReplyRole };
    explicit TimelineModel(Store *store, QObject *parent = nullptr) : QAbstractListModel(parent), m_store(store) {}
    int rowCount(const QModelIndex &p = {}) const override { return p.isValid() ? 0 : m_rows.size(); }
    QVariant data(const QModelIndex &i, int role) const override;
    QHash<int, QByteArray> roleNames() const override;
    void show(const QString &roomId);
    QString roomId() const { return m_room; }
private:
    Store *m_store;
    QString m_room;
    QVector<Msg> m_rows;   // newest first
    QVector<bool> m_first, m_last;
    QVector<QString> m_day;
};
