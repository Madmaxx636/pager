// Emoji search must behave like the other Pager apps (same data, same ranking rules).
#include <QFile>
#include <QtTest>
#include "emoji.h"

class EmojiTest : public QObject {
    Q_OBJECT
    QByteArray names() { QFile f(QStringLiteral(QT_TESTCASE_SOURCEDIR "/emoji-names.tsv")); if (!f.open(QIODevice::ReadOnly)) return {}; return f.readAll(); }
private slots:
    void findsByNameAndKeyword() {
        const QByteArray n = names(); QVERIFY(!n.isEmpty());
        QVERIFY(Emoji::searchIn(n, "fire").contains(QString::fromUtf8("🔥")));
        QVERIFY(Emoji::searchIn(n, "thumbs up").contains(QString::fromUtf8("👍")));
        QVERIFY(Emoji::searchIn(n, "laugh").contains(QString::fromUtf8("😂")));
        QVERIFY(Emoji::searchIn(n, "heart eyes").contains(QString::fromUtf8("😍")));
    }
    void needsEveryWordAndNothingForEmpty() {
        const QByteArray n = names();
        QVERIFY(Emoji::searchIn(n, "fire zzzznotaword").isEmpty());
        QVERIFY(Emoji::searchIn(n, "   ").isEmpty());
    }
    void nameStartingWithTheWordComesFirst() { QCOMPARE(Emoji::searchIn(names(), "pizza").first(), QString::fromUtf8("🍕")); }
};
QTEST_APPLESS_MAIN(EmojiTest)
#include "emoji_test.moc"
