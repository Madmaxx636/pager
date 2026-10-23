#pragma once
#include <QImage>
#include <QQuickPaintedItem>

/// A picture from a file with rounded corners (a circle when the radius is half the size), scaled to cover or fit its box.
/// Loaded off the main thread and drawn with the painter, so it works the same with the graphics chip and without it (no shader effects needed).
class RoundedImage : public QQuickPaintedItem {
    Q_OBJECT
    Q_PROPERTY(QString source READ source WRITE setSource NOTIFY sourceChanged)
    Q_PROPERTY(qreal radius READ radius WRITE setRadius NOTIFY radiusChanged)
    Q_PROPERTY(bool crop READ crop WRITE setCrop NOTIFY cropChanged)          // true: fill the box (cutting the edges); false: show the whole picture
    Q_PROPERTY(int status READ status NOTIFY statusChanged)                    // 0 nothing, 1 loading, 2 ready, 3 failed
    Q_PROPERTY(int maxSide READ maxSide WRITE setMaxSide NOTIFY maxSideChanged) // the largest side (in pixels) worth keeping in memory
public:
    explicit RoundedImage(QQuickItem *parent = nullptr);
    QString source() const { return m_source; }
    void setSource(const QString &s);
    qreal radius() const { return m_radius; }
    void setRadius(qreal r) { if (r != m_radius) { m_radius = r; emit radiusChanged(); update(); } }
    bool crop() const { return m_crop; }
    void setCrop(bool c) { if (c != m_crop) { m_crop = c; emit cropChanged(); update(); } }
    int status() const { return m_status; }
    int maxSide() const { return m_maxSide; }
    void setMaxSide(int m) { if (m != m_maxSide) { m_maxSide = m; emit maxSideChanged(); } }
    void paint(QPainter *p) override;
signals:
    void sourceChanged(); void radiusChanged(); void cropChanged(); void statusChanged(); void maxSideChanged();
private:
    void setStatus(int s) { if (s != m_status) { m_status = s; emit statusChanged(); } }
    QString m_source; QImage m_image; qreal m_radius = 0; bool m_crop = true; int m_status = 0, m_maxSide = 1200; quint64 m_ticket = 0;
};
