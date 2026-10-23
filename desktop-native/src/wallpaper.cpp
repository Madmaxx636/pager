#include "wallpaper.h"
#include <QDir>
#include <QPainter>
#include <QPainterPath>
#include <QRadialGradient>
#include <QLinearGradient>
#include <QRegularExpression>
#include <QUrl>
#include <cmath>

namespace {
struct Spec { char kind; QStringList a; };
struct Entry { const char *id, *name; Spec light, dark; };
const Entry kTable[] = {
    {"none", "None", {'N', {}}, {'N', {}}},
    {"dusk", "Dusk", {'B', {"#e9e1fa"}}, {'B', {"#1b1530"}}},
    {"forest", "Forest", {'B', {"#dceee3"}}, {'B', {"#0e2219"}}},
    {"ocean", "Ocean", {'B', {"#d9ecfa"}}, {'B', {"#0a1f33"}}},
    {"sand", "Sand", {'B', {"#f5ebda"}}, {'B', {"#2a2116"}}},
    {"graphite", "Graphite", {'B', {"#e3e6ea"}}, {'B', {"#1c1f24"}}},
    {"sunrise", "Sunrise", {'G', {"#ffe3cf", "#ffd0e0", "170"}}, {'G', {"#2c1620", "#3a1f12", "170"}}},
    {"lavender", "Lavender", {'G', {"#ece4ff", "#dbe9ff", "160"}}, {'G', {"#1e1838", "#12203a", "160"}}},
    {"mint", "Mint", {'G', {"#dcf7ec", "#e1f0ff", "160"}}, {'G', {"#0c2a22", "#0e2133", "160"}}},
    {"peach", "Peach", {'G', {"#ffe8dc", "#fff3d6", "160"}}, {'G', {"#2e1b14", "#2b2410", "160"}}},
    {"rosegold", "Rose gold", {'G', {"#fde4e4", "#f7e3cf", "160"}}, {'G', {"#321a1f", "#2c2013", "160"}}},
    {"steel", "Steel", {'G', {"#e6ebf1", "#cfd8e3", "160"}}, {'G', {"#1a2028", "#10151b", "160"}}},
    {"midnight", "Midnight sky", {'G', {"#d6dcf5", "#e9d9f5", "160"}}, {'G', {"#0a0f24", "#1a1038", "160"}}},
    {"lagoon", "Lagoon", {'G', {"#cdf0f0", "#d4e5ff", "140"}}, {'G', {"#07262b", "#0b1d3a", "140"}}},
    {"ember", "Ember", {'G', {"#ffe0d0", "#ffeccb", "120"}}, {'G', {"#2e100a", "#2f1f08", "120"}}},
    {"moss", "Moss", {'G', {"#e4efd3", "#d6ecdf", "160"}}, {'G', {"#162410", "#0e2419", "160"}}},
    {"aurora", "Aurora", {'M', {"#b9f2dc", "#c7d4ff", "#f1c9ff", "#f6f8ff"}}, {'M', {"#0f5a46", "#25306e", "#5a1f6e", "#080c18"}}},
    {"candy", "Candy", {'M', {"#ffc8dd", "#c8e7ff", "#fff1b8", "#fff8fb"}}, {'M', {"#6a1f45", "#1f4a6a", "#5f5214", "#14090f"}}},
    {"tropic", "Tropic", {'M', {"#b8f0e4", "#ffe2a8", "#ffc1c1", "#f9fffd"}}, {'M', {"#0d5a50", "#6a4b0c", "#6a1f1f", "#07120f"}}},
    {"dawn", "Dawn", {'M', {"#ffd6b8", "#d9c8ff", "#bfe3ff", "#fffaf5"}}, {'M', {"#6a3517", "#3a2a78", "#1a4a6a", "#0d0a12"}}},
    {"dots", "Dots", {'P', {"dots", "rgba(0,0,0,.09)"}}, {'P', {"dots", "rgba(255,255,255,.07)"}}},
    {"grid", "Grid", {'P', {"grid", "rgba(0,0,0,.07)"}}, {'P', {"grid", "rgba(255,255,255,.06)"}}},
    {"lines", "Diagonal lines", {'P', {"lines", "rgba(0,0,0,.07)"}}, {'P', {"lines", "rgba(255,255,255,.06)"}}},
    {"waves", "Waves", {'P', {"waves", "rgba(0,0,0,.08)"}}, {'P', {"waves", "rgba(255,255,255,.07)"}}},
    {"hex", "Honeycomb", {'P', {"hexes", "rgba(0,0,0,.08)"}}, {'P', {"hexes", "rgba(255,255,255,.07)"}}},
};

QColor rgba(const QString &s) {
    const QRegularExpression re(QStringLiteral("rgba\\((\\d+),(\\d+),(\\d+),([.\\d]+)\\)")); const auto m = re.match(s);
    return m.hasMatch() ? QColor(m.captured(1).toInt(), m.captured(2).toInt(), m.captured(3).toInt(), int(m.captured(4).toDouble() * 255)) : QColor(Qt::transparent);
}

QPixmap tile(const QString &kind, const QColor &c) {
    int size = kind == QLatin1String("dots") ? 18 : kind == QLatin1String("grid") ? 24 : kind == QLatin1String("lines") ? 24 : kind == QLatin1String("waves") ? 60 : 28;
    QPixmap pm(size, size); pm.fill(Qt::transparent);
    QPainter p(&pm); p.setRenderHint(QPainter::Antialiasing);
    if (kind == QLatin1String("dots")) { p.setPen(Qt::NoPen); p.setBrush(c); p.drawEllipse(QPointF(3, 3), 1.4, 1.4); }
    else if (kind == QLatin1String("grid")) { p.setPen(QPen(c, 1)); p.drawLine(QPointF(24, 0.5), QPointF(0.5, 0.5)); p.drawLine(QPointF(0.5, 0.5), QPointF(0.5, 24)); }
    else if (kind == QLatin1String("lines")) { p.setPen(QPen(c, 1.2)); p.drawLine(QPointF(-2, 2), QPointF(2, -2)); p.drawLine(QPointF(0, 24), QPointF(24, 0)); p.drawLine(QPointF(22, 26), QPointF(26, 22)); }
    else if (kind == QLatin1String("waves")) { p.setPen(QPen(c, 1.4)); p.setBrush(Qt::NoBrush); QPainterPath path(QPointF(0, 20)); path.quadTo(15, 5, 30, 20); path.quadTo(45, 35, 60, 20); p.drawPath(path); }
    else { p.setPen(QPen(c, 1)); p.setBrush(Qt::NoBrush); QPainterPath path(QPointF(14, 2)); path.lineTo(26, 9); path.lineTo(26, 23); path.lineTo(14, 30); path.lineTo(2, 23); path.lineTo(2, 9); path.closeSubpath(); p.drawPath(path); }
    return pm;
}
}

Wallpaper::Wallpaper(QQuickItem *parent) : QQuickPaintedItem(parent) { setAntialiasing(true); }

void Wallpaper::setPhoto(const QString &v) {
    if (v == m_photo) return;
    m_photo = v; m_image = v.isEmpty() ? QImage() : QImage(v.startsWith(QLatin1String("file://")) ? QUrl(v).toLocalFile() : v);
    emit changed(); update();
}

QVariantList Wallpaper::list() {
    QVariantList out; for (const Entry &e : kTable) out << QVariantMap{{"id", QString::fromLatin1(e.id)}, {"name", QString::fromUtf8(e.name)}};
    return out;
}

QString Wallpaper::importPhoto(const QString &from, const QString &dir, int maxSide) {
    QImage img(from.startsWith(QLatin1String("file://")) ? QUrl(from).toLocalFile() : from);
    if (img.isNull()) return {};
    if (qMax(img.width(), img.height()) > maxSide) img = img.scaled(maxSide, maxSide, Qt::KeepAspectRatio, Qt::SmoothTransformation);
    QDir().mkpath(dir); const QString path = dir + QStringLiteral("/wallpaper.jpg");
    return img.save(path, "JPG", 85) ? path : QString();
}

void Wallpaper::paint(QPainter *p) {
    const QRectF r(0, 0, width(), height());
    p->fillRect(r, m_bg);
    if (m_id == QLatin1String("custom") && !m_image.isNull()) {
        const QSizeF sz = m_image.size().scaled(r.size().toSize(), Qt::KeepAspectRatioByExpanding);
        p->setRenderHint(QPainter::SmoothPixmapTransform);
        p->drawImage(QRectF((r.width() - sz.width()) / 2, (r.height() - sz.height()) / 2, sz.width(), sz.height()), m_image);
    } else for (const Entry &e : kTable) if (m_id == QLatin1String(e.id)) {
        const Spec &s = m_dark ? e.dark : e.light;
        if (s.kind == 'B') { QLinearGradient g(0, 0, 0, r.height()); g.setColorAt(0, s.a[0]); g.setColorAt(1, m_bg); p->fillRect(r, g); }
        else if (s.kind == 'G') {
            const double th = s.a[2].toDouble() * M_PI / 180, sx = std::sin(th), sy = -std::cos(th), len = std::abs(r.width() * sx) + std::abs(r.height() * sy);
            const QPointF c = r.center(), d(sx * len / 2, sy * len / 2);
            QLinearGradient g(c - d, c + d); g.setColorAt(0, s.a[0]); g.setColorAt(1, s.a[1]); p->fillRect(r, g);
        } else if (s.kind == 'M') {
            p->fillRect(r, QColor(s.a[3]));
            struct Blob { double rx, ry, cx, cy; int color; };
            for (const Blob &b : {Blob{.60, .50, .15, .10, 0}, Blob{.55, .55, .90, .20, 1}, Blob{.70, .60, .50, 1.0, 2}}) {
                p->save(); p->translate(r.width() * b.cx, r.height() * b.cy); p->scale(r.width() * b.rx, r.height() * b.ry);
                QRadialGradient g(0, 0, 1); QColor c(s.a[b.color]); QColor t = c; t.setAlpha(0); g.setColorAt(0, c); g.setColorAt(1, t);
                p->fillRect(QRectF(-2, -2, 4, 4), g); p->restore();
            }
        } else if (s.kind == 'P') p->drawTiledPixmap(r, tile(s.a[0], rgba(s.a[1])));
        break;
    }
    if (m_dim > 0) p->fillRect(r, QColor(0, 0, 0, qBound(0, m_dim, 70) * 255 / 100));
}
