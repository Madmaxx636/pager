#include "appearance.h"
#include <QFile>
#include <QGuiApplication>
#include <QStyleHints>

namespace {
struct Accent { const char *name, *dark, *light; };
const Accent kAccents[] = {{"teal", "#2dd4bf", "#0d9488"}, {"blue", "#60a5fa", "#2563eb"}, {"purple", "#c4a1ff", "#7c3aed"}, {"pink", "#f9a8d4", "#db2777"},
                           {"orange", "#fdba74", "#ea580c"}, {"green", "#86efac", "#16a34a"}, {"red", "#fca5a5", "#dc2626"}};
QColor inkFor(const QColor &c) { return (0.299 * c.redF() + 0.587 * c.greenF() + 0.114 * c.blueF()) > 0.6 ? QColor("#0b0b0b") : QColor("#ffffff"); }
}

Appearance::Appearance(QObject *parent, const QString &settingsFile, const QByteArray &palettesTsv) : QObject(parent) {
    m_settings.reset(settingsFile.isEmpty() ? new QSettings() : new QSettings(settingsFile, QSettings::IniFormat));
    QByteArray tsv = palettesTsv;
    if (tsv.isEmpty()) { QFile f(QStringLiteral(":/palettes.tsv")); if (f.open(QIODevice::ReadOnly)) tsv = f.readAll(); }
    for (const QByteArray &line : tsv.split('\n')) {
        const QList<QByteArray> p = line.split('\t');
        if (p.size() < 12) continue;
        auto s = [&](int i) { return QString::fromUtf8(p[i]); };
        m_pals.append({s(0), s(1), s(2), p[3] == "1", QColor(s(4)), QColor(s(5)), QColor(s(6)), QColor(s(7)), QColor(s(8)), QColor(s(9)), QColor(s(10)), QColor(s(11))});
    }
    m_mode = m_settings->value(QStringLiteral("look/mode"), m_mode).toString();
    m_accent = m_settings->value(QStringLiteral("look/accent"), m_accent).toString();
    m_palette = m_settings->value(QStringLiteral("look/palette")).toString();
    m_scale = qBound(0.8, m_settings->value(QStringLiteral("look/textScale"), 1.0).toDouble(), 1.6);
    if (!settingsFile.isEmpty()) m_systemDark = false;
    else if (auto *hints = QGuiApplication::styleHints()) {
        m_systemDark = hints->colorScheme() == Qt::ColorScheme::Dark;
        connect(hints, &QStyleHints::colorSchemeChanged, this, [this](Qt::ColorScheme s) { setSystemDark(s == Qt::ColorScheme::Dark); });
    }
    recompute();
}

void Appearance::recompute() {
    const Pal *pal = nullptr;
    for (const Pal &p : m_pals) if (p.id == m_palette) pal = &p;
    if (pal) {
        m_dark = pal->dark;
        m_c = {pal->bg, pal->panel, pal->panel2, pal->line, pal->text, pal->muted, pal->accent, inkFor(pal->accent), pal->theirs};
    } else {
        m_dark = m_mode == QLatin1String("dark") || m_mode == QLatin1String("black") || (m_mode == QLatin1String("system") && m_systemDark);
        if (m_mode == QLatin1String("black")) m_c = {QColor("#000000"), QColor("#0a0a0a"), QColor("#161616"), QColor("#1f1f1f"), QColor("#e8ecf2"), QColor("#8b95a5"), {}, {}, QColor("#161616")};
        else if (m_dark) m_c = {QColor("#0b0e13"), QColor("#12161d"), QColor("#1c222c"), QColor("#232a35"), QColor("#e8ecf2"), QColor("#8b95a5"), {}, {}, QColor("#1c222c")};
        else m_c = {QColor("#ffffff"), QColor("#f6f7f9"), QColor("#eceff3"), QColor("#e3e6ea"), QColor("#14171a"), QColor("#6b7480"), {}, {}, QColor("#eceff3")};
        QColor a;
        for (const Accent &x : kAccents) if (m_accent == QLatin1String(x.name)) a = QColor(m_dark ? x.dark : x.light);
        if (!a.isValid()) a = QColor(m_accent);
        if (!a.isValid()) a = QColor(m_dark ? "#2dd4bf" : "#0d9488");
        m_c.accent = a; m_c.ink = inkFor(a);
    }
    emit changed();
}

void Appearance::save() const {
    m_settings->setValue(QStringLiteral("look/mode"), m_mode); m_settings->setValue(QStringLiteral("look/accent"), m_accent);
    m_settings->setValue(QStringLiteral("look/palette"), m_palette); m_settings->setValue(QStringLiteral("look/textScale"), m_scale);
    m_settings->sync();
}

void Appearance::setMode(const QString &mode) {
    if (mode != QLatin1String("system") && mode != QLatin1String("light") && mode != QLatin1String("dark") && mode != QLatin1String("black")) return;
    m_mode = mode; m_palette.clear(); save(); recompute();       // choosing a mode goes back to your own mix, like the other apps
}
void Appearance::setAccent(const QString &nameOrHex) {
    bool known = QColor(nameOrHex).isValid() && nameOrHex.startsWith(QLatin1Char('#'));
    for (const Accent &x : kAccents) if (nameOrHex == QLatin1String(x.name)) known = true;
    if (!known) return;
    m_accent = nameOrHex; m_palette.clear(); save(); recompute();
}
void Appearance::setPalette(const QString &id) {
    if (!id.isEmpty()) { bool ok = false; for (const Pal &p : m_pals) ok |= p.id == id; if (!ok) return; }
    m_palette = id; save(); recompute();
}
void Appearance::setTextScale(qreal s) { m_scale = qBound(0.8, s, 1.6); save(); recompute(); }

QVariantList Appearance::palettes() const {
    QVariantList out;
    for (const Pal &p : m_pals) out << QVariantMap{{"id", p.id}, {"name", p.name}, {"group", p.group}, {"dark", p.dark}, {"bg", p.bg}, {"accent", p.accent}, {"line", p.line}, {"text", p.text}};
    return out;
}
QVariantList Appearance::accents() const {
    QVariantList out;
    for (const Accent &x : kAccents) out << QVariantMap{{"name", QString::fromLatin1(x.name)}, {"color", QColor(m_dark ? x.dark : x.light)}};
    return out;
}
