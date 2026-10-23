#include "fileinfo.h"
#include <QDesktopServices>
#include <QImageReader>
#include <QMimeDatabase>

QString FileInfo::mime(const QString &path) const { return QMimeDatabase().mimeTypeForFile(path).name(); }
QSize FileInfo::imageSize(const QString &path) const { QImageReader r(path); r.setAutoTransform(true); return r.size(); }
void FileInfo::open(const QString &path) const { QDesktopServices::openUrl(QUrl::fromLocalFile(path)); }
