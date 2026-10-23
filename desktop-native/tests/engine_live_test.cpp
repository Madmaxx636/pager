// The Qt side on top of the real engine, against a real homeserver (PAGER_TEST_SERVER and PAGER_TEST_ALICE=name:password; without them this does nothing).
// A fresh sign-in on a new "device": it must show the account's chats, open one, and send a message that appears at once and is not shown twice.
#include <QJsonArray>
#include <QJsonObject>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QtTest>
#include "engine.h"

class EngineLiveTest : public QObject {
    Q_OBJECT
private slots:
    void popUpsOnlyForNewMessagesFromOthers() {      // needs no server
        Engine e(QString(), true);
        QSignalSpy pop(&e, &Engine::notify);
        auto room = [](const QString &id, const QString &who, const QString &evId, qint64 ts) {
            return QJsonObject{{"rooms", QJsonArray{QJsonObject{{"id", id}, {"name", id == "!a" ? "Alpha" : "Beta"}, {"direct", true}, {"encrypted", true}, {"unread", 1},
                {"events", QJsonArray{QJsonObject{{"event_id", evId}, {"type", "m.room.message"}, {"sender", who}, {"sender_name", "Someone"}, {"origin_server_ts", double(ts)}, {"content", QJsonObject{{"msgtype", "m.text"}, {"body", "hi " + evId}}}}}}}}}};
        };
        const qint64 now = QDateTime::currentMSecsSinceEpoch();
        e.handle("rooms", room("!a", "@x:d", "$1", now));                 // first catch-up: silent
        QCOMPARE(pop.count(), 0);
        e.handle("rooms", room("!a", "@x:d", "$1", now));                 // nothing new
        e.handle("rooms", room("!b", "@x:d", "$2", now + 1000));          // new chat, new message, nobody looking at it
        QCOMPARE(pop.count(), 1);
        QCOMPARE(pop.last().at(0).toString(), QString("!b"));
        QVERIFY(pop.last().at(2).toString().contains("hi $2"));
        e.handle("rooms", room("!b", "@me:demo.test", "$3", now + 2000)); // my own message: silent
        QCOMPARE(pop.count(), 1);
        e.openRoom("!a");
        e.handle("rooms", room("!a", "@x:d", "$4", now + 3000));          // the chat in front of me, window active: silent
        QCOMPARE(pop.count(), 1);
        e.setActive(false);
        e.handle("rooms", room("!a", "@x:d", "$5", now + 4000));          // window behind: pop-up
        QCOMPARE(pop.count(), 2);
    }
    void signInOpenAndSend() {
        const QString server = qEnvironmentVariable("PAGER_TEST_SERVER"), alice = qEnvironmentVariable("PAGER_TEST_ALICE");
        if (server.isEmpty() || !alice.contains(':')) QSKIP("no test server given");
        QTemporaryDir dir;
        Engine e(dir.path());
        QTRY_VERIFY_WITH_TIMEOUT(!e.starting(), 20000);
        QVERIFY(!e.signedIn());
        e.login(server, alice.section(':', 0, 0), alice.section(':', 1));
        QTRY_VERIFY_WITH_TIMEOUT(e.signedIn(), 60000);
        QVERIFY(e.user().startsWith("@alice:"));
        auto *rooms = qobject_cast<RoomListModel *>(e.rooms());
        QTRY_VERIFY_WITH_TIMEOUT(rooms->rowCount() >= 1, 60000);
        const QString id = rooms->data(rooms->index(0), RoomListModel::IdRole).toString();
        e.openRoom(id);
        QCOMPARE(e.currentRoom(), id);
        auto *tl = qobject_cast<TimelineModel *>(e.timeline());
        // The older messages were written before this device existed: they are shown as waiting for their key, not hidden and not as garbage.
        QTRY_VERIFY_WITH_TIMEOUT(tl->rowCount() >= 1, 60000);
        const int before = tl->rowCount();
        const QString text = QStringLiteral("test message %1").arg(QDateTime::currentMSecsSinceEpoch());
        e.send(text);
        QCOMPARE(tl->rowCount(), before + 1);                                   // shown at once
        QCOMPARE(tl->data(tl->index(0), TimelineModel::BodyRole).toString(), text);
        QVERIFY(tl->data(tl->index(0), TimelineModel::LocalRole).toBool());
        QTRY_VERIFY_WITH_TIMEOUT(!tl->data(tl->index(0), TimelineModel::LocalRole).toBool(), 60000);   // the server's copy took its place
        QCOMPARE(tl->rowCount(), before + 1);                                   // and it is not there twice
        QVERIFY(tl->data(tl->index(0), TimelineModel::MineRole).toBool());
        e.logout();
        QTRY_VERIFY_WITH_TIMEOUT(!e.signedIn(), 30000);
    }
};
QTEST_MAIN(EngineLiveTest)
#include "engine_live_test.moc"
