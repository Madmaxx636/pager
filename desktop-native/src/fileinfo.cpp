#include "fileinfo.h"
#include <QClipboard>
#include <QDesktopServices>
#include <QGuiApplication>
#include <QImageReader>
#include <QMimeData>
#include <QStandardPaths>
#include <QDir>
#include <QDateTime>
#include <QFile>
#include <QCoreApplication>
#include <QMimeDatabase>

QString FileInfo::mime(const QString &path) const { return QMimeDatabase().mimeTypeForFile(path).name(); }
QSize FileInfo::imageSize(const QString &path) const { QImageReader r(path); r.setAutoTransform(true); return r.size(); }
void FileInfo::open(const QString &path) const { QDesktopServices::openUrl(QUrl::fromLocalFile(path)); }
void FileInfo::openUrl(const QString &url) const { const QUrl u(url); if (u.scheme() == QLatin1String("https") || u.scheme() == QLatin1String("http")) QDesktopServices::openUrl(u); }
void FileInfo::copy(const QString &text) const { QGuiApplication::clipboard()->setText(text); }
bool FileInfo::clipboardHasImage() const { const QMimeData *m = QGuiApplication::clipboard()->mimeData(); return m && m->hasImage(); }
QString FileInfo::saveClipboardImage() const {
    const QImage img = QGuiApplication::clipboard()->image();
    if (img.isNull()) return {};
    const QString dir = QStandardPaths::writableLocation(QStandardPaths::CacheLocation) + QStringLiteral("/pasted"); QDir().mkpath(dir);
    const QString path = dir + QStringLiteral("/pasted-%1.png").arg(QDateTime::currentMSecsSinceEpoch());
    return img.save(path, "PNG") ? path : QString();
}
QString FileInfo::downloadsDir() const { const QString d = QStandardPaths::writableLocation(QStandardPaths::DownloadLocation); return d.isEmpty() ? QDir::homePath() : d; }
QString FileInfo::clipboardText() const { return QGuiApplication::clipboard()->text(); }
static QString autostartFile() { return QStandardPaths::writableLocation(QStandardPaths::GenericConfigLocation) + QStringLiteral("/autostart/pager-native.desktop"); }
bool FileInfo::autostart() const { return QFile::exists(autostartFile()); }
void FileInfo::setAutostart(bool on) const {
    if (!on) { QFile::remove(autostartFile()); return; }
    QDir().mkpath(QFileInfo(autostartFile()).path());
    QFile f(autostartFile());
    if (f.open(QIODevice::WriteOnly | QIODevice::Truncate)) f.write(QStringLiteral("[Desktop Entry]\nType=Application\nName=Pager\nExec=%1 --background\nIcon=pager-native\nX-GNOME-Autostart-enabled=true\n").arg(QCoreApplication::applicationFilePath()).toUtf8());
}
QString FileInfo::readText(const QString &path) const { QFile f(path); return f.open(QIODevice::ReadOnly) && f.size() < 4 * 1024 * 1024 ? QString::fromUtf8(f.readAll()) : QString(); }
bool FileInfo::writeText(const QString &path, const QString &text) const { QFile f(path); return f.open(QIODevice::WriteOnly | QIODevice::Truncate) && f.write(text.toUtf8()) >= 0; }
QString FileInfo::humanSize(double b) const { return b >= 1073741824 ? QString::number(b / 1073741824, 'f', 1) + QStringLiteral(" GB") : b >= 1048576 ? QString::number(b / 1048576, 'f', 1) + QStringLiteral(" MB") : b >= 1024 ? QString::number(qint64(b / 1024)) + QStringLiteral(" KB") : QString::number(qint64(b)) + QStringLiteral(" bytes"); }
