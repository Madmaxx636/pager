#include "screeneffects.h"
#include "effectwords.h"
#include <QDateTime>
#include <QPainter>
#include <QRandomGenerator>
#include <QRegularExpression>
#include <QVariantMap>
#include <cmath>

namespace {
double rnd(double a, double b) { return a + QRandomGenerator::global()->generateDouble() * (b - a); }
const QStringList kColors{"#ff5d73", "#ffb703", "#2dd4bf", "#60a5fa", "#c084fc", "#34d399", "#f472b6"};
bool has(const QString &t, std::initializer_list<const char *> needles) { for (const char *n : needles) if (t.contains(QString::fromUtf8(n))) return true; return false; }
}

ScreenEffects::ScreenEffects(QQuickItem *parent) : QQuickPaintedItem(parent) {
    setAcceptedMouseButtons(Qt::NoButton); m_timer.setInterval(16); connect(&m_timer, &QTimer::timeout, this, &ScreenEffects::tick);
}

QString ScreenEffects::effectFor(const QString &text) { return EffectWords::effectFor(text); }

QVariantList ScreenEffects::triggers() {
    auto row = [](const char *e, const char *n, const char *g, const char *says, std::initializer_list<const char *> ex) { QStringList l; for (const char *x : ex) l << QString::fromUtf8(x); return QVariant(QVariantMap{{"effect", e}, {"name", n}, {"glyph", QString::fromUtf8(g)}, {"says", says}, {"examples", l.join(QStringLiteral("  "))}}); };
    return {row("confetti", "Confetti", "🎉", "A message with a party emoji, or that says congrats.", {"🎉", "🎊", "🥳", "congrats", "congratulations"}),
            row("balloons", "Balloons", "🎈", "A balloon or cake emoji, or happy birthday.", {"🎈", "🎂", "happy birthday"}),
            row("snow", "Snow", "❄️", "A snow emoji, or let it snow.", {"❄️", "⛄", "☃️", "🌨", "let it snow"}),
            row("sparkles", "Sparkles", "✨", "A sparkle or star emoji.", {"✨", "🌟", "⭐", "🪄"}),
            row("hearts", "Hearts", "❤️", "Only hearts or loving faces, or the words love you.", {"❤️", "💕", "💖", "😍", "🥰", "i love you", "love you"})};
}

void ScreenEffects::play(const QString &effect) {
    const double w = width(), h = height(); if (w < 10 || h < 10) return;
    m_effect = effect; m_ps.clear();
    const int n = effect == QLatin1String("snow") ? 90 : effect == QLatin1String("confetti") ? 140 : 40;
    const QStringList hg{"❤️", "💕", "💖", "💗"};
    for (int i = 0; i < n; ++i) {
        P p{}; p.color = QColor(kColors[i % kColors.size()]); p.life = 1; p.wobble = rnd(0, 6.28);
        if (effect == QLatin1String("confetti")) { p.x = rnd(0, w); p.y = rnd(-h * 0.4, 0); p.vx = rnd(-1.5, 1.5); p.vy = rnd(2, 5); p.size = rnd(6, 11); p.rot = rnd(0, 6.28); p.vr = rnd(-0.2, 0.2); }
        else if (effect == QLatin1String("hearts")) { p.x = rnd(0, w); p.y = h + rnd(0, h * 0.5); p.vx = rnd(-0.5, 0.5); p.vy = rnd(-4.5, -2); p.size = rnd(18, 34); p.glyph = hg[i % 4]; }
        else if (effect == QLatin1String("balloons")) { p.x = rnd(0, w); p.y = h + rnd(0, h * 0.6); p.vx = rnd(-0.3, 0.3); p.vy = rnd(-3.2, -1.6); p.size = rnd(28, 44); p.glyph = QStringLiteral("🎈"); }
        else if (effect == QLatin1String("snow")) { p.x = rnd(0, w); p.y = rnd(-h, 0); p.vx = rnd(-0.6, 0.6); p.vy = rnd(1, 2.8); p.size = rnd(2, 5); p.color = Qt::white; }
        else { p.x = rnd(0, w); p.y = rnd(0, h); p.vy = rnd(-0.3, 0.3); p.size = rnd(10, 22); p.glyph = QStringLiteral("✨"); p.life = rnd(0.2, 1); }
        m_ps.append(p);
    }
    m_start = QDateTime::currentMSecsSinceEpoch(); m_timer.start();
}

void ScreenEffects::tick() {
    const double h = height(); bool alive = false;
    for (P &p : m_ps) {
        p.wobble += 0.06;
        p.x += p.vx + std::sin(p.wobble) * (m_effect == QLatin1String("snow") ? 0.5 : m_effect == QLatin1String("confetti") ? 0.9 : 0.6);
        p.y += p.vy; p.rot += p.vr;
        if (m_effect == QLatin1String("sparkles")) { p.life -= 0.012; if (p.life > 0) alive = true; continue; }
        if (m_effect == QLatin1String("hearts") || m_effect == QLatin1String("balloons")) { if (p.y > -60) alive = true; }
        else if (p.y < h + 20) alive = true;
    }
    if (!alive || QDateTime::currentMSecsSinceEpoch() - m_start > 6500) { m_timer.stop(); m_ps.clear(); }
    update();
}

void ScreenEffects::paint(QPainter *p) {
    if (m_ps.isEmpty()) return;
    p->setRenderHint(QPainter::Antialiasing);
    for (const P &q : m_ps) {
        if (m_effect == QLatin1String("sparkles") && q.life <= 0) continue;
        p->save(); p->translate(q.x, q.y); p->rotate(q.rot * 180 / M_PI);
        if (m_effect == QLatin1String("sparkles")) p->setOpacity(qMax(0.0, std::sin(q.life * M_PI)));
        if (!q.glyph.isEmpty()) { QFont f = p->font(); f.setPixelSize(int(q.size)); p->setFont(f); p->drawText(QRectF(-q.size, -q.size, q.size * 2, q.size * 2), Qt::AlignCenter, q.glyph); }
        else if (m_effect == QLatin1String("snow")) { p->setOpacity(0.85); p->setPen(Qt::NoPen); p->setBrush(q.color); p->drawEllipse(QPointF(0, 0), q.size, q.size); }
        else { p->setPen(Qt::NoPen); p->setBrush(q.color); p->drawRect(QRectF(-q.size / 2, -q.size / 4, q.size, q.size / 2)); }
        p->restore();
    }
}
