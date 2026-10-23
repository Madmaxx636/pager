// The lists on screen must change by what changed, never by starting over (that is what makes scrolling jump).
#include <QAbstractItemModelTester>
#include <QSignalSpy>
#include <QtTest>
#include "models.h"

static QJsonObject msg(const QString &id, const QString &who, const QString &body, qint64 ts) {
    return QJsonObject{{"event_id", id}, {"type", "m.room.message"}, {"sender", who}, {"origin_server_ts", double(ts)}, {"content", QJsonObject{{"msgtype", "m.text"}, {"body", body}}}};
}
static QJsonObject room(const QString &id, const QString &name, const QJsonArray &events) { return QJsonObject{{"id", id}, {"name", name}, {"events", events}}; }

class ModelsTest : public QObject {
    Q_OBJECT
private slots:
    void aNewMessageIsOneInsertAtTheBottomNotAReset() {
        Store s; s.setMe("@me:x"); TimelineModel m(&s); QAbstractItemModelTester check(&m);
        s.applyRooms({room("!r", "R", {msg("$1", "@a:x", "one", 1000), msg("$2", "@a:x", "two", 2000)})});
        m.show("!r"); QCOMPARE(m.rowCount(), 2); QCOMPARE(m.data(m.index(0), TimelineModel::BodyRole).toString(), QString("two"));   // newest first
        QSignalSpy reset(&m, &QAbstractItemModel::modelReset), ins(&m, &QAbstractItemModel::rowsInserted), changed(&m, &QAbstractItemModel::dataChanged);
        s.applyRooms({room("!r", "R", {msg("$3", "@a:x", "three", 3000)})});
        m.show("!r");
        QCOMPARE(reset.count(), 0); QCOMPARE(ins.count(), 1); QCOMPARE(ins.first().at(1).toInt(), 0);
        QCOMPARE(m.data(m.index(0), TimelineModel::BodyRole).toString(), QString("three"));
        QVERIFY(changed.count() >= 1);   // the one before it is no longer the last of its run
    }
    void olderMessagesAreInsertedAtTheTopEndWithoutMovingTheRest() {
        Store s; s.setMe("@me:x"); TimelineModel m(&s); QAbstractItemModelTester check(&m);
        s.applyRooms({room("!r", "R", {msg("$5", "@a:x", "five", 5000)})}); m.show("!r");
        QSignalSpy reset(&m, &QAbstractItemModel::modelReset), ins(&m, &QAbstractItemModel::rowsInserted);
        s.applyHistory(QJsonObject{{"room", "!r"}, {"events", QJsonArray{msg("$1", "@a:x", "one", 1000), msg("$2", "@a:x", "two", 2000)}}, {"end", "t"}});
        m.show("!r");
        QCOMPARE(reset.count(), 0); QCOMPARE(m.rowCount(), 3); QCOMPARE(m.data(m.index(0), TimelineModel::BodyRole).toString(), QString("five"));
        QCOMPARE(m.data(m.index(2), TimelineModel::BodyRole).toString(), QString("one"));
        for (const auto &args : ins) QVERIFY(args.at(1).toInt() >= 1);      // nothing was put in front of the newest message
    }
    void anEditOnlyRedrawsThatRow() {
        Store s; s.setMe("@me:x"); TimelineModel m(&s); QAbstractItemModelTester check(&m);
        s.applyRooms({room("!r", "R", {msg("$1", "@me:x", "helo", 1000), msg("$2", "@a:x", "other", 2000)})}); m.show("!r");
        QSignalSpy reset(&m, &QAbstractItemModel::modelReset), ins(&m, &QAbstractItemModel::rowsInserted), rem(&m, &QAbstractItemModel::rowsRemoved), changed(&m, &QAbstractItemModel::dataChanged);
        QJsonObject edit = msg("$e", "@me:x", "* hello", 3000); edit["content"] = QJsonObject{{"msgtype", "m.text"}, {"body", "* hello"}, {"m.new_content", QJsonObject{{"body", "hello"}}}, {"m.relates_to", QJsonObject{{"rel_type", "m.replace"}, {"event_id", "$1"}}}};
        s.applyRooms({room("!r", "R", {edit})}); m.show("!r");
        QCOMPARE(reset.count() + ins.count() + rem.count(), 0); QCOMPARE(changed.count(), 1); QCOMPARE(changed.first().at(0).toModelIndex().row(), 1);
        QCOMPARE(m.data(m.index(1), TimelineModel::BodyRole).toString(), QString("hello")); QVERIFY(m.data(m.index(1), TimelineModel::EditedRole).toBool());
    }
    void switchingChatsStartsOver() {
        Store s; s.setMe("@me:x"); TimelineModel m(&s); QAbstractItemModelTester check(&m);
        s.applyRooms({room("!a", "A", {msg("$1", "@a:x", "in a", 1000)}), room("!b", "B", {msg("$2", "@a:x", "in b", 1000)})});
        m.show("!a"); QSignalSpy reset(&m, &QAbstractItemModel::modelReset); m.show("!b");
        QCOMPARE(reset.count(), 1); QCOMPARE(m.data(m.index(0), TimelineModel::BodyRole).toString(), QString("in b"));
    }
    void tickShowsSentDeliveredRead() {
        Store s; s.setMe("@me:x"); TimelineModel m(&s);
        QJsonObject o = room("!r", "R", {msg("$1", "@me:x", "a", 1000), msg("$2", "@me:x", "b", 2000)});
        s.applyRooms({o}); m.show("!r"); QCOMPARE(m.data(m.index(0), TimelineModel::TickRole).toInt(), 3);
        o = room("!r", "R", {}); o["ephemeral"] = QJsonArray{QJsonObject{{"type", "m.receipt"}, {"content", QJsonObject{{"$1", QJsonObject{{"m.read", QJsonObject{{"@maya:x", QJsonObject{{"ts", 5}}}}}}}}}}};
        s.applyRooms({o}); m.show("!r");
        QCOMPARE(m.data(m.index(1), TimelineModel::TickRole).toInt(), 5);      // $1 read
        QCOMPARE(m.data(m.index(0), TimelineModel::TickRole).toInt(), 3);      // $2 only sent
    }
    void theUnreadDividerAndRepliesAreResolved() {
        Store s; s.setMe("@me:x"); TimelineModel m(&s);
        QJsonObject reply = msg("$2", "@me:x", "answer", 2000); reply["content"] = QJsonObject{{"msgtype", "m.text"}, {"body", "answer"}, {"m.relates_to", QJsonObject{{"m.in_reply_to", QJsonObject{{"event_id", "$1"}}}}}};
        s.applyRooms({room("!r", "R", {msg("$1", "@maya:x", "question", 1000), reply})}); m.setUnreadBefore("$1"); m.show("!r");
        QVERIFY(m.data(m.index(1), TimelineModel::DividerRole).toBool()); QVERIFY(!m.data(m.index(0), TimelineModel::DividerRole).toBool());
        QCOMPARE(m.data(m.index(0), TimelineModel::ReplyTextRole).toString(), QString("question"));
    }
    void groupingGapAndBigEmojiFollowTheOptions() {
        Store s; s.setMe("@me:x"); TimelineModel m(&s);
        s.applyRooms({room("!r", "R", {msg("$1", "@a:x", "one", 0), msg("$2", "@a:x", "two", 8 * 60000), msg("$3", "@a:x", QString::fromUtf8("😀"), 9 * 60000)})});
        m.setOptions(5, true); m.show("!r");
        QVERIFY(m.data(m.index(1), TimelineModel::FirstRole).toBool()); QVERIFY(!m.data(m.index(0), TimelineModel::FirstRole).toBool()); QVERIFY(m.data(m.index(2), TimelineModel::LastRole).toBool());   // $2 and $3 are one run; $1 stands apart
        QVERIFY(m.data(m.index(0), TimelineModel::BigEmojiRole).toBool());
        m.setOptions(15, false); m.show("!r");
        QVERIFY(!m.data(m.index(2), TimelineModel::LastRole).toBool());     // 15 minutes: all three belong together
        QVERIFY(!m.data(m.index(0), TimelineModel::BigEmojiRole).toBool());
    }
    void hiddenNetworksAndUnreadFirstShapeTheList() {
        Store s; s.setMe("@me:x"); RoomListModel l(&s);
        QJsonObject wa = room("!w", "On WhatsApp", {msg("$1", "@x:y", "a", 3000)}); wa["state"] = QJsonArray{QJsonObject{{"type", "m.bridge"}, {"state_key", "x"}, {"content", QJsonObject{{"protocol", QJsonObject{{"id", "whatsapp"}}}}}}};
        QJsonObject quiet = room("!q", "Read one", {msg("$2", "@x:y", "b", 2000)}); QJsonObject unread = room("!u", "Unread one", {msg("$3", "@x:y", "c", 1000)}); unread["unread"] = 1;
        s.applyRooms({wa, quiet, unread});
        l.setOptions({"whatsapp"}, false); l.refresh(); QCOMPARE(l.rowCount(), 2);
        l.setOptions({}, true); l.refresh(); QCOMPARE(l.rowCount(), 3); QCOMPARE(l.data(l.index(0), RoomListModel::NameRole).toString(), QString("Unread one"));     // oldest, but unread: first
        l.setOptions({}, false); l.refresh(); QCOMPARE(l.data(l.index(0), RoomListModel::NameRole).toString(), QString("On WhatsApp"));
    }
    void filtersNarrowTheList() {
        Store s; s.setMe("@me:x"); RoomListModel l(&s);
        QJsonObject dm = room("!d", "Direct", {msg("$1", "@x:y", "they wrote last", 3000)});
        QJsonObject group = room("!g", "Group", {msg("$2", "@me:x", "I wrote last", 2000)}); group["member_count"] = 5;
        QJsonObject wa = room("!w", "WhatsApp one", {msg("$3", "@x:y", "hi", 1000)}); wa["state"] = QJsonArray{QJsonObject{{"type", "m.bridge"}, {"state_key", "x"}, {"content", QJsonObject{{"protocol", QJsonObject{{"id", "whatsapp"}}}, {"com.beeper.room_type", "dm"}}}}};
        s.applyRooms({dm, group, wa}); l.refresh(); QCOMPARE(l.rowCount(), 3);
        l.setFilters({{"groups", true}}, {}); QCOMPARE(l.rowCount(), 1); QCOMPARE(l.data(l.index(0), RoomListModel::NameRole).toString(), QString("Group"));
        l.setFilters({{"dms", true}}, {}); QCOMPARE(l.rowCount(), 2);
        l.setFilters({{"unanswered", true}}, {}); QCOMPARE(l.rowCount(), 2);                                // "Direct" and "WhatsApp one": they wrote last
        l.setFilters({{"network", "whatsapp"}}, {}); QCOMPARE(l.rowCount(), 1);
        l.setFilters({{"drafts", true}}, {"!g"}); QCOMPARE(l.rowCount(), 1); QCOMPARE(l.data(l.index(0), RoomListModel::NameRole).toString(), QString("Group"));
        l.setFilters({}, {}); QCOMPARE(l.rowCount(), 3);
    }
    void thePinsRowTakesPinnedChatsOutOfTheList() {
        Store s; s.setMe("@me:x"); RoomListModel l(&s);
        QJsonObject pinned = room("!p", "Pinned one", {msg("$1", "@x:y", "a", 1000)}); pinned["account_data"] = QJsonArray{QJsonObject{{"type", "m.tag"}, {"content", QJsonObject{{"tags", QJsonObject{{"m.favourite", QJsonObject{{"order", 1}}}}}}}}};
        s.applyRooms({pinned, room("!o", "Other", {msg("$2", "@x:y", "b", 2000)})});
        l.setExcludePinned(true); l.refresh(); QCOMPARE(l.rowCount(), 1); QCOMPARE(l.data(l.index(0), RoomListModel::NameRole).toString(), QString("Other"));
        l.setExcludePinned(false); l.refresh(); QCOMPARE(l.rowCount(), 2);
    }
    void roomListMovesRowsInsteadOfResetting() {
        Store s; s.setMe("@me:x"); RoomListModel l(&s); QAbstractItemModelTester check(&l);
        s.applyRooms({room("!a", "Alpha", {msg("$1", "@x:y", "a", 1000)}), room("!b", "Beta", {msg("$2", "@x:y", "b", 2000)}), room("!c", "Gamma", {msg("$3", "@x:y", "c", 3000)})});
        l.refresh(); QCOMPARE(l.data(l.index(0), RoomListModel::NameRole).toString(), QString("Gamma"));
        QSignalSpy reset(&l, &QAbstractItemModel::modelReset), moved(&l, &QAbstractItemModel::rowsMoved), ins(&l, &QAbstractItemModel::rowsInserted);
        s.applyRooms({room("!a", "Alpha", {msg("$4", "@x:y", "newest", 9000)})}); l.refresh();
        QCOMPARE(reset.count(), 0); QCOMPARE(moved.count(), 1); QCOMPARE(ins.count(), 0);
        QCOMPARE(l.data(l.index(0), RoomListModel::NameRole).toString(), QString("Alpha"));
        QCOMPARE(l.data(l.index(0), RoomListModel::PreviewRole).toString(), QString("newest"));
    }
    void tabsAndSearchFilterTheList() {
        Store s; s.setMe("@me:x"); RoomListModel l(&s);
        QJsonObject pinned = room("!p", "Pinned one", {msg("$1", "@x:y", "hello there", 1000)}); pinned["account_data"] = QJsonArray{QJsonObject{{"type", "m.tag"}, {"content", QJsonObject{{"tags", QJsonObject{{"m.favourite", QJsonObject{{"order", 1}}}}}}}}};
        QJsonObject arch = room("!a", "Old one", {msg("$2", "@x:y", "bye", 2000)}); arch["account_data"] = QJsonArray{QJsonObject{{"type", "m.tag"}, {"content", QJsonObject{{"tags", QJsonObject{{"u.archived", QJsonObject{}}}}}}}};
        QJsonObject unread = room("!u", "Unread one", {msg("$3", "@x:y", "ping", 3000)}); unread["unread"] = 2;
        s.applyRooms({pinned, arch, unread}); l.refresh();
        QCOMPARE(l.rowCount(), 2); QCOMPARE(l.data(l.index(0), RoomListModel::NameRole).toString(), QString("Pinned one"));   // pins first, archive hidden
        l.setFilter("unread", ""); QCOMPARE(l.rowCount(), 1);
        l.setFilter("archive", ""); QCOMPARE(l.rowCount(), 1); QCOMPARE(l.data(l.index(0), RoomListModel::NameRole).toString(), QString("Old one"));
        l.setFilter("inbox", "hello"); QCOMPARE(l.rowCount(), 1);     // found by what was said
        l.setFilter("inbox", "old"); QCOMPARE(l.rowCount(), 1);       // search also reaches archived chats
        l.setFilter("inbox", "zzz"); QCOMPARE(l.rowCount(), 0);
    }
};
QTEST_MAIN(ModelsTest)
#include "models_test.moc"
