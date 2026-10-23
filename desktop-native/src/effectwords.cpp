#include "effectwords.h"
#include <QRegularExpression>

namespace {
bool has(const QString &t, std::initializer_list<const char *> needles) { for (const char *n : needles) if (t.contains(QString::fromUtf8(n))) return true; return false; }
}

QString EffectWords::effectFor(const QString &text) {
    const QString t = text.toLower();
    if (has(t, {"🎉", "🎊", "🥳", "congrats", "congratulations"})) return QStringLiteral("confetti");
    if (has(t, {"🎈", "happy birthday", "🎂"})) return QStringLiteral("balloons");
    if (has(t, {"❄️", "⛄", "☃️", "🌨", "let it snow"})) return QStringLiteral("snow");
    if (has(t, {"✨", "🌟", "⭐", "🪄"})) return QStringLiteral("sparkles");
    QString stripped = text; stripped.remove(QRegularExpression(QStringLiteral("\\s")));
    static const QRegularExpression hearts(QStringLiteral("^(?:❤️|💕|💖|💗|💘|😍|🥰|😘|♥️|💞|❤)+$"));
    if (!stripped.isEmpty() && stripped.size() <= 24 && hearts.match(stripped).hasMatch()) return QStringLiteral("hearts");
    if (has(t, {"i love you", "love you"})) return QStringLiteral("hearts");
    return {};
}

