#include "names.h"
#include <QJsonArray>
#include <algorithm>
#include <QFile>
#include <QHash>
#include <QJsonDocument>
#include <QJsonObject>
#include <QRegularExpression>

namespace Names {
static QHash<QString, QString> book;
static QString bookFile;
std::function<void()> onChange;

QString stripTag(const QString &name) {
    static const QRegularExpression tag(QStringLiteral("\\s*[(\\[]\\s*(?:wa|whatsapp|signal|sms|rcs|gm|gmessages|google messages|messenger|fb|facebook|ig|instagram|tg|telegram|dc|discord|slack|twitter|x|bsky|bluesky|li|linkedin|imessage)\\s*[)\\]]\\s*$"), QRegularExpression::CaseInsensitiveOption);
    QString n = name; n.remove(tag); return n.trimmed();
}
bool isPhone(const QString &name) {
    static const QRegularExpression like(QStringLiteral("^\\+?[\\d\\s().-]{7,20}$"));
    QString digits = name; digits.remove(QRegularExpression(QStringLiteral("\\D")));
    return like.match(name.trimmed()).hasMatch() && digits.size() >= 7;
}
QString phoneKey(const QString &number) {
    QString d = number; d.remove(QRegularExpression(QStringLiteral("\\D")));
    return d.size() >= 7 ? d.right(10) : QString();
}
QString lookup(const QString &number) { return book.value(phoneKey(number)); }
int size() { return book.size(); }
QString pretty(const QString &raw) {
    const QString n = stripTag(raw);
    if (isPhone(n)) { const QString found = lookup(n); return found.isEmpty() ? n : found; }
    return n.isEmpty() ? raw : n;
}
static QHash<QString, QPair<QString, QString>> own;     // phone key -> {number, name}: yours, to sync
QList<QPair<QString, QString>> ownRows() { QList<QPair<QString, QString>> out; for (const auto &p : own) out.append(p); std::sort(out.begin(), out.end()); return out; }
bool add(const QList<QPair<QString, QString>> &entries, bool override, bool mine) {
    bool changed = false, ownChanged = false;
    for (const auto &e : entries) {
        const QString k = phoneKey(e.first), nm = stripTag(e.second).trimmed();
        if (k.isEmpty() || nm.isEmpty() || isPhone(nm)) continue;
        if (mine && own.value(k).second != nm) { own.insert(k, {e.first, nm}); ownChanged = true; }
        if (book.value(k) == nm || (book.contains(k) && !override)) continue;
        book.insert(k, nm); changed = true;
    }
    if (changed || ownChanged) { save(); }
    if (changed && onChange) onChange();
    return mine ? ownChanged : changed;
}
QList<QPair<QString, QString>> parseVcf(const QString &text) {
    QList<QPair<QString, QString>> out;
    QString t = text; t.replace(QStringLiteral("\r"), QString()); t.replace(QRegularExpression(QStringLiteral("\\n[ \\t]")), QString());
    const QStringList cards = t.split(QRegularExpression(QStringLiteral("BEGIN:VCARD"), QRegularExpression::CaseInsensitiveOption)).mid(1);
    static const QRegularExpression fnRe(QStringLiteral("^FN[^:]*:(.+)$"), QRegularExpression::MultilineOption | QRegularExpression::CaseInsensitiveOption);
    static const QRegularExpression nRe(QStringLiteral("^N[^:]*:(.+)$"), QRegularExpression::MultilineOption | QRegularExpression::CaseInsensitiveOption);
    static const QRegularExpression telRe(QStringLiteral("^TEL[^:]*:(.+)$"), QRegularExpression::MultilineOption | QRegularExpression::CaseInsensitiveOption);
    for (const QString &card : cards) {
        QString fn = fnRe.match(card).hasMatch() ? fnRe.match(card).captured(1).trimmed() : QString();
        if (fn.isEmpty()) { const auto m = nRe.match(card); if (m.hasMatch()) { const QStringList p = m.captured(1).split(QLatin1Char(';')); fn = ((p.value(1)) + QLatin1Char(' ') + p.value(0)).trimmed(); } }
        if (fn.isEmpty()) continue;
        auto it = telRe.globalMatch(card);
        while (it.hasNext()) out.append({it.next().captured(1).trimmed(), fn});
    }
    return out;
}
void load(const QString &file) {
    bookFile = file; book.clear();
    QFile f(file);
    if (!f.open(QIODevice::ReadOnly)) return;
    const QJsonObject o = QJsonDocument::fromJson(f.readAll()).object();
    own.clear();
    for (auto it = o.begin(); it != o.end(); ++it) { if (it.key() == QLatin1String("\x01own")) { for (const QJsonValue &v : it.value().toArray()) { const QJsonArray a = v.toArray(); own.insert(phoneKey(a.at(0).toString()), {a.at(0).toString(), a.at(1).toString()}); } } else book.insert(it.key(), it.value().toString()); }
}
void save() {
    if (bookFile.isEmpty()) return;
    QJsonObject o; for (auto it = book.cbegin(); it != book.cend(); ++it) o.insert(it.key(), it.value());
    QJsonArray mineRows; for (const auto &p : own) mineRows.append(QJsonArray{p.first, p.second});
    if (!mineRows.isEmpty()) o.insert(QStringLiteral("\x01own"), mineRows);
    QFile f(bookFile);
    if (f.open(QIODevice::WriteOnly | QIODevice::Truncate)) f.write(QJsonDocument(o).toJson(QJsonDocument::Compact));
}
void clear() { book.clear(); own.clear(); bookFile.clear(); onChange = nullptr; }
}
