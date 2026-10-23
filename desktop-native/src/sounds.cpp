#include "sounds.h"
#include <QDir>
#include <QFile>
#include <QStandardPaths>
#include <QVector>
#include <cmath>

namespace {
struct Note { double f, t, d; const char *type; double g, slideTo; };
struct Recipe { const char *id; QVector<Note> notes; };
const QVector<Recipe> &recipes() {
    static const QVector<Recipe> r = {
    {"swoosh", {{380, 0, 0.16, "sine", 0.7, 1100}}},
    {"chime", {{880, 0, 0.18, "sine", 0.7, 0}, {1318.5, 0.12, 0.35, "sine", 0.7, 0}}},
    {"pop", {{520, 0, 0.09, "triangle", 0.9, 220}}},
    {"ding", {{1568, 0, 0.6, "sine", 0.6, 0}}},
    {"knock", {{160, 0, 0.07, "triangle", 1, 0}, {150, 0.12, 0.08, "triangle", 1, 0}}},
    {"bubble", {{400, 0, 0.16, "sine", 0.8, 900}}},
    {"pager", {{2093, 0, 0.09, "square", 0.45, 0}, {2093, 0.16, 0.09, "square", 0.45, 0}, {2093, 0.32, 0.09, "square", 0.45, 0}}},
    {"beepbeep", {{1760, 0, 0.13, "square", 0.45, 0}, {1760, 0.2, 0.13, "square", 0.45, 0}}},
    {"trill", {{1568, 0, 0.05, "square", 0.4, 0}, {2093, 0.055, 0.05, "square", 0.4, 0}, {1568, 0.11, 0.05, "square", 0.4, 0}, {2093, 0.165, 0.05, "square", 0.4, 0}, {1568, 0.22, 0.05, "square", 0.4, 0}, {2093, 0.275, 0.05, "square", 0.4, 0}}},
    {"twotone", {{1046.5, 0, 0.16, "triangle", 0.8, 0}, {1568, 0.17, 0.26, "triangle", 0.8, 0}}},
    {"sendblip", {{1200, 0, 0.07, "square", 0.35, 1900}}},
    {"tick", {{2600, 0, 0.035, "square", 0.35, 0}, {3300, 0.05, 0.035, "square", 0.3, 0}}},
    {"marimba", {{523.3, 0, 0.22, "triangle", 0.9, 0}, {659.3, 0.11, 0.22, "triangle", 0.9, 0}, {784, 0.22, 0.3, "triangle", 0.9, 0}}},
    {"xylophone", {{1318.5, 0, 0.12, "sine", 0.7, 0}, {1760, 0.1, 0.2, "sine", 0.7, 0}}},
    {"glass", {{2349, 0, 0.7, "sine", 0.45, 0}, {3136, 0.02, 0.5, "sine", 0.25, 0}}},
    {"droplet", {{1800, 0, 0.12, "sine", 0.8, 700}}},
    {"harp", {{523.3, 0, 0.4, "sine", 0.55, 0}, {659.3, 0.07, 0.4, "sine", 0.55, 0}, {784, 0.14, 0.4, "sine", 0.55, 0}, {1046.5, 0.21000000000000002, 0.4, "sine", 0.55, 0}}},
    {"radar", {{900, 0, 0.35, "sine", 0.5, 1500}, {900, 0.4, 0.35, "sine", 0.4, 1500}}},
    {"coin", {{988, 0, 0.08, "square", 0.35, 0}, {1319, 0.08, 0.4, "square", 0.35, 0}}},
    {"bell", {{1046.5, 0, 0.85, "sine", 0.5, 0}, {2093, 0, 0.6, "sine", 0.2, 0}, {2637, 0, 0.4, "sine", 0.12, 0}}},
    {"kalimba", {{784, 0, 0.35, "triangle", 0.7, 0}, {1046.5, 0.14, 0.45, "triangle", 0.7, 0}}},
    {"zap", {{2400, 0, 0.14, "sawtooth", 0.3, 200}}},
    {"doorbell", {{659.3, 0, 0.3, "sine", 0.7, 0}, {523.3, 0.35, 0.55, "sine", 0.7, 0}}},
    {"rise", {{392, 0, 0.12, "triangle", 0.7, 0}, {523.3, 0.1, 0.12, "triangle", 0.7, 0}, {659.3, 0.2, 0.12, "triangle", 0.7, 0}, {784, 0.3, 0.25, "triangle", 0.7, 0}}},
    {"fall", {{784, 0, 0.12, "triangle", 0.7, 0}, {659.3, 0.1, 0.12, "triangle", 0.7, 0}, {523.3, 0.2, 0.12, "triangle", 0.7, 0}, {392, 0.3, 0.25, "triangle", 0.7, 0}}},
    {"morse", {{880, 0, 0.06, "square", 0.35, 0}, {880, 0.12, 0.18, "square", 0.35, 0}, {880, 0.36, 0.06, "square", 0.35, 0}}},
    {"whistle", {{1400, 0, 0.3, "sine", 0.4, 2200}, {2200, 0.3, 0.15, "sine", 0.35, 1800}}},
    {"woodblock", {{900, 0, 0.05, "triangle", 1, 0}, {700, 0.15, 0.06, "triangle", 1, 0}}},
    {"soft", {{660, 0, 0.3, "sine", 0.5, 0}, {784, 0.09, 0.34, "sine", 0.4, 0}}},
    };
    return r;
}
const QVector<QPair<const char *, const char *>> &labels() {
    static const QVector<QPair<const char *, const char *>> l = {{"swoosh", "Swoosh"}, {"chime", "Chime"}, {"pop", "Pop"}, {"ding", "Ding"}, {"knock", "Knock"}, {"bubble", "Bubble"}, {"soft", "Soft"}, {"pager", "Pager (three beeps)"}, {"beepbeep", "Beep beep"}, {"trill", "Trill"}, {"twotone", "Two tone"}, {"sendblip", "Blip"}, {"tick", "Tick"}, {"marimba", "Marimba"}, {"xylophone", "Xylophone"}, {"glass", "Glass"}, {"droplet", "Droplet"}, {"harp", "Harp"}, {"radar", "Radar"}, {"coin", "Coin"}, {"bell", "Bell"}, {"kalimba", "Kalimba"}, {"zap", "Zap"}, {"doorbell", "Doorbell"}, {"rise", "Rise"}, {"fall", "Fall"}, {"morse", "Morse"}, {"whistle", "Whistle"}, {"woodblock", "Wood block"}};
    return l;
}
double wave(const QString &type, double phase) {          // phase in turns
    const double x = phase - std::floor(phase);
    if (type == QLatin1String("square")) return x < 0.5 ? 1.0 : -1.0;
    if (type == QLatin1String("triangle")) return 4 * std::abs(x - 0.5) - 1;
    if (type == QLatin1String("sawtooth")) return 2 * x - 1;
    return std::sin(2 * M_PI * x);
}
}

QVariantList Sounds::list() {
    QVariantList out; for (const auto &l : labels()) out << QVariant(QVariantList{QString::fromLatin1(l.first), QString::fromUtf8(l.second)});
    out << QVariant(QVariantList{QStringLiteral("custom"), QStringLiteral("Your own sound")});
    out << QVariant(QVariantList{QStringLiteral("none"), QStringLiteral("None")});
    return out;
}

QString Sounds::file(const QString &id) {
    const Recipe *rec = nullptr; for (const Recipe &r : recipes()) if (id == QLatin1String(r.id)) rec = &r;
    if (!rec) return {};
    const QString dir = QStandardPaths::writableLocation(QStandardPaths::TempLocation) + QStringLiteral("/pager-sounds"); QDir().mkpath(dir);
    const QString path = dir + QLatin1Char('/') + id + QStringLiteral(".wav");
    if (QFile::exists(path)) return path;
    const int rate = 22050; double total = 0; for (const Note &n : rec->notes) total = qMax(total, n.t + n.d + 0.05);
    const int count = int(total * rate); QVector<double> mix(count, 0.0);
    for (const Note &n : rec->notes) {
        const int start = int(n.t * rate), len = int((n.d + 0.05) * rate); double phase = 0;
        const double peak = qMax(0.0001, n.g * 0.5);
        for (int i = 0; i < len && start + i < count; ++i) {
            const double x = double(i) / rate;
            const double f = n.slideTo > 0 ? n.f * std::pow(n.slideTo / n.f, qMin(1.0, x / n.d)) : n.f;
            phase += f / rate;
            double env;
            if (x < 0.012) env = 0.0001 * std::pow(peak / 0.0001, x / 0.012);
            else if (x < n.d) env = peak * std::pow(0.0001 / peak, (x - 0.012) / qMax(0.001, n.d - 0.012));
            else env = 0;
            mix[start + i] += wave(QString::fromLatin1(n.type), phase) * env;
        }
    }
    QVector<qint16> pcm(count); for (int i = 0; i < count; ++i) pcm[i] = qint16(qBound(-1.0, mix[i] * 1.6, 1.0) * 32000);
    QFile f(path); if (!f.open(QIODevice::WriteOnly | QIODevice::Truncate)) return {};
    auto le32 = [](quint32 v) { QByteArray b(4, 0); for (int i = 0; i < 4; ++i) b[i] = char((v >> (8 * i)) & 255); return b; };
    auto le16 = [](quint16 v) { QByteArray b(2, 0); for (int i = 0; i < 2; ++i) b[i] = char((v >> (8 * i)) & 255); return b; };
    const quint32 bytes = quint32(count * 2);
    f.write("RIFF"); f.write(le32(36 + bytes)); f.write("WAVEfmt "); f.write(le32(16)); f.write(le16(1)); f.write(le16(1)); f.write(le32(rate)); f.write(le32(rate * 2)); f.write(le16(2)); f.write(le16(16));
    f.write("data"); f.write(le32(bytes)); f.write(reinterpret_cast<const char *>(pcm.constData()), bytes);
    return path;
}
