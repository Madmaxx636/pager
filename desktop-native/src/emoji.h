#pragma once
#include <QObject>
#include <QStringList>
#include <QVariantList>

/// Emoji for the pickers: browse by group, or search names and keywords ("fire", "thumbs", "heart eyes").
class Emoji : public QObject {
    Q_OBJECT
public:
    explicit Emoji(QObject *parent = nullptr) : QObject(parent) {}
    /// Emoji whose name or keywords match every word typed (each may be the start of a word), best first.
    static QStringList searchIn(const QByteArray &namesTsv, const QString &query, int limit = 150);
    Q_INVOKABLE QStringList search(const QString &query) const;
    /// [{icon, name, emoji: [...]}] in the order a picker shows them.
    Q_INVOKABLE QVariantList groups() const;
    /// The quick row shown first when reacting.
    Q_INVOKABLE QStringList quick() const { return {QStringLiteral("👍"), QStringLiteral("❤️"), QStringLiteral("😂"), QStringLiteral("😮"), QStringLiteral("😢"), QStringLiteral("🙏")}; }
};
