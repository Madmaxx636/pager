#include "selfupdate.h"
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QProcess>
#include <QTemporaryDir>

bool SelfUpdate::canWrite(const QString &appDir) { return QFileInfo(appDir).isWritable(); }

static QString moveInto(const QString &from, const QString &to) {
    QDir().mkpath(to);
    const QFileInfoList entries = QDir(from).entryInfoList(QDir::NoDotAndDotDot | QDir::AllEntries | QDir::Hidden);
    for (const QFileInfo &fi : entries) {
        const QString dest = to + QLatin1Char('/') + fi.fileName();
        if (fi.isDir() && !fi.isSymLink()) { const QString err = moveInto(fi.absoluteFilePath(), dest); if (!err.isEmpty()) return err; continue; }
        if (QFileInfo::exists(dest) || QFileInfo(dest).isSymLink()) QFile::remove(dest);      // unlinking a running program is fine; the old copy keeps running until it exits
        if (!QFile::rename(fi.absoluteFilePath(), dest)) return QStringLiteral("Couldn't replace %1.").arg(fi.fileName());
    }
    return {};
}

QString SelfUpdate::installArchive(const QString &archive, const QString &appDir) {
    QDir().mkpath(appDir);
    if (!canWrite(appDir)) return QStringLiteral("Pager can't write to %1 to install the update.").arg(appDir);
    QTemporaryDir stage(appDir + QStringLiteral("/.update-XXXXXX"));
    if (!stage.isValid()) return QStringLiteral("Couldn't make room for the update.");
    QProcess tar;
    tar.start(QStringLiteral("tar"), {QStringLiteral("-xzf"), archive, QStringLiteral("-C"), stage.path(), QStringLiteral("--strip-components=1"), QStringLiteral("--no-same-owner")});
    if (!tar.waitForFinished(120000) || tar.exitCode() != 0) return QStringLiteral("The update file couldn't be unpacked.");
    if (!QFileInfo::exists(stage.path() + QStringLiteral("/pager-native"))) return QStringLiteral("The update file doesn't contain the app.");
    return moveInto(stage.path(), appDir);
}
