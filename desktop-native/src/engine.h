#pragma once
#include <QHash>
#include <QObject>
#include <QPointer>
#include "models.h"
#include "pager_core.h"

/// The bridge between the Rust engine and the screens: it owns the store and the two models, and turns the engine's messages into changes you can see.
class Engine : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool signedIn READ signedIn NOTIFY stateChanged)
    Q_PROPERTY(bool starting READ starting NOTIFY stateChanged)
    Q_PROPERTY(QString user READ user NOTIFY stateChanged)
    Q_PROPERTY(QString error READ error NOTIFY stateChanged)
    Q_PROPERTY(bool working READ working NOTIFY stateChanged)
    Q_PROPERTY(QString problem READ problem NOTIFY problemChanged)
    Q_PROPERTY(QObject *rooms READ rooms CONSTANT)
    Q_PROPERTY(QObject *timeline READ timeline CONSTANT)
    Q_PROPERTY(QString currentRoom READ currentRoom NOTIFY currentChanged)
    Q_PROPERTY(QString currentName READ currentName NOTIFY currentChanged)
    Q_PROPERTY(QString currentSub READ currentSub NOTIFY currentChanged)
    Q_PROPERTY(bool currentIsDirect READ currentIsDirect NOTIFY currentChanged)
    Q_PROPERTY(bool recovering READ recovering NOTIFY recoveryChanged)
    Q_PROPERTY(QString recoveryMessage READ recoveryMessage NOTIFY recoveryChanged)
    Q_PROPERTY(bool recoveryDone READ recoveryDone NOTIFY recoveryChanged)
    Q_PROPERTY(QString version READ version CONSTANT)
public:
    explicit Engine(const QString &dataDir, bool demo = false, QObject *parent = nullptr);
    ~Engine() override;
    bool signedIn() const { return m_signedIn; }
    bool starting() const { return m_starting; }
    QString user() const { return m_user; }
    QString error() const { return m_error; }
    bool working() const { return m_working; }
    QString problem() const { return m_problem; }
    QObject *rooms() { return &m_rooms; }
    QObject *timeline() { return &m_timeline; }
    QString currentRoom() const { return m_current; }
    QString currentName() const;
    QString currentSub() const;
    bool currentIsDirect() const { const Room *r = m_store.room(m_current); return r && r->direct; }
    bool recovering() const { return m_recovering; }
    QString recoveryMessage() const { return m_recoveryMessage; }
    bool recoveryDone() const { return m_recoveryDone; }
    QString version() const;
    Q_INVOKABLE void login(const QString &homeserver, const QString &user, const QString &password);
    Q_INVOKABLE void logout();
    Q_INVOKABLE void openRoom(const QString &id);
    Q_INVOKABLE void send(const QString &text, const QString &replyTo = QString());
    /// Adds your reaction to a message, or takes it back if you already reacted with that emoji.
    Q_INVOKABLE void react(const QString &eventId, const QString &emoji);
    Q_INVOKABLE void deleteMessage(const QString &eventId);
    Q_INVOKABLE void edit(const QString &eventId, const QString &text);
    /// Text of one of your messages in the open chat (to edit it).
    Q_INVOKABLE QString bodyOf(const QString &eventId) const;
    Q_INVOKABLE void loadOlder();
    /// Restores the keys to old messages from the server's key backup.
    Q_INVOKABLE void recover(const QString &recoveryKey);
    Q_INVOKABLE void resetRecovery() { m_recoveryMessage.clear(); m_recoveryDone = false; emit recoveryChanged(); }
    /// Tells everyone the newest message of the open chat has been read (call when the window is in front).
    Q_INVOKABLE void markCurrentRead();
    /// The screen says whether the window is in front; only then do new messages count as read.
    Q_INVOKABLE void setActive(bool active) { m_active = active; if (active) markCurrentRead(); }
    Store *store() { return &m_store; }
    int totalUnread() const;
    void handle(const QString &kind, const QJsonObject &body);   // also used by tests and the demo
signals:
    void stateChanged();
    void problemChanged();
    void currentChanged();
    void recoveryChanged();
    /// A message arrived that deserves a pop-up: which chat, who from, what it says.
    void notify(const QString &roomId, const QString &title, const QString &body);
    void unreadChanged(int total);
private:
    static void callback(void *user, const char *kind, const char *json);
    void loadDemo();
    void sendEvent(const QString &room, const QString &type, const QJsonObject &content);
    PagerEngine *m_core = nullptr;
    Store m_store;
    RoomListModel m_rooms{&m_store};
    TimelineModel m_timeline{&m_store};
    bool m_signedIn = false, m_starting = true, m_working = false;
    bool m_firstRooms = true;
    QHash<QString, QString> m_seen;      // room -> id of the newest message we have already looked at
    bool m_active = true, m_recovering = false, m_recoveryDone = false;
    QString m_user, m_error, m_problem, m_current, m_recoveryMessage, m_lastRead;
};
