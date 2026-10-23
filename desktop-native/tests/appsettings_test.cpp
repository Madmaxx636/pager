// Settings: defaults, kept between runs, shared as JSON, safe against nonsense.
#include <QTemporaryDir>
#include <QtTest>
#include "appsettings.h"

class SettingsTest : public QObject {
    Q_OBJECT
private slots:
    void startsWithTheSameDefaultsAsTheOtherApps() {
        AppSettings s; QCOMPARE(s.value("markdown").toBool(), true); QCOMPARE(s.value("groupGapMin").toInt(), 5); QCOMPARE(s.value("notifSoundId").toString(), QString("chime"));
        QCOMPARE(s.value("quickReactions").toList().size(), 6); QCOMPARE(s.value("quietStartMin").toInt(), 22 * 60);
    }
    void changesAreKeptTypedAndSaved() {
        QTemporaryDir d; const QString f = d.filePath("s.json");
        { AppSettings s(f); s.set("markdown", false); s.set("groupGapMin", 12.0); s.set("quickReactions", QVariantList{"a", "b"}); s.setEntry("notifChat", "!r", "mode", "mentions"); s.save(); }
        AppSettings t(f);
        QCOMPARE(t.value("markdown").toBool(), false); QCOMPARE(t.value("groupGapMin").toInt(), 12); QCOMPARE(t.value("quickReactions").toList().size(), 2);
        QCOMPARE(t.entry("notifChat", "!r").value("mode").toString(), QString("mentions"));
        t.setEntry("notifChat", "!r", "mode", "default"); QVERIFY(t.entry("notifChat", "!r").isEmpty());          // "default" removes the override
    }
    void unknownNamesAndBrokenFilesAreIgnored() {
        QTemporaryDir d; const QString f = d.filePath("s.json"); { QFile o(f); o.open(QIODevice::WriteOnly); o.write("{ not json"); }
        AppSettings s(f); QCOMPARE(s.value("markdown").toBool(), true);
        s.set("nonsense", 1); QVERIFY(!s.contains("nonsense"));
        QVERIFY(!s.importJson("[1,2]")); QVERIFY(!s.importJson("{\"nonsense\": 1}"));
    }
    void exportAndImportRoundTrip() {
        AppSettings a; a.set("themeMode", "dark"); a.set("notifKeywords", QVariantList{"lane"});
        AppSettings b; QVERIFY(b.importJson(a.exportJson()));
        QCOMPARE(b.value("themeMode").toString(), QString("dark")); QCOMPARE(b.value("notifKeywords").toList().size(), 1);
        b.reset(); QCOMPARE(b.value("themeMode").toString(), QString("system"));
    }
    void changesAreAnnounced() {
        AppSettings s; QSignalSpy spy(&s, &AppSettings::valueChanged);
        s.set("markdown", false); QCOMPARE(spy.count(), 1); QCOMPARE(spy.first().first().toString(), QString("markdown"));
        s.set("markdown", false); QCOMPARE(spy.count(), 1);              // no change, no signal
    }
};
QTEST_MAIN(SettingsTest)
#include "appsettings_test.moc"
