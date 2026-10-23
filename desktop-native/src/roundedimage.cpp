#include "roundedimage.h"
#include <QImageReader>
#include <QPainter>
#include <QPainterPath>
#include <QPointer>
#include <QThreadPool>

RoundedImage::RoundedImage(QQuickItem *parent) : QQuickPaintedItem(parent) { setAntialiasing(true); setOpaquePainting(false); }

void RoundedImage::setSource(const QString &s) {
    if (s == m_source) return;
    m_source = s; emit sourceChanged();
    const quint64 ticket = ++m_ticket;
    if (s.isEmpty()) { m_image = QImage(); setStatus(0); update(); return; }
    setStatus(1);
    QPointer<RoundedImage> self(this);
    const int side = m_maxSide;
    QThreadPool::globalInstance()->start([self, s, ticket, side] {
        QImageReader r(s); r.setAutoTransform(true);
        const QSize full = r.size();
        if (full.isValid() && (full.width() > side || full.height() > side)) r.setScaledSize(full.scaled(side, side, Qt::KeepAspectRatio));
        const QImage img = r.read();
        QMetaObject::invokeMethod(self.data(), [self, img, ticket] {
            if (!self || ticket != self->m_ticket) return;
            self->m_image = img; self->setStatus(img.isNull() ? 3 : 2); self->update();
        }, Qt::QueuedConnection);
    });
}

void RoundedImage::paint(QPainter *p) {
    if (m_image.isNull() || width() <= 0 || height() <= 0) return;
    p->setRenderHint(QPainter::Antialiasing); p->setRenderHint(QPainter::SmoothPixmapTransform);
    QPainterPath clip; const qreal r = qMin(m_radius, qMin(width(), height()) / 2); clip.addRoundedRect(QRectF(0, 0, width(), height()), r, r);
    p->setClipPath(clip);
    const QSizeF box(width(), height());
    const QSizeF scaled = m_image.size().scaled(box.toSize(), m_crop ? Qt::KeepAspectRatioByExpanding : Qt::KeepAspectRatio);
    p->drawImage(QRectF((box.width() - scaled.width()) / 2, (box.height() - scaled.height()) / 2, scaled.width(), scaled.height()), m_image);
}
