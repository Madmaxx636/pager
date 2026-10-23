// Tests of the store: how events from the engine become messages, reactions, edits and previews. No screen needed.
#include <QJsonDocument>
#include <QtTest>
#include "store.h"

static QJsonObject msg(const QString &id, const QString &who, const QString &body, qint64 ts, const QJsonObject &extra = {}) {
    QJsonObject c{{"msgtype", "m.text"}, {"body", body}};
    for (auto it = extra.begin(); it != extra.end(); ++it) c.insert(it.key(), it.value());
    return QJsonObject{{"event_id", id}, {"type", "m.room.message"}, {"sender", who}, {"origin_server_ts", double(ts)}, {"content", c}};
}
static QJsonObject room(const QString &id, const QString &name, const QJsonArray &events) { return QJsonObject{{"id", id}, {"name", name}, {"events", events}}; }

class StoreTest : public QObject {
    Q_OBJECT
private slots:
    void messagesAreOrderedAndNotDuplicated() {
        Store s; s.setMe("@me:x");
        s.applyRooms({room("!r", "Maya", {msg("$2", "@maya:x", "second", 2000), msg("$1", "@maya:x", "first", 1000)})});
        s.applyRooms({room("!r", "Maya", {msg("$2", "@maya:x", "second", 2000)})});
        const Room *r = s.room("!r");
        QCOMPARE(r->msgs.size(), 2);
        QCOMPARE(r->msgs[0].body, QString("first"));
        QCOMPARE(r->preview(), QString("second"));
    }
    void editsReplaceTheTextOfTheirOwnMessageOnly() {
        Store s; s.setMe("@me:x");
        s.applyRooms({room("!r", "R", {msg("$1", "@maya:x", "helo", 1000)})});
        QJsonObject edit = msg("$e", "@maya:x", "* hello", 2000, {{"m.new_content", QJsonObject{{"body", "hello"}}}, {"m.relates_to", QJsonObject{{"rel_type", "m.replace"}, {"event_id", "$1"}}}});
        s.applyRooms({room("!r", "R", {edit})});
        QCOMPARE(s.room("!r")->msgs.size(), 1);
        QCOMPARE(s.room("!r")->msgs[0].body, QString("hello"));
        QVERIFY(s.room("!r")->msgs[0].edited);
        QJsonObject forged = msg("$f", "@evil:x", "* pwned", 3000, {{"m.new_content", QJsonObject{{"body", "pwned"}}}, {"m.relates_to", QJsonObject{{"rel_type", "m.replace"}, {"event_id", "$1"}}}});
        s.applyRooms({room("!r", "R", {forged})});
        QCOMPARE(s.room("!r")->msgs[0].body, QString("hello"));
    }
    void reactionsAddAndRedactionsRemoveThem() {
        Store s; s.setMe("@me:x");
        QJsonObject react{{"event_id", "$re"}, {"type", "m.reaction"}, {"sender", "@maya:x"}, {"origin_server_ts", 1500.0}, {"content", QJsonObject{{"m.relates_to", QJsonObject{{"rel_type", "m.annotation"}, {"event_id", "$1"}, {"key", "\U0001F44D"}}}}}};
        s.applyRooms({room("!r", "R", {msg("$1", "@me:x", "hi", 1000), react})});
        QCOMPARE(s.room("!r")->msgs[0].reactions.value("\U0001F44D").size(), 1);
        QJsonObject undo{{"event_id", "$rd"}, {"type", "m.room.redaction"}, {"sender", "@maya:x"}, {"redacts", "$re"}, {"origin_server_ts", 1600.0}, {"content", QJsonObject{}}};
        s.applyRooms({room("!r", "R", {undo})});
        QVERIFY(s.room("!r")->msgs[0].reactions.isEmpty());
    }
    void redactedMessagesDisappear() {
        Store s; s.setMe("@me:x");
        s.applyRooms({room("!r", "R", {msg("$1", "@maya:x", "oops", 1000)})});
        QJsonObject del{{"event_id", "$d"}, {"type", "m.room.redaction"}, {"sender", "@maya:x"}, {"redacts", "$1"}, {"origin_server_ts", 1100.0}, {"content", QJsonObject{}}};
        s.applyRooms({room("!r", "R", {del})});
        QVERIFY(s.room("!r")->msgs.isEmpty());
    }
    void lockedMessagesAreShownAsWaiting() {
        Store s; s.setMe("@me:x");
        QJsonObject enc{{"event_id", "$u"}, {"type", "m.room.encrypted"}, {"sender", "@maya:x"}, {"origin_server_ts", 1000.0}, {"locked", true}, {"content", QJsonObject{{"algorithm", "m.megolm.v1.aes-sha2"}}}};
        s.applyRooms({room("!r", "R", {enc})});
        QVERIFY(s.room("!r")->msgs[0].locked);
        QVERIFY(s.room("!r")->preview().contains("waiting", Qt::CaseInsensitive));
    }
    void aLockedMessageBecomesReadableOnceTheKeyArrives() {
        Store s; s.setMe("@me:x");
        QJsonObject enc{{"event_id", "$u"}, {"type", "m.room.encrypted"}, {"sender", "@maya:x"}, {"origin_server_ts", 1000.0}, {"locked", true}, {"content", QJsonObject{{"algorithm", "m.megolm.v1.aes-sha2"}}}};
        s.applyRooms({room("!r", "R", {enc})});
        s.applyHistory(QJsonObject{{"room", "!r"}, {"events", QJsonArray{msg("$u", "@maya:x", "now readable", 1000)}}});
        QCOMPARE(s.room("!r")->msgs.size(), 1);
        QVERIFY(!s.room("!r")->msgs[0].locked);
        QCOMPARE(s.room("!r")->msgs[0].body, QString("now readable"));
    }
    void pollsCountVotesAndEnd() {
        Store s; s.setMe("@me:x");
        auto start = QJsonObject{{"event_id", "$p"}, {"type", "org.matrix.msc3381.poll.start"}, {"sender", "@maya:x"}, {"origin_server_ts", 1000.0}, {"content", QJsonObject{{"org.matrix.msc3381.poll.start", QJsonObject{
            {"kind", "org.matrix.msc3381.poll.disclosed"}, {"max_selections", 1}, {"question", QJsonObject{{"body", "Pizza?"}}},
            {"answers", QJsonArray{QJsonObject{{"id", "a1"}, {"org.matrix.msc1767.text", "Yes"}}, QJsonObject{{"id", "a2"}, {"org.matrix.msc1767.text", "No"}}}}}}}}};
        auto vote = [](const QString &id, const QString &who, const QString &ans, qint64 ts) { return QJsonObject{{"event_id", id}, {"type", "org.matrix.msc3381.poll.response"}, {"sender", who}, {"origin_server_ts", double(ts)},
            {"content", QJsonObject{{"m.relates_to", QJsonObject{{"rel_type", "m.reference"}, {"event_id", "$p"}}}, {"org.matrix.msc3381.poll.response", QJsonObject{{"answers", QJsonArray{ans}}}}}}}; };
        s.applyRooms({room("!r", "R", {start, vote("$v1", "@maya:x", "a1", 2000), vote("$v2", "@me:x", "a2", 3000), vote("$v3", "@me:x", "a1", 2500)})});
        const Room *r = s.room("!r");
        QCOMPARE(r->msgs[0].kind, QString("poll"));
        QCOMPARE(r->msgs[0].poll.answers.size(), 2);
        QCOMPARE(r->votes.value("$p").value("@me:x"), QStringList{"a2"});      // the older vote did not win
        QCOMPARE(r->votes.value("$p").value("@maya:x"), QStringList{"a1"});
        auto end = [](const QString &who) { return QJsonObject{{"event_id", "$e" + who}, {"type", "org.matrix.msc3381.poll.end"}, {"sender", who}, {"origin_server_ts", 4000.0}, {"content", QJsonObject{{"m.relates_to", QJsonObject{{"rel_type", "m.reference"}, {"event_id", "$p"}}}}}}; };
        s.applyRooms({room("!r", "R", {end("@me:x")})});
        QVERIFY(!r->ended.contains("$p"));                                     // only the author can end it
        s.applyRooms({room("!r", "R", {end("@maya:x")})});
        QVERIFY(r->ended.contains("$p"));
    }
    void picturesAndFilesKeepWhatIsNeededToFetchThem() {
        Store s; s.setMe("@me:x");
        QJsonObject img{{"msgtype", "m.image"}, {"body", "cat.png"}, {"url", "mxc://x/abc"}, {"info", QJsonObject{{"w", 640}, {"h", 480}}}};
        s.applyRooms({room("!r", "R", {QJsonObject{{"event_id", "$i"}, {"type", "m.room.message"}, {"sender", "@maya:x"}, {"origin_server_ts", 1000.0}, {"content", img}}})});
        const Msg &m = s.room("!r")->msgs[0];
        QCOMPARE(m.kind, QString("image")); QCOMPARE(m.width, 640); QCOMPARE(m.height, 480);
        QCOMPARE(m.content.value("url").toString(), QString("mxc://x/abc"));
    }
    void bridgeStateTellsWhichNetworkAndKindOfChat() {
        Store s; s.setMe("@me:x");
        QJsonObject bridge{{"type", "m.bridge"}, {"state_key", "x"}, {"content", QJsonObject{{"protocol", QJsonObject{{"id", "whatsapp"}}}, {"com.beeper.room_type", "dm"}}}};
        QJsonObject member{{"type", "m.room.member"}, {"state_key", "@maya:x"}, {"content", QJsonObject{{"membership", "join"}, {"displayname", "Maya"}, {"avatar_url", "mxc://x/a"}}}};
        QJsonObject o = room("!r", "Maya", {}); o["state"] = QJsonArray{bridge, member}; o["member_count"] = 3;
        s.applyRooms({o});
        const Room *r = s.room("!r");
        QCOMPARE(r->network, QString("whatsapp")); QVERIFY(!r->isGroup());
        QCOMPARE(r->members.value("@maya:x"), QString("Maya")); QCOMPARE(r->memberAvatars.value("@maya:x"), QString("mxc://x/a"));
        o["state"] = QJsonArray{QJsonObject{{"type", "m.room.member"}, {"state_key", "@maya:x"}, {"content", QJsonObject{{"membership", "leave"}}}}};
        s.applyRooms({o}); QVERIFY(!r->joined.contains("@maya:x"));
    }
    void typingReceiptsTagsAndUnreadFlagsComeFromTheirOwnEvents() {
        Store s; s.setMe("@me:x");
        QJsonObject o = room("!r", "R", {msg("$1", "@me:x", "hi", 1000)});
        o["ephemeral"] = QJsonArray{QJsonObject{{"type", "m.typing"}, {"content", QJsonObject{{"user_ids", QJsonArray{"@maya:x", "@me:x"}}}}},
            QJsonObject{{"type", "m.receipt"}, {"content", QJsonObject{{"$1", QJsonObject{{"m.read", QJsonObject{{"@maya:x", QJsonObject{{"ts", 5000}}}}}}}}}}};
        o["account_data"] = QJsonArray{QJsonObject{{"type", "m.tag"}, {"content", QJsonObject{{"tags", QJsonObject{{"m.favourite", QJsonObject{{"order", 0.5}}}, {"u.archived", QJsonObject{}}, {"u.label.Work", QJsonObject{}}}}}}},
            QJsonObject{{"type", "m.marked_unread"}, {"content", QJsonObject{{"unread", true}}}}};
        s.applyRooms({o});
        const Room *r = s.room("!r");
        QCOMPARE(r->typing, QStringList{"@maya:x"});                       // never you
        QCOMPARE(r->receipts.value("@maya:x"), QString("$1")); QCOMPARE(r->receiptTs.value("@maya:x"), qint64(5000));
        QVERIFY(r->pinned() && r->archived() && !r->lowPriority()); QCOMPARE(r->labels(), QStringList{"Work"}); QCOMPARE(r->pinOrder, 0.5);
        QVERIFY(r->markedUnread);
    }
    void whatYouWroteOnYourPhoneCountsAsYours() {
        Store s; s.setMe("@me:x"); s.setOwnIdentity({"Lane McDonald"}, {});
        QJsonObject o = room("!r", "R", {msg("$1", "@wa_123:x", "from my phone", 1000)});
        o["state"] = QJsonArray{QJsonObject{{"type", "m.room.member"}, {"state_key", "@wa_123:x"}, {"content", QJsonObject{{"membership", "join"}, {"displayname", "Lane McDonald (WA)"}}}}};
        s.applyRooms({o});
        QVERIFY(s.mine(s.room("!r")->msgs[0]));
    }
    void deliveryReportsAndCaptionsAndStickers() {
        Store s; s.setMe("@me:x");
        QJsonObject status{{"event_id", "$st"}, {"type", "com.beeper.message_send_status"}, {"sender", "@bot:x"}, {"origin_server_ts", 2000.0}, {"content", QJsonObject{{"m.relates_to", QJsonObject{{"event_id", "$1"}}}, {"delivered_to", QJsonArray{"@maya:x"}}}}};
        QJsonObject img = msg("$i", "@maya:x", "look at this", 3000, {{"msgtype", "m.image"}, {"filename", "cat.png"}, {"url", "mxc://x/c"}, {"info", QJsonObject{{"w", 10}, {"h", 20}, {"mimetype", "image/png"}, {"size", 99}}}});
        QJsonObject stk{{"event_id", "$s"}, {"type", "m.sticker"}, {"sender", "@maya:x"}, {"origin_server_ts", 4000.0}, {"content", QJsonObject{{"body", "wave"}, {"url", "mxc://x/s"}, {"info", QJsonObject{{"w", 100}, {"h", 100}}}}}};
        s.applyRooms({room("!r", "R", {msg("$1", "@me:x", "hello", 1000), status, img, stk})});
        const Room *r = s.room("!r");
        QVERIFY(r->statusSeen); QCOMPARE(r->deliveredTo.value("$1"), QStringList{"@maya:x"});
        const Msg *m = r->find("$i");
        QCOMPARE(m->caption, QString("look at this")); QCOMPARE(m->body, QString("cat.png")); QCOMPARE(m->mime, QString("image/png")); QCOMPARE(m->size, qint64(99));
        QVERIFY(r->find("$s")->sticker); QCOMPARE(r->find("$s")->kind, QString("image"));
    }
    void aGapInTheSyncStartsTheChatAgain() {
        Store s; s.setMe("@me:x");
        s.applyRooms({room("!r", "R", {msg("$1", "@maya:x", "old", 1000)})});
        QJsonObject o = room("!r", "R", {msg("$9", "@maya:x", "new", 9000)}); o["limited"] = true; o["prev_batch"] = "tok";
        s.applyRooms({o});
        QCOMPARE(s.room("!r")->msgs.size(), 1); QCOMPARE(s.room("!r")->historyToken, QString("tok")); QVERIFY(!s.room("!r")->reachedStart);
    }
    void ourOwnEchoReplacesTheMessageShownAtOnce() {
        Store s; s.setMe("@me:x");
        s.applyRooms({room("!r", "R", {msg("$1", "@maya:x", "hello", 1000)})});
        s.addLocal("!r", "on my way");
        QCOMPARE(s.room("!r")->msgs.size(), 2);
        s.applyRooms({room("!r", "R", {msg("$2", "@me:x", "on my way", 5000)})});
        QCOMPARE(s.room("!r")->msgs.size(), 2);
        QVERIFY(!s.room("!r")->msgs.last().local);
    }
    void replyQuotesAreRemovedFromTheText() {
        Store s; s.setMe("@me:x");
        QJsonObject rel{{"m.relates_to", QJsonObject{{"m.in_reply_to", QJsonObject{{"event_id", "$1"}}}}}};
        s.applyRooms({room("!r", "R", {msg("$1", "@a:x", "what time?", 1000), msg("$2", "@b:x", "> <@a:x> what time?\n\n7 pm", 2000, rel)})});
        QCOMPARE(s.room("!r")->msgs[1].body, QString("7 pm"));
        QCOMPARE(s.room("!r")->msgs[1].replyTo, QString("$1"));
    }
    void historyFillsInOlderMessagesAndRemembersWhereItEnded() {
        Store s; s.setMe("@me:x");
        s.applyRooms({room("!r", "R", {msg("$9", "@a:x", "new", 9000)})});
        s.applyHistory(QJsonObject{{"room", "!r"}, {"events", QJsonArray{msg("$1", "@a:x", "old", 1000)}}, {"end", "tok1"}});
        QCOMPARE(s.room("!r")->msgs.size(), 2);
        QCOMPARE(s.room("!r")->msgs[0].body, QString("old"));
        QCOMPARE(s.room("!r")->historyToken, QString("tok1"));
        s.applyHistory(QJsonObject{{"room", "!r"}, {"events", QJsonArray{}}, {"end", ""}});
        QVERIFY(s.room("!r")->reachedStart);
    }
    void roomsAreOrderedByTheirNewestMessage() {
        Store s; s.setMe("@me:x");
        s.applyRooms({room("!old", "Old", {msg("$1", "@a:x", "a", 1000)}), room("!new", "New", {msg("$2", "@a:x", "b", 9000)})});
        QCOMPARE(s.order(), QStringList({"!new", "!old"}));
    }
};
QTEST_APPLESS_MAIN(StoreTest)
#include "store_test.moc"
