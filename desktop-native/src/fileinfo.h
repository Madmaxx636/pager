#pragma once
#include <QObject>
#include <QSize>
#include <QUrl>

/// Small facts about a file the person picked: its path, kind and (for pictures) its size.
class FileInfo : public QObject {
    Q_OBJECT
public:
    using QObject::QObject;
    Q_INVOKABLE QString path(const QUrl &url) const { return url.toLocalFile(); }
    Q_INVOKABLE QString mime(const QString &path) const;
    Q_INVOKABLE QSize imageSize(const QString &path) const;
    /// Opens a downloaded file with whatever the desktop uses for it.
    Q_INVOKABLE void open(const QString &path) const;
    Q_INVOKABLE void openUrl(const QString &url) const;
    Q_INVOKABLE void copy(const QString &text) const;
    Q_INVOKABLE bool clipboardHasImage() const;
    /// Saves the picture on the clipboard as a PNG and returns its path (empty if none).
    Q_INVOKABLE QString saveClipboardImage() const;
    Q_INVOKABLE QString downloadsDir() const;
    Q_INVOKABLE QString clipboardText() const;
    /// Starts Pager when you log in (a launcher in the autostart folder).
    Q_INVOKABLE void setAutostart(bool on) const;
    Q_INVOKABLE bool autostart() const;
    /// Text of a small file (for importing settings); empty when it cannot be read.
    Q_INVOKABLE QString readText(const QString &path) const;
    Q_INVOKABLE bool writeText(const QString &path, const QString &text) const;
    Q_INVOKABLE QString humanSize(double bytes) const;
};
