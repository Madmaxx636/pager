// Names must come out the same as in the other Pager apps.
#include <QtTest>
#include "names.h"

class NamesTest : public QObject {
    Q_OBJECT
private slots:
    void init() { Names::clear(); }
    void dropsNetworkTagsButKeepsRealParentheses() {
        QCOMPARE(Names::stripTag("Sam Rivera (WA)"), QString("Sam Rivera")); QCOMPARE(Names::stripTag("Sam (Signal)"), QString("Sam")); QCOMPARE(Names::stripTag("Sam (work)"), QString("Sam (work)"));
    }
    void recognisesPhoneNumbers() { QVERIFY(Names::isPhone("+1 (555) 123-4567")); QVERIFY(!Names::isPhone("Sam")); QVERIFY(!Names::isPhone("12345")); }
    void replacesABareNumberWithTheContactsName() {
        QVERIFY(Names::add({{"tel:+15551234567", "Alex Kim (WA)"}}));
        QCOMPARE(Names::pretty("+1 555-123-4567"), QString("Alex Kim")); QCOMPARE(Names::pretty("(555) 123 4567 (WA)"), QString("Alex Kim")); QCOMPARE(Names::pretty("+44 7700 900123"), QString("+44 7700 900123"));
        QVERIFY(!Names::add({{"5551234567", "Someone Else"}}));                 // a known number keeps its name...
        QVERIFY(Names::add({{"5551234567", "Someone Else"}}, true));            // ...unless your own contacts say otherwise
        QCOMPARE(Names::pretty("5551234567"), QString("Someone Else"));
    }
    void readsAVcardExport() {
        const QString v = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Jo Park\r\nTEL;TYPE=CELL:+1 555 987 6543\r\nTEL:555-000-1111\r\nEND:VCARD\r\nBEGIN:VCARD\r\nN:Lee;Kai;;;\r\nTEL:5552223333\r\nEND:VCARD";
        const auto got = Names::parseVcf(v);
        QCOMPARE(got.size(), 3); QCOMPARE(got[0].second, QString("Jo Park")); QCOMPARE(got[0].first, QString("+1 555 987 6543")); QCOMPARE(got[2].second, QString("Kai Lee"));
    }
    void theBookIsSavedAndLoaded() {
        const QString f = QDir::tempPath() + "/pager-names-test.json"; QFile::remove(f);
        Names::load(f); Names::add({{"5559998888", "Remembered Person"}}); Names::clear(); Names::load(f);
        QCOMPARE(Names::pretty("5559998888"), QString("Remembered Person")); QFile::remove(f);
    }
};
QTEST_APPLESS_MAIN(NamesTest)
#include "names_test.moc"
