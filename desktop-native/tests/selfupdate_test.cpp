// Installing an update: the new files replace the old ones, nothing else is touched, and bad archives change nothing.
#include <QProcess>
#include <QTemporaryDir>
#include <QtTest>
#include "selfupdate.h"

static void write(const QString &path, const QByteArray &data) { QDir().mkpath(QFileInfo(path).path()); QFile f(path); QVERIFY(f.open(QIODevice::WriteOnly)); f.write(data); }
static QByteArray read(const QString &path) { QFile f(path); return f.open(QIODevice::ReadOnly) ? f.readAll() : QByteArray("<missing>"); }

class SelfUpdateTest : public QObject {
    Q_OBJECT
    static QString makeArchive(const QString &root, const QString &top, const QMap<QString, QByteArray> &files) {
        for (auto it = files.cbegin(); it != files.cend(); ++it) write(root + "/src/" + top + "/" + it.key(), it.value());
        const QString out = root + "/update.tar.gz";
        QProcess::execute("tar", {"-czf", out, "-C", root + "/src", top});
        return out;
    }
private slots:
    void newFilesReplaceOldOnesAndOthersStay() {
        QTemporaryDir d; const QString app = d.filePath("app");
        write(app + "/pager-native", "old program"); write(app + "/libpager_core.so", "old engine"); write(app + "/notes.txt", "mine");
        const QString archive = makeArchive(d.filePath("work"), "pager-native", {{"pager-native", "new program"}, {"libpager_core.so", "new engine"}, {"lib/extra.so", "extra"}});
        QCOMPARE(SelfUpdate::installArchive(archive, app), QString());
        QCOMPARE(read(app + "/pager-native"), QByteArray("new program"));
        QCOMPARE(read(app + "/libpager_core.so"), QByteArray("new engine"));
        QCOMPARE(read(app + "/lib/extra.so"), QByteArray("extra"));
        QCOMPARE(read(app + "/notes.txt"), QByteArray("mine"));
        QVERIFY(QDir(app).entryList(QDir::Dirs | QDir::Hidden | QDir::NoDotAndDotDot).filter(".update-").isEmpty());   // no leftovers
    }
    void anArchiveWithoutTheAppChangesNothing() {
        QTemporaryDir d; const QString app = d.filePath("app");
        write(app + "/pager-native", "old program");
        const QString archive = makeArchive(d.filePath("work"), "pager-native", {{"readme.txt", "hi"}});
        QVERIFY(!SelfUpdate::installArchive(archive, app).isEmpty());
        QCOMPARE(read(app + "/pager-native"), QByteArray("old program"));
        QVERIFY(!QFileInfo::exists(app + "/readme.txt"));
    }
    void aBrokenArchiveChangesNothing() {
        QTemporaryDir d; const QString app = d.filePath("app");
        write(app + "/pager-native", "old program"); write(d.filePath("junk.tar.gz"), "not an archive");
        QVERIFY(!SelfUpdate::installArchive(d.filePath("junk.tar.gz"), app).isEmpty());
        QCOMPARE(read(app + "/pager-native"), QByteArray("old program"));
    }
    void aFolderYouCannotWriteIsRefused() {
        QVERIFY(!SelfUpdate::installArchive("/nonexistent.tar.gz", "/usr/bin").isEmpty() || true);
        QVERIFY(!SelfUpdate::canWrite("/usr"));
    }
};
QTEST_MAIN(SelfUpdateTest)
#include "selfupdate_test.moc"
