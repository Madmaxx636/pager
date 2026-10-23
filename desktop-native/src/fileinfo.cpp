#include <cmath>
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

QString FileInfo::tone(const QString &kind) const {
    const QString path = QStandardPaths::writableLocation(QStandardPaths::TempLocation) + QStringLiteral("/pager-%1.wav").arg(kind);
    if (QFile::exists(path)) return path;
    const int rate = 22050; const bool ring = kind == QLatin1String("ring");
    struct Tone { double f, t, d; };
    const QVector<Tone> tones = ring ? QVector<Tone>{{440, 0, 0.4}, {480, 0, 0.4}, {440, 0.5, 0.4}, {480, 0.5, 0.4}} : QVector<Tone>{{988, 0, 0.14}, {1319, 0.17, 0.14}, {988, 0.34, 0.14}, {1319, 0.51, 0.3}};
    const double total = ring ? 1.0 : 0.85; const int n = int(total * rate);
    QVector<qint16> pcm(n, 0);
    for (const Tone &t : tones) for (int i = int(t.t * rate); i < qMin(n, int((t.t + t.d) * rate)); ++i) {
        const double x = double(i) / rate - t.t, env = qMin(1.0, x / 0.02) * qMin(1.0, (t.d - x) / 0.03);
        const double w = std::sin(2 * M_PI * t.f * x); const double v = ring ? w : (w >= 0 ? 1.0 : -1.0) * 0.6;
        pcm[i] = qint16(qBound(-32767.0, double(pcm[i]) + v * env * 9000, 32767.0));
    }
    QFile f(path); if (!f.open(QIODevice::WriteOnly | QIODevice::Truncate)) return {};
    auto le32 = [](quint32 v) { QByteArray b(4, 0); for (int i = 0; i < 4; ++i) b[i] = char((v >> (8 * i)) & 255); return b; };
    auto le16 = [](quint16 v) { QByteArray b(2, 0); for (int i = 0; i < 2; ++i) b[i] = char((v >> (8 * i)) & 255); return b; };
    const quint32 bytes = quint32(n * 2);
    f.write("RIFF"); f.write(le32(36 + bytes)); f.write("WAVEfmt "); f.write(le32(16)); f.write(le16(1)); f.write(le16(1)); f.write(le32(rate)); f.write(le32(rate * 2)); f.write(le16(2)); f.write(le16(16));
    f.write("data"); f.write(le32(bytes)); f.write(reinterpret_cast<const char *>(pcm.constData()), bytes);
    return path;
}

#include "wallpaper.h"
QVariantList FileInfo::wallpapers() const { return Wallpaper::list(); }
QString FileInfo::importWallpaper(const QString &file, const QString &dir) const { return Wallpaper::importPhoto(file, dir); }

#include "sounds.h"
QVariantList FileInfo::sounds() const { return Sounds::list(); }
QString FileInfo::soundFile(const QString &id) const { return Sounds::file(id); }

#include "screeneffects.h"
QVariantList FileInfo::effectTriggers() const { return ScreenEffects::triggers(); }
