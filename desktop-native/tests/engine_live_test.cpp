// The Qt side on top of the real engine, against a real homeserver (PAGER_TEST_SERVER and PAGER_TEST_ALICE=name:password; without them this does nothing).
// A fresh sign-in on a new "device": it must show the account's chats, open one, and send a message that appears at once and is not shown twice.
#include <QJSEngine>
#include <QJsonArray>
#include <QQmlEngine>
#include <QJsonObject>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QtTest>
#include "engine.h"

class EngineLiveTest : public QObject {
    Q_OBJECT
private slots:
    void reactEditAndDeleteShowAtOnce() {            // needs no server
        Engine e(QString(), true);                     // demo chats: "!maya" is open, a3 and a4 are mine, a1 is Maya's
        const Room *r = e.store()->room("!maya");
        e.react("a1", "🔥");
        QCOMPARE(r->find("a1")->reactions.value("🔥"), QStringList{"@me:demo.test"});
        e.react("a1", "🔥");                           // again takes it back
        QVERIFY(!r->find("a1")->reactions.contains("🔥"));
        e.edit("a3", "Yes! Booking sounds perfect");
        QCOMPARE(r->find("a3")->body, QString("Yes! Booking sounds perfect"));
        QVERIFY(r->find("a3")->edited);
        e.edit("a1", "hacked");                        // not mine: refused
        QVERIFY(r->find("a1")->body != "hacked");
        e.deleteMessage("a1");                         // not mine: refused
        QVERIFY(r->find("a1"));
        e.deleteMessage("a4");
        QVERIFY(!r->find("a4"));
        e.send("on my way", "a8");
        QCOMPARE(r->msgs.last().replyTo, QString("a8"));
    }
    void pollsCanBeCreatedVotedAndEnded() {            // needs no server
        Engine e(QString(), true);
        e.createPoll("Where to eat?", {"Pizza", " ", "Tacos"}, 1, true);
        const Room *r = e.store()->room("!maya");
        const Msg &p = r->msgs.last();
        QCOMPARE(p.kind, QString("poll")); QVERIFY(p.local);
        QCOMPARE(p.poll.answers.size(), 2);                     // the blank answer is dropped
        // pretend the server echoed it back under its real id
        e.handle("rooms", QJsonObject{{"rooms", QJsonArray{QJsonObject{{"id", "!maya"}, {"events", QJsonArray{QJsonObject{{"event_id", "$poll"}, {"type", "org.matrix.msc3381.poll.start"}, {"sender", "@me:demo.test"}, {"origin_server_ts", 9e12},
            {"content", QJsonObject{{"org.matrix.msc3381.poll.start", QJsonObject{{"max_selections", 1}, {"question", QJsonObject{{"body", "Where to eat?"}}},
                {"answers", QJsonArray{QJsonObject{{"id", "a1"}, {"body", "Pizza"}}, QJsonObject{{"id", "a2"}, {"body", "Tacos"}}}}}}}}}}}}}}});
        QVERIFY(!r->find("$poll")->local);
        int polls = 0; for (const Msg &m : r->msgs) if (m.kind == "poll") ++polls;
        QCOMPARE(polls, 2);                                     // the demo chat has one already; the local copy was replaced, not duplicated
        e.vote("$poll", "a2");
        QCOMPARE(r->votes.value("$poll").value("@me:demo.test"), QStringList{"a2"});
        e.vote("$poll", "a1");                                  // single choice: replaces
        QCOMPARE(r->votes.value("$poll").value("@me:demo.test"), QStringList{"a1"});
        e.endPoll("$poll");
        QVERIFY(r->ended.contains("$poll"));
        e.vote("$poll", "a2");                                  // closed: ignored
        QCOMPARE(r->votes.value("$poll").value("@me:demo.test"), QStringList{"a1"});
    }
    void serverCallsAnswerTheCallbackAndQrCodesAreSquare() {   // needs no server
        Engine e(QString(), true);
        QJSEngine js; js.newQObject(&e); QQmlEngine::setObjectOwnership(&e, QQmlEngine::CppOwnership);
        QJSValue fn = js.evaluate("(function(status, body) { got = status + ':' + body.error; })");
        e.api("GET", "/api/bridges", QVariant(), fn);
        QTRY_VERIFY_WITH_TIMEOUT(js.globalObject().hasProperty("got"), 2000);
        QCOMPARE(js.globalObject().property("got").toString(), QString("0:Not connected"));
        const QVariantMap q = e.qr("https://example.com/x");
        QVERIFY(q.value("size").toInt() >= 21);
        QCOMPARE(q.value("rows").toList().size(), q.value("size").toInt());
    }
    void adminsAreRecognisedFromTheServerAnswer() {   // needs no server
        Engine e(QString(), true);
        QVERIFY(!e.isAdmin());
        e.api("GET", "/api/me", QVariant(), QJSValue());           // the first call made is api-1
        e.handle("http", QJsonObject{{"key", "api-1"}, {"status", 200}, {"body", QJsonObject{{"user_id", "@me:demo.test"}, {"admin", true}}}});
        QVERIFY(e.isAdmin());
        e.api("GET", "/api/me", QVariant(), QJSValue());
        e.handle("http", QJsonObject{{"key", "api-2"}, {"status", 403}, {"body", QJsonObject{{"error", "no"}}}});
        QVERIFY(!e.isAdmin());
    }
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
