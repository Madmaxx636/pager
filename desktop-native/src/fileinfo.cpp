#include "fileinfo.h"
#include <QClipboard>
#include <QDesktopServices>
#include <QGuiApplication>
#include <QImageReader>
#include <QMimeDatabase>

QString FileInfo::mime(const QString &path) const { return QMimeDatabase().mimeTypeForFile(path).name(); }
QSize FileInfo::imageSize(const QString &path) const { QImageReader r(path); r.setAutoTransform(true); return r.size(); }
void FileInfo::open(const QString &path) const { QDesktopServices::openUrl(QUrl::fromLocalFile(path)); }
void FileInfo::openUrl(const QString &url) const { const QUrl u(url); if (u.scheme() == QLatin1String("https") || u.scheme() == QLatin1String("http")) QDesktopServices::openUrl(u); }
void FileInfo::copy(const QString &text) const { QGuiApplication::clipboard()->setText(text); }
