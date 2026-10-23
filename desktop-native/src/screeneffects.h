#pragma once
#include <QQuickPaintedItem>
#include <QTimer>
#include <QVector>
#include <QColor>

/// Full-screen message effects (confetti, hearts, balloons, snow, sparkles): purely local, drawn over the chat for a few seconds.
class ScreenEffects : public QQuickPaintedItem {
    Q_OBJECT
public:
    explicit ScreenEffects(QQuickItem *parent = nullptr);
    void paint(QPainter *p) override;
    /// Which effect (if any) a message's words call for: confetti, balloons, snow, sparkles or hearts.
    Q_INVOKABLE static QString effectFor(const QString &text);
    Q_INVOKABLE void play(const QString &effect);
    /// [{effect, name, glyph, says, examples}] for the "what sets off each effect" list.
    Q_INVOKABLE static QVariantList triggers();
private:
    struct P { double x, y, vx, vy, size, rot, vr, life, wobble; QColor color; QString glyph; };
    void tick();
    QVector<P> m_ps; QString m_effect; QTimer m_timer; qint64 m_start = 0;
};
