#include "appearance.h"
#include <QFile>
#include <QGuiApplication>
#include <QStyleHints>

namespace {
struct Accent { const char *name, *dark, *light, *onDark, *onLight; };
const Accent kAccents[] = {{"teal", "#2dd4bf", "#0d9488", "#04201c", "#ffffff"}, {"blue", "#60a5fa", "#2563eb", "#061a38", "#ffffff"}, {"purple", "#c4a1ff", "#7c3aed", "#1e0b3d", "#ffffff"},
                           {"pink", "#f9a8d4", "#db2777", "#3b0a23", "#ffffff"}, {"orange", "#fdba74", "#ea580c", "#3a1a04", "#ffffff"}, {"green", "#86efac", "#16a34a", "#062b12", "#ffffff"}, {"red", "#fca5a5", "#dc2626", "#3b0a0a", "#ffffff"}};
QColor inkFor(const QColor &c) { return (0.299 * c.redF() + 0.587 * c.greenF() + 0.114 * c.blueF()) > 0.6 ? QColor("#0b0b0b") : QColor("#ffffff"); }
}

Appearance::Appearance(AppSettings *settings, QObject *parent, const QByteArray &palettesTsv) : QObject(parent), m_settings(settings) {
    QByteArray tsv = palettesTsv;
    if (tsv.isEmpty()) { QFile f(QStringLiteral(":/palettes.tsv")); if (f.open(QIODevice::ReadOnly)) tsv = f.readAll(); }
    for (const QByteArray &line : tsv.split('\n')) {
        const QList<QByteArray> p = line.split('\t');
        if (p.size() < 12) continue;
        auto s = [&](int i) { return QString::fromUtf8(p[i]); };
        m_pals.append({s(0), s(1), s(2), p[3] == "1", QColor(s(4)), QColor(s(5)), QColor(s(6)), QColor(s(7)), QColor(s(8)), QColor(s(9)), QColor(s(10)), QColor(s(11))});
    }
    if (!QGuiApplication::instance() || m_settings->file().isEmpty()) m_systemDark = false;
    else if (auto *hints = QGuiApplication::styleHints()) {
        m_systemDark = hints->colorScheme() == Qt::ColorScheme::Dark;
        connect(hints, &QStyleHints::colorSchemeChanged, this, [this](Qt::ColorScheme s) { setSystemDark(s == Qt::ColorScheme::Dark); });
    }
    connect(m_settings, &AppSettings::valueChanged, this, [this](const QString &k) { if (k == QLatin1String("themeMode") || k == QLatin1String("accent") || k == QLatin1String("accentCustom") || k == QLatin1String("palette") || k == QLatin1String("fontScale") || k == QLatin1String("uiScale")) recompute(); });
    recompute();
}

void Appearance::recompute() {
    const Pal *pal = nullptr;
    m_mode = m_settings->value(QStringLiteral("themeMode")).toString();
    const QString acc = m_settings->value(QStringLiteral("accent")).toString();
    m_accent = acc == QLatin1String("custom") ? m_settings->value(QStringLiteral("accentCustom")).toString() : acc;
    m_palette = m_settings->value(QStringLiteral("palette")).toString(); if (m_palette == QLatin1String("none")) m_palette.clear();
    const QString ui = m_settings->value(QStringLiteral("uiScale")).toString();
    m_scale = qBound(0.8, m_settings->value(QStringLiteral("fontScale")).toDouble(), 1.6) * (ui == QLatin1String("small") ? 0.92 : ui == QLatin1String("large") ? 1.12 : 1.0);
    for (const Pal &p : m_pals) if (p.id == m_palette) pal = &p;
    if (pal) {
        m_dark = pal->dark;
        m_c = {pal->bg, pal->panel, pal->panel2, pal->line, pal->text, pal->muted, pal->accent, inkFor(pal->accent), pal->theirs};
    } else {
        m_dark = m_mode == QLatin1String("dark") || m_mode == QLatin1String("black") || (m_mode == QLatin1String("system") && m_systemDark);
        // the same colours as the web app
        if (m_mode == QLatin1String("black")) m_c = {QColor("#000000"), QColor("#0a0a0a"), QColor("#161616"), QColor("#1d1d1d"), QColor("#e8ecf2"), QColor("#8b95a5"), {}, {}, QColor("#121212")};
        else if (m_dark) m_c = {QColor("#0b0e13"), QColor("#12161d"), QColor("#1c222c"), QColor("#232a35"), QColor("#e8ecf2"), QColor("#8b95a5"), {}, {}, QColor("#161b23")};
        else m_c = {QColor("#f2f4f7"), QColor("#ffffff"), QColor("#e9ecf1"), QColor("#e1e5ec"), QColor("#111418"), QColor("#5f6b7a"), {}, {}, QColor("#ffffff")};
        QColor a, ink; bool known = false;
        for (const Accent &x : kAccents) if (m_accent == QLatin1String(x.name)) { a = QColor(m_dark ? x.dark : x.light); ink = QColor(m_dark ? x.onDark : x.onLight); known = true; }
        if (!known) { a = QColor(m_accent); if (a.isValid()) ink = inkFor(a); }
        if (!a.isValid()) { a = QColor(m_dark ? "#2dd4bf" : "#0d9488"); ink = QColor(m_dark ? "#04201c" : "#ffffff"); }
        m_c.accent = a; m_c.ink = ink;
    }
    emit changed();
}

void Appearance::setMode(const QString &mode) {
    if (mode != QLatin1String("system") && mode != QLatin1String("light") && mode != QLatin1String("dark") && mode != QLatin1String("black")) return;
    m_settings->set(QStringLiteral("palette"), QStringLiteral("none"));            // choosing a mode goes back to your own mix, like the other apps
    m_settings->set(QStringLiteral("themeMode"), mode);
    recompute();
}
void Appearance::setAccent(const QString &nameOrHex) {
    bool known = QColor(nameOrHex).isValid() && nameOrHex.startsWith(QLatin1Char('#'));
    for (const Accent &x : kAccents) if (nameOrHex == QLatin1String(x.name)) known = true;
    if (!known) return;
    m_settings->set(QStringLiteral("palette"), QStringLiteral("none"));
    if (nameOrHex.startsWith(QLatin1Char('#'))) { m_settings->set(QStringLiteral("accentCustom"), nameOrHex); m_settings->set(QStringLiteral("accent"), QStringLiteral("custom")); }
    else m_settings->set(QStringLiteral("accent"), nameOrHex);
    recompute();
}
void Appearance::setPalette(const QString &id) {
    if (!id.isEmpty()) { bool ok = false; for (const Pal &p : m_pals) ok |= p.id == id; if (!ok) return; }
    m_settings->set(QStringLiteral("palette"), id.isEmpty() ? QStringLiteral("none") : id);
    recompute();
}
void Appearance::setTextScale(qreal s) { m_settings->set(QStringLiteral("fontScale"), qBound(0.8, s, 1.6)); recompute(); }

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
