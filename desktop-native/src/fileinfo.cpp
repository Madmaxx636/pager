#include "fileinfo.h"
#include <QClipboard>
#include <QDesktopServices>
#include <QGuiApplication>
#include <QImageReader>
#include <QMimeData>
#include <QStandardPaths>
#include <QDir>
#include <QDateTime>
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
