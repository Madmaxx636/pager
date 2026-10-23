#pragma once
#include <QString>

namespace EffectWords {
/// Which full-screen effect (confetti, balloons, snow, sparkles, hearts) the words of a message call for, or "".
QString effectFor(const QString &text);
}
