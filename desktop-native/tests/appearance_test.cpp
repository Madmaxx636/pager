// The look: modes, ready-made palettes, accents and text size, and that the choice is remembered.
#include <QFile>
#include <QTemporaryDir>
#include <QtTest>
#include "appearance.h"
#include "appsettings.h"

class AppearanceTest : public QObject {
    Q_OBJECT
    QByteArray pals() { QFile f(QStringLiteral(QT_TESTCASE_SOURCEDIR "/palettes.tsv")); return f.open(QIODevice::ReadOnly) ? f.readAll() : QByteArray(); }
private slots:
    void followsTheSystemUntilToldOtherwise() {
        QTemporaryDir d; AppSettings st(d.filePath("s.json")); Appearance a(&st, nullptr, pals());
        QVERIFY(!a.dark());
        a.setSystemDark(true); QVERIFY(a.dark());
        a.setMode("light"); QVERIFY(!a.dark());
        a.setMode("black"); QVERIFY(a.dark()); QCOMPARE(a.bg(), QColor("#030f0d"));          // black, with 7% of the accent mixed in like the web app
        a.setMode("nonsense"); QCOMPARE(a.mode(), QString("black"));
    }
    void accentsAndReadableText() {
        QTemporaryDir d; AppSettings st(d.filePath("s.json")); Appearance a(&st, nullptr, pals());
        a.setAccent("blue"); QCOMPARE(a.accent(), QColor("#2563eb")); QCOMPARE(a.accentInk(), QColor("#ffffff"));
        a.setAccent("#ffee00"); QCOMPARE(a.accent(), QColor("#ffee00")); QCOMPARE(a.accentInk(), QColor("#0b0b0b"));   // dark text on a light accent
        a.setAccent("notacolour"); QCOMPARE(a.accentName(), QString("#ffee00"));
    }
    void readyMadeLooksReplaceTheMixUntilYouPickAMode() {
        QTemporaryDir d; AppSettings st(d.filePath("s.json")); Appearance a(&st, nullptr, pals());
        QVERIFY(a.palettes().size() > 30);
        a.setPalette("midnight"); QVERIFY(a.dark()); QCOMPARE(a.bg(), QColor("#0a1020")); QCOMPARE(a.accent(), QColor("#7aa2ff"));
        a.setPalette("doesnotexist"); QCOMPARE(a.palette(), QString("midnight"));
        a.setMode("light"); QVERIFY(a.palette().isEmpty()); QVERIFY(!a.dark());
    }
    void choicesAreRemembered() {
        QTemporaryDir d; const QString f = d.filePath("s.json");
        { AppSettings st(f); Appearance a(&st, nullptr, pals()); a.setMode("dark"); a.setAccent("pink"); a.setTextScale(1.3); st.save(); }
        AppSettings st2(f); Appearance b(&st2, nullptr, pals());
        QCOMPARE(b.mode(), QString("dark")); QCOMPARE(b.accentName(), QString("pink")); QCOMPARE(b.textScale(), 1.3);
        b.setTextScale(9); QCOMPARE(b.textScale(), 1.6);   // kept within sensible bounds
    }
};
QTEST_MAIN(AppearanceTest)
#include "appearance_test.moc"
