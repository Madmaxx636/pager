#include "emoji.h"
#include <QFile>
#include <algorithm>

static QByteArray readResource(const char *path) { QFile f(QString::fromLatin1(path)); return f.open(QIODevice::ReadOnly) ? f.readAll() : QByteArray(); }

QStringList Emoji::searchIn(const QByteArray &tsv, const QString &query, int limit) {
    const QStringList words = query.toLower().simplified().split(QLatin1Char(' '), Qt::SkipEmptyParts);
    if (words.isEmpty()) return {};
    struct Hit { int score, order; QString emoji; };
    QVector<Hit> hits;
    int order = 0;
    for (const QByteArray &raw : tsv.split('\n')) {
        const int tab = raw.indexOf('\t');
        if (tab <= 0) continue;
        const QString emoji = QString::fromUtf8(raw.left(tab));
        QString names = QString::fromUtf8(raw.mid(tab + 1)).toLower();
        names.replace(QLatin1Char('-'), QLatin1Char(' ')).replace(QLatin1Char('_'), QLatin1Char(' '));
        const QStringList tokens = names.split(QLatin1Char(' '), Qt::SkipEmptyParts);
        int score = 0; bool all = true;
        for (const QString &w : words) {
            const bool exact = tokens.contains(w), first = names.startsWith(w);
            bool prefix = exact;
            if (!prefix) for (const QString &t : tokens) if (t.startsWith(w)) { prefix = true; break; }
            if (!prefix) { all = false; break; }
            score += first ? 4 : exact ? 3 : 1;
        }
        if (all) hits.append({score, order, emoji});
        ++order;
    }
    std::stable_sort(hits.begin(), hits.end(), [](const Hit &a, const Hit &b) { return a.score != b.score ? a.score > b.score : a.order < b.order; });
    QStringList out;
    for (int i = 0; i < hits.size() && i < limit; ++i) out << hits[i].emoji;
    return out;
}

QStringList Emoji::search(const QString &query) const { static const QByteArray names = readResource(":/emoji-names.tsv"); return searchIn(names, query); }

QVariantList Emoji::groups() const {
    QVariantList out;
    for (const QByteArray &line : readResource(":/emoji-groups.tsv").split('\n')) {
        const QList<QByteArray> p = line.split('\t');
        if (p.size() < 3) continue;
        out.append(QVariantMap{{"icon", QString::fromUtf8(p[0])}, {"name", QString::fromUtf8(p[1])}, {"emoji", QString::fromUtf8(p[2]).split(QLatin1Char(' '), Qt::SkipEmptyParts)}});
    }
    return out;
}
