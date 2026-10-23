#pragma once
#include <QHash>
#include <QJSValue>
#include <functional>
#include <QSet>
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
    Q_PROPERTY(QString tab READ tab NOTIFY listChanged)
    Q_PROPERTY(QString search READ search NOTIFY listChanged)
    Q_PROPERTY(int unreadChats READ unreadChats NOTIFY listChanged)     // chats with something new (the badge on the Unread tab)
    Q_PROPERTY(QStringList labels READ labels NOTIFY listChanged)
    Q_PROPERTY(QString currentNetwork READ currentNetwork NOTIFY currentChanged)
    Q_PROPERTY(bool currentIsGroup READ currentIsGroupChat NOTIFY currentChanged)
    Q_PROPERTY(QString currentTyping READ currentTyping NOTIFY currentChanged)
    Q_PROPERTY(int currentLocked READ currentLocked NOTIFY currentChanged)   // messages of the open chat that cannot be read yet
    Q_PROPERTY(bool loading READ loading NOTIFY stateChanged)   // signed in, but the first load of your chats has not finished
    Q_PROPERTY(bool isAdmin READ isAdmin NOTIFY stateChanged)
    Q_PROPERTY(QString updateState READ updateState NOTIFY updateChanged)   // idle, checking, available, downloading, installing, error
    Q_PROPERTY(QString updateVersion READ updateVersion NOTIFY updateChanged)
    Q_PROPERTY(QString updateNotes READ updateNotes NOTIFY updateChanged)
    Q_PROPERTY(QString updateMessage READ updateMessage NOTIFY updateChanged)
    Q_PROPERTY(int updateProgress READ updateProgress NOTIFY updateChanged)
    Q_PROPERTY(bool recovering READ recovering NOTIFY recoveryChanged)
    Q_PROPERTY(QString recoveryMessage READ recoveryMessage NOTIFY recoveryChanged)
    Q_PROPERTY(bool recoveryDone READ recoveryDone NOTIFY recoveryChanged)
    Q_PROPERTY(QString version READ version CONSTANT)
    Q_PROPERTY(QString appVersion READ appVersion CONSTANT)
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
    QString tab() const { return m_tab; }
    QString search() const { return m_search; }
    int unreadChats() const { return m_rooms.unreadChats(); }
    QStringList labels() const;
    QString currentNetwork() const { const Room *r = m_store.room(m_current); return r ? r->network : QString(); }
    bool currentIsGroupChat() const { const Room *r = m_store.room(m_current); return r && r->isGroup(); }
    QString currentTyping() const;
    int currentLocked() const { const Room *r = m_store.room(m_current); int n = 0; if (r) for (const Msg &m : r->msgs) if (m.locked) ++n; return n; }
    bool loading() const { return m_signedIn && !m_synced; }
    bool isAdmin() const { return m_admin; }
    QString updateState() const { return m_updState; }
    QString updateVersion() const { return m_updVersion; }
    QString updateNotes() const { return m_updNotes; }
    QString updateMessage() const { return m_updMessage; }
    int updateProgress() const { return m_updProgress; }
    bool recovering() const { return m_recovering; }
    QString recoveryMessage() const { return m_recoveryMessage; }
    bool recoveryDone() const { return m_recoveryDone; }
    QString version() const;
    QString appVersion() const { return QStringLiteral(PAGER_NATIVE_VERSION); }
    Q_INVOKABLE void login(const QString &homeserver, const QString &user, const QString &password);
    Q_INVOKABLE void logout();
    Q_INVOKABLE void openRoom(const QString &id);
    Q_INVOKABLE void send(const QString &text, const QString &replyTo = QString());
    /// Adds your reaction to a message, or takes it back if you already reacted with that emoji.
    Q_INVOKABLE void react(const QString &eventId, const QString &emoji);
    Q_INVOKABLE void deleteMessage(const QString &eventId);
    Q_INVOKABLE void edit(const QString &eventId, const QString &text);
    /// Fetches the picture or file of a message (once); the row updates by itself when it arrives.
    Q_INVOKABLE void fetchMedia(const QString &eventId);
    /// The original file of a picture, video, voice message or file (for viewing, playing and saving). Answered by mediaReady(key).
    Q_INVOKABLE void fetchFull(const QString &eventId);
    Q_INVOKABLE QString fullPath(const QString &eventId) const { return m_store.mediaPath(QStringLiteral("full:") + eventId); }
    /// Copies a downloaded file somewhere the person chose.
    Q_INVOKABLE bool saveCopy(const QString &eventId, const QString &destination) const;
    Q_INVOKABLE void sendFile(const QString &path, const QString &mime, int width, int height, const QString &caption = QString());
    Q_INVOKABLE void createPoll(const QString &question, const QStringList &answers, int maxSelections, bool disclosed);
    /// Picks (or un-picks, in polls that allow several) an answer.
    Q_INVOKABLE void vote(const QString &pollId, const QString &answerId);
    Q_INVOKABLE void endPoll(const QString &pollId);
    /// Calls the Pager server (/api/...). [callback](status, body) runs when it answers; status 0 means it could not be reached. [body] is a JS object, or null.
    Q_INVOKABLE void api(const QString &method, const QString &path, const QVariant &body, const QJSValue &callback);
    /// A QR code for [text]: {size, rows:["0101…"]}.
    Q_INVOKABLE QVariantMap qr(const QString &text) const;
    /// Asks the server whether a newer version exists. [quiet] keeps "you're up to date" and errors to itself.
    Q_INVOKABLE void checkForUpdates(bool quiet);
    Q_INVOKABLE void installUpdate();
    /// The screen tells us how putting the downloaded update in place went ("" = fine; the app then restarts).
    Q_INVOKABLE void updateInstalled(const QString &error);
    /// Which chats the list shows: tab is inbox, unread, pinned, low, archive or label:NAME; [search] matches names and what was said.
    Q_INVOKABLE void filter(const QString &tab, const QString &search);
    Q_INVOKABLE void setTag(const QString &roomId, const QString &tag, bool on, double order = 0);
    Q_INVOKABLE void pin(const QString &roomId, bool on);
    Q_INVOKABLE void archive(const QString &roomId, bool on) { setTag(roomId, QStringLiteral("u.archived"), on); }
    Q_INVOKABLE void setLowPriority(const QString &roomId, bool on) { setTag(roomId, QStringLiteral("m.lowpriority"), on); }
    Q_INVOKABLE void addLabel(const QString &roomId, const QString &label) { setTag(roomId, QStringLiteral("u.label.") + label, true); }
    Q_INVOKABLE void removeLabel(const QString &roomId, const QString &label) { setTag(roomId, QStringLiteral("u.label.") + label, false); }
    Q_INVOKABLE void markUnread(const QString &roomId, bool on);
    Q_INVOKABLE void markRead(const QString &roomId);
    Q_INVOKABLE void markAllRead();
    Q_INVOKABLE void setMuted(const QString &roomId, bool on);
    /// Takes a chat out of Pager. [atSource] asks the bridge to delete the conversation on its own network as well.
    Q_INVOKABLE void leaveRoom(const QString &roomId, bool atSource);
    Q_INVOKABLE void renameRoom(const QString &roomId, const QString &name);
    Q_INVOKABLE void setTyping(bool on);
    /// What the list shows about one chat (for menus): {pinned, archived, lowPriority, muted, unread, markedUnread, labels, isGroup, name}.
    Q_INVOKABLE QVariantMap roomInfo(const QString &roomId) const;
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
    void listChanged();
    void mediaReady(const QString &key);
    void recoveryChanged();
    void updateChanged();
    /// The update has been downloaded and checked: the screen puts it in place and restarts.
    void updateReady(const QString &path);
    void restartRequested();
    /// A message arrived that deserves a pop-up: which chat, who from, what it says.
    void notify(const QString &roomId, const QString &title, const QString &body);
    void unreadChanged(int total);
private:
    static void callback(void *user, const char *kind, const char *json);
    void loadDemo();
    void sendEvent(const QString &room, const QString &type, const QJsonObject &content, const QString &txn = QString());
    static QString pct(const QString &s);
    PagerEngine *m_core = nullptr;
    QString m_logFile;
    void log(const QString &line);
    void call(const QString &method, const QString &path, const QVariant &body, std::function<void(int, const QJsonValue &)> done = {});
    void loadPushRules();
    void loadIdentity();
    void refreshLists() { m_rooms.refresh(); emit listChanged(); emit unreadChanged(totalUnread()); }
    QHash<QString, std::function<void(int, const QJsonValue &)>> m_internal;
    QString m_tab = QStringLiteral("inbox"), m_search;
    qint64 m_lastTyping = 0;
    Store m_store;
    RoomListModel m_rooms{&m_store};
    TimelineModel m_timeline{&m_store};
    bool m_signedIn = false, m_starting = true, m_working = false;
    bool m_firstRooms = true;
    QSet<QString> m_fetching;
    QHash<QString, QJSValue> m_calls;
    int m_callCounter = 0;
    QString m_meKey;
    QString m_updState = QStringLiteral("idle"), m_updVersion, m_updNotes, m_updMessage, m_updFile, m_updSha, m_updBase;
    int m_updProgress = 0;
    bool m_updQuiet = false;
    QHash<QString, QString> m_seen;      // room -> id of the newest message we have already looked at
    bool m_synced = false, m_admin = false, m_active = true, m_recovering = false, m_recoveryDone = false;
    QString m_user, m_error, m_problem, m_current, m_recoveryMessage, m_lastRead;
};
