// The same rules as the other Pager apps decide what alerts you (ported from their tests).
#include <QtTest>
#include "appsettings.h"
#include "notifypolicy.h"

using namespace NotifyPolicy;
static Input msg() { Input m; m.roomId = "!a"; m.network = "signal"; m.text = "hi"; m.nowMin = 12 * 60; m.day = 2; return m; }
static QVariantMap S(const QVariantMap &o = {}) { QVariantMap s = AppSettings::defaults(); for (auto it = o.cbegin(); it != o.cend(); ++it) s.insert(it.key(), it.value()); return s; }

class PolicyTest : public QObject {
    Q_OBJECT
private slots:
    void showsOrdinaryMessagesByDefault() { const Decision d = decide(msg(), S()); QVERIFY(d.show); QVERIFY(!d.silent); }
    void masterSwitchOffHidesEverythingEvenMentions() { Input m = msg(); m.mentioned = true; QVERIFY(!decide(m, S({{"notifEnabled", false}})).show); }
    void mutedChatsOnlyBreakThroughForThingsAboutYou() {
        Input m = msg(); m.quiet = true; QVERIFY(!decide(m, S()).show);
        m.mentioned = true; QVERIFY(decide(m, S()).show); m.mentioned = false; m.replyToMe = true; QVERIFY(decide(m, S()).show);
    }
    void keywordsCountWholeWordsOnly() {
        QVERIFY(keywordHit("hey Lane!", {"lane"})); QVERIFY(!keywordHit("plane crash", {"lane"}));
        Input m = msg(); m.quiet = true; m.text = "lane, dinner?"; QVERIFY(decide(m, S({{"notifKeywords", QVariantList{"Lane"}}})).show);
    }
    void perNetworkModes() {
        const QVariantMap s = S({{"notifNetworkMode", QVariantMap{{"signal", "mentions"}, {"whatsapp", "none"}}}});
        Input m = msg(); QVERIFY(!decide(m, s).show); m.mentioned = true; QVERIFY(decide(m, s).show); m.network = "whatsapp"; QVERIFY(!decide(m, s).show);
        QVERIFY(!decide(msg(), S({{"notifMutedNetworks", QVariantList{"signal"}}})).show);
    }
    void perChatOverridesBeatNetworkAndScope() {
        QVERIFY(decide(msg(), S({{"notifNetworkMode", QVariantMap{{"signal", "none"}}}, {"notifChat", QVariantMap{{"!a", QVariantMap{{"mode", "all"}}}}}})).show);
        Input m = msg(); m.mentioned = true; QVERIFY(!decide(m, S({{"notifChat", QVariantMap{{"!a", QVariantMap{{"mode", "none"}}}}}})).show);
        QVERIFY(!decide(msg(), S({{"notifChat", QVariantMap{{"!a", QVariantMap{{"mode", "mentions"}}}}}})).show);
    }
    void scope() {
        Input g = msg(); g.isGroup = true; QVERIFY(!decide(g, S({{"notifScope", "dm_mentions"}})).show); g.mentioned = true; QVERIFY(decide(g, S({{"notifScope", "dm_mentions"}})).show);
        Input p = msg(); p.pinned = true; QVERIFY(decide(p, S({{"notifScope", "favorites"}})).show); QVERIFY(!decide(msg(), S({{"notifScope", "favorites"}})).show);
    }
    void quietHoursSilenceDaysRespectedBreakThroughAllowed() {
        const QVariantMap quiet = S({{"quietHoursEnabled", true}, {"quietStartMin", 22 * 60}, {"quietEndMin", 7 * 60}});
        Input night = msg(); night.nowMin = 23 * 60;
        Decision d = decide(night, quiet); QVERIFY(d.show); QVERIFY(d.silent);
        QVERIFY(!decide(msg(), quiet).silent);
        QVERIFY(!decide(night, S({{"quietHoursEnabled", true}, {"notifQuietDays", QVariantList{5, 6}}})).silent);
        night.pinned = true; QVERIFY(!decide(night, S({{"quietHoursEnabled", true}, {"notifQuietBreakThrough", true}})).silent);
    }
    void perChatSoundOffAndPreviewOverrides() {
        const Decision d = decide(msg(), S({{"notifChat", QVariantMap{{"!a", QVariantMap{{"sound", "off"}, {"preview", "hide"}}}}}}));
        QVERIFY(d.show); QVERIFY(d.silent); QCOMPARE(d.preview, QString("hidden"));
    }
    void doNotDisturbSilencesEverythingUnlessAllowed() {
        const QVariantMap dnd = S({{"dndUntil", 10000}});
        Input m = msg(); m.nowMs = 5000; QVERIFY(!decide(m, dnd).show); m.nowMs = 20000; QVERIFY(decide(m, dnd).show);
        m.nowMs = 5000; m.mentioned = true; QVERIFY(decide(m, S({{"dndUntil", 10000}, {"notifQuietBreakThrough", true}})).show);
    }
    void priorityChatsGetThroughAndSilentChatsShowQuietly() {
        const QVariantMap q = S({{"quietHoursEnabled", true}, {"dndUntil", 10000}, {"notifChat", QVariantMap{{"!a", QVariantMap{{"level", "priority"}}}}}});
        Input m = msg(); m.quiet = true; m.nowMin = 23 * 60; m.nowMs = 5000; const Decision d = decide(m, q); QVERIFY(d.show); QVERIFY(!d.silent);
        const Decision s = decide(msg(), S({{"notifChat", QVariantMap{{"!a", QVariantMap{{"level", "silent"}}}}}})); QVERIFY(s.show); QVERIFY(s.silent);
        QVERIFY(!decide(msg(), S({{"notifChat", QVariantMap{{"!a", QVariantMap{{"level", "priority"}, {"mode", "none"}}}}}})).show);
    }
    void directMessagesAndGroupsHaveOwnModes() {
        Input g = msg(); g.isGroup = true; QVERIFY(!decide(g, S({{"notifGroupMode", "mentions"}})).show); g.mentioned = true; QVERIFY(decide(g, S({{"notifGroupMode", "mentions"}})).show);
        Input g2 = msg(); g2.isGroup = true; QVERIFY(!decide(g2, S({{"notifGroupMode", "none"}})).show); QVERIFY(decide(msg(), S({{"notifGroupMode", "none"}})).show); QVERIFY(!decide(msg(), S({{"notifDirectMode", "none"}})).show);
    }
    void picksTheSoundChatThenNetworkThenApp() {
        QCOMPARE(decide(msg(), S()).sound, QString("chime"));
        QCOMPARE(decide(msg(), S({{"notifNetworkSound", QVariantMap{{"signal", "pop"}}}})).sound, QString("pop"));
        QCOMPARE(decide(msg(), S({{"notifNetworkSound", QVariantMap{{"signal", "pop"}}}, {"notifChat", QVariantMap{{"!a", QVariantMap{{"soundId", "knock"}}}}}})).sound, QString("knock"));
    }
};
QTEST_MAIN(PolicyTest)
#include "notifypolicy_test.moc"
