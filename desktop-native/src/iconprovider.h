#pragma once
#include <QQuickImageProvider>

/// Draws the line icons: image://icon/<name>/<rrggbb> is that icon in that colour at the size asked for (sharp at any size, and cheap: no graphics effects).
class IconProvider : public QQuickImageProvider {
public:
    IconProvider() : QQuickImageProvider(QQuickImageProvider::Image) {}
    QImage requestImage(const QString &id, QSize *size, const QSize &requestedSize) override;
    /// The SVG text of an icon with its colour set (empty when there is no such icon). Public for tests.
    static QByteArray svgFor(const QString &name, const QString &rgb);
};
