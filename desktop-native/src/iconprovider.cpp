#include "iconprovider.h"
#include <QFile>
#include <QImage>
#include <QPainter>
#include <QRegularExpression>
#include <QSvgRenderer>

QByteArray IconProvider::svgFor(const QString &name, const QString &rgb) {
    static const QRegularExpression safeName(QStringLiteral("^[a-z0-9-]+$")), safeColour(QStringLiteral("^[0-9a-fA-F]{6,8}$"));
    if (!safeName.match(name).hasMatch() || !safeColour.match(rgb).hasMatch()) return {};
    QFile f(QStringLiteral(":/icons/%1.svg").arg(name));
    if (!f.open(QIODevice::ReadOnly)) return {};
    QByteArray svg = f.readAll();
    svg.replace("#ffffff", ("#" + rgb.left(6)).toLatin1());
    return svg;
}

QImage IconProvider::requestImage(const QString &id, QSize *size, const QSize &requested) {
    const QStringList parts = id.split(QLatin1Char('/'));
    const QByteArray svg = svgFor(parts.value(0), parts.value(1));
    const int px = qMax(8, requested.width() > 0 ? requested.width() : 48);
    if (size) *size = QSize(px, px);
    QImage img(px, px, QImage::Format_ARGB32_Premultiplied);
    img.fill(Qt::transparent);
    if (svg.isEmpty()) return img;
    QSvgRenderer r(svg);
    QPainter p(&img); p.setRenderHint(QPainter::Antialiasing); r.render(&p);
    return img;
}
