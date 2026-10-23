#pragma once
#include <QColor>
#include <QImage>
#include <QQuickPaintedItem>
#include <QVariantList>

/// A chat wallpaper, drawn here (gradients and quiet patterns, same set as the web app) or from your own photo. Nothing to download.
class Wallpaper : public QQuickPaintedItem {
    Q_OBJECT
    Q_PROPERTY(QString wallpaper READ wallpaper WRITE setWallpaper NOTIFY changed)   // an id from list(), "custom" for your photo, "none"
    Q_PROPERTY(bool dark READ dark WRITE setDark NOTIFY changed)
    Q_PROPERTY(QColor bg READ bg WRITE setBg NOTIFY changed)                          // the app's background colour (some wallpapers fade into it)
    Q_PROPERTY(int dim READ dim WRITE setDim NOTIFY changed)                          // percent of black laid over it
    Q_PROPERTY(QString photo READ photo WRITE setPhoto NOTIFY changed)                // the file of your own photo
public:
    explicit Wallpaper(QQuickItem *parent = nullptr);
    QString wallpaper() const { return m_id; } void setWallpaper(const QString &v) { if (v != m_id) { m_id = v; emit changed(); update(); } }
    bool dark() const { return m_dark; } void setDark(bool v) { if (v != m_dark) { m_dark = v; emit changed(); update(); } }
    QColor bg() const { return m_bg; } void setBg(const QColor &v) { if (v != m_bg) { m_bg = v; emit changed(); update(); } }
    int dim() const { return m_dim; } void setDim(int v) { if (v != m_dim) { m_dim = v; emit changed(); update(); } }
    QString photo() const { return m_photo; } void setPhoto(const QString &v);
    void paint(QPainter *p) override;
    /// [{id, name}] of the wallpapers made in the app.
    Q_INVOKABLE static QVariantList list();
    /// Shrinks a picture to at most [maxSide] px and keeps it as the wallpaper photo in [dir]; returns the file ("" when it could not be read).
    Q_INVOKABLE static QString importPhoto(const QString &from, const QString &dir, int maxSide = 1920);
signals:
    void changed();
private:
    QString m_id = QStringLiteral("none"), m_photo; bool m_dark = false; QColor m_bg = Qt::white; int m_dim = 0; QImage m_image;
};
