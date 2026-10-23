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
};
