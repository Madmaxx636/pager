#pragma once
#include <QJsonObject>
#include <QQmlPropertyMap>
#include <QTimer>

/// All of Pager's settings, with the same names and meanings as the other Pager apps (so what you choose here can be shared with them later).
/// QML reads them as properties (settings.markdown) and writes them the same way; lists and tables (quickReactions, notifChat...) are set with set().
/// Everything is kept in one JSON file and saved a moment after each change.
class AppSettings : public QQmlPropertyMap {
    Q_OBJECT
public:
    explicit AppSettings(const QString &file = QString(), QObject *parent = nullptr);
    ~AppSettings() override { save(); }
    static const QVariantMap &defaults();
    /// Sets any setting from code or QML (also for lists and tables).
    Q_INVOKABLE void set(const QString &key, const QVariant &value);
    Q_INVOKABLE void reset();
    Q_INVOKABLE QString exportJson() const;
    /// Applies settings from JSON made by exportJson (unknown names are ignored). Returns false when it isn't settings JSON.
    Q_INVOKABLE bool importJson(const QString &json);
    Q_INVOKABLE QVariantMap snapshot() const;
    /// A per-chat or per-network table entry: settings.entry("notifChat", roomId).mode ...
    Q_INVOKABLE QVariantMap entry(const QString &table, const QString &id) const { return value(table).toMap().value(id).toMap(); }
    Q_INVOKABLE void setEntry(const QString &table, const QString &id, const QString &field, const QVariant &v);
    void save() const;
    QString file() const { return m_file; }
protected:
    QVariant updateValue(const QString &key, const QVariant &input) override;
private:
    void schedule();
    QString m_file;
    QTimer m_timer;
};
