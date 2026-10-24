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
    { QFile f(QStringLiteral(":/skins.tsv")); if (f.open(QIODevice::ReadOnly)) for (const QByteArray &line : f.readAll().split('\n')) {
        const QList<QByteArray> p = line.split('\t');
        if (p.size() < 12) continue;
        auto s = [&](int i) { return QString::fromUtf8(p[i]); };
        m_skins.append({s(0), s(1), s(2), s(3), p[4] == "1", QColor(s(5)), QColor(s(6)), QColor(s(7)), QColor(s(8)), QColor(s(9)), QColor(s(10)), p.size() > 12 && !p[12].isEmpty() ? QColor(s(12)) : QColor(), s(11).toInt()});
    } }
    if (!QGuiApplication::instance() || m_settings->file().isEmpty()) m_systemDark = false;
    else if (auto *hints = QGuiApplication::styleHints()) {
        m_systemDark = hints->colorScheme() == Qt::ColorScheme::Dark;
        connect(hints, &QStyleHints::colorSchemeChanged, this, [this](Qt::ColorScheme s) { setSystemDark(s == Qt::ColorScheme::Dark); });
    }
    connect(m_settings, &AppSettings::valueChanged, this, [this](const QString &k) { if (k == QLatin1String("themeMode") || k == QLatin1String("accent") || k == QLatin1String("accentCustom") || k == QLatin1String("palette") || k == QLatin1String("skin") || k == QLatin1String("skinAccent") || k == QLatin1String("fontScale") || k == QLatin1String("uiScale") || k == QLatin1String("fancyMotion") || k == QLatin1String("reduceMotion") || k == QLatin1String("themeFollowSystem")) recompute(); });
    recompute();
}

void Appearance::recompute() {
    const Pal *pal = nullptr;
    m_mode = m_settings->value(QStringLiteral("themeMode")).toString();
    const QString acc = m_settings->value(QStringLiteral("accent")).toString();
    m_accent = acc == QLatin1String("custom") ? m_settings->value(QStringLiteral("accentCustom")).toString() : acc;
    m_palette = m_settings->value(QStringLiteral("palette")).toString(); if (m_palette == QLatin1String("none")) m_palette.clear();
    m_motion = m_settings->value(QStringLiteral("fancyMotion")).toBool() && !m_settings->value(QStringLiteral("reduceMotion")).toBool();
    const QString ui = m_settings->value(QStringLiteral("uiScale")).toString();
    m_scale = qBound(0.8, m_settings->value(QStringLiteral("fontScale")).toDouble(), 1.6) * (ui == QLatin1String("small") ? 0.92 : ui == QLatin1String("large") ? 1.12 : 1.0);
    for (const Pal &p : m_pals) if (p.id == m_palette) pal = &p;
    m_skin = m_settings->value(QStringLiteral("skin")).toString(); m_skinAccent = m_settings->value(QStringLiteral("skinAccent")).toString();
    const Skin *skin = nullptr;
    if (m_skin != QLatin1String("default")) for (const Skin &k : m_skins) if (k.id == m_skin) skin = &k;
    if (!skin) m_skin.clear();
    if (skin) {      // a desktop style: its own colours, like the web app (the shapes of its buttons are not drawn)
        m_dark = skin->dark;
        const QColor acc = m_skinAccent.startsWith(QLatin1Char('#')) && QColor(m_skinAccent).isValid() ? QColor(m_skinAccent) : skin->accent;
        const QColor ink = (!m_skinAccent.isEmpty() || !skin->ink.isValid()) ? inkFor(acc) : skin->ink;
        const double t = 0.07;
        const QColor panel2(qRound((skin->bg.redF() * (1 - t) + skin->text.redF() * t) * 255), qRound((skin->bg.greenF() * (1 - t) + skin->text.greenF() * t) * 255), qRound((skin->bg.blueF() * (1 - t) + skin->text.blueF() * t) * 255));
        m_c = {skin->bg, skin->panel, panel2, skin->line, skin->text, skin->muted, acc, ink, skin->panel};
    } else if (pal) {
        m_dark = pal->dark;
        m_c = {pal->bg, pal->panel, pal->panel2, pal->line, pal->text, pal->muted, pal->accent, inkFor(pal->accent), pal->theirs};
    } else {
        m_dark = m_mode == QLatin1String("dark") || m_mode == QLatin1String("black") || (m_mode == QLatin1String("system") && m_systemDark && m_settings->value(QStringLiteral("themeFollowSystem")).toBool());
        // the same colours as the web app
        if (m_mode == QLatin1String("black")) m_c = {QColor("#000000"), QColor("#0a0a0a"), QColor("#161616"), QColor("#1d1d1d"), QColor("#e8ecf2"), QColor("#8b95a5"), {}, {}, QColor("#121212")};
        else if (m_dark) m_c = {QColor("#0b0e13"), QColor("#12161d"), QColor("#1c222c"), QColor("#232a35"), QColor("#e8ecf2"), QColor("#8b95a5"), {}, {}, QColor("#161b23")};
        else m_c = {QColor("#f2f4f7"), QColor("#ffffff"), QColor("#e9ecf1"), QColor("#e1e5ec"), QColor("#111418"), QColor("#5f6b7a"), {}, {}, QColor("#ffffff")};
        QColor a, ink; bool known = false;
        for (const Accent &x : kAccents) if (m_accent == QLatin1String(x.name)) { a = QColor(m_dark ? x.dark : x.light); ink = QColor(m_dark ? x.onDark : x.onLight); known = true; }
        if (!known) { a = QColor(m_accent); if (a.isValid()) ink = inkFor(a); }
        if (!a.isValid()) { a = QColor(m_dark ? "#2dd4bf" : "#0d9488"); ink = QColor(m_dark ? "#04201c" : "#ffffff"); }
        m_c.accent = a; m_c.ink = ink;
        // like the web app: the accent is mixed into the surfaces, so it colours the whole app, not just the buttons
        auto mix = [&a](const QColor &base, int pct) { const double t = pct / 100.0; return QColor(qRound((base.redF() * (1 - t) + a.redF() * t) * 255), qRound((base.greenF() * (1 - t) + a.greenF() * t) * 255), qRound((base.blueF() * (1 - t) + a.blueF() * t) * 255)); };
        if (m_mode == QLatin1String("black")) { m_c.bg = mix(QColor("#000000"), 7); m_c.panel = mix(QColor("#0a0a0a"), 4); m_c.panel2 = mix(QColor("#161616"), 15); m_c.line = mix(QColor("#1d1d1d"), 14); m_c.theirs = mix(QColor("#121212"), 6); }
        else if (m_dark) { m_c.bg = mix(QColor("#0b0e13"), 7); m_c.panel = mix(QColor("#12161d"), 4); m_c.panel2 = mix(QColor("#1c222c"), 15); m_c.line = mix(QColor("#232a35"), 14); m_c.theirs = mix(QColor("#171c24"), 6); }
        else { m_c.bg = mix(QColor("#f2f4f7"), 7); m_c.panel = mix(QColor("#ffffff"), 4); m_c.panel2 = mix(QColor("#e9ecf1"), 15); m_c.line = mix(QColor("#e1e5ec"), 14); m_c.theirs = mix(QColor("#ffffff"), 6); }
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

void Appearance::setSkin(const QString &id) {
    if (!id.isEmpty() && id != QLatin1String("default")) { bool ok = false; for (const Skin &k : m_skins) ok |= k.id == id; if (!ok) return; }
    m_settings->set(QStringLiteral("skinAccent"), QString());
    m_settings->set(QStringLiteral("skin"), id.isEmpty() ? QStringLiteral("default") : id);
    recompute();
}
void Appearance::setSkinAccent(const QString &hex) { if (hex.isEmpty() || (hex.startsWith(QLatin1Char('#')) && QColor(hex).isValid())) { m_settings->set(QStringLiteral("skinAccent"), hex); recompute(); } }
QVariantList Appearance::skins() const {
    QVariantList out;
    for (const Skin &k : m_skins) out << QVariantMap{{"id", k.id}, {"name", k.name}, {"group", k.group}, {"family", k.family}, {"dark", k.dark}, {"bg", k.bg}, {"accent", k.accent}, {"line", k.line}};
    return out;
}
QStringList Appearance::skinGroups() const { QStringList g; for (const Skin &k : m_skins) if (!g.contains(k.group)) g << k.group; return g; }
QVariantList Appearance::skinAccents(const QString &id) const {
    static const QList<QPair<QString, QString>> gnome = {{"Blue", "#3584e4"}, {"Teal", "#2190a4"}, {"Green", "#3a944a"}, {"Yellow", "#c88800"}, {"Orange", "#ed5b00"}, {"Red", "#e62d42"}, {"Pink", "#d56199"}, {"Purple", "#9141ac"}, {"Slate", "#6f8396"}};
    static const QList<QPair<QString, QString>> plasma = {{"Breeze blue", "#3daee9"}, {"Red", "#da4453"}, {"Orange", "#f67400"}, {"Yellow", "#fdbc4b"}, {"Green", "#27ae60"}, {"Teal", "#1abc9c"}, {"Purple", "#9b59b6"}, {"Pink", "#e93a9a"}, {"Gray", "#7f8c8d"}};
    QVariantList out;
    for (const Skin &k : m_skins) if (k.id == id) {
        const auto &list = k.family == QLatin1String("adwaita") ? gnome : k.family == QLatin1String("breeze") ? plasma : QList<QPair<QString, QString>>();
        for (const auto &a : list) out << QVariantMap{{"name", a.first}, {"color", QColor(a.second)}};
    }
    return out;
}

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
