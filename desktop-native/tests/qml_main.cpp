// Runs the QML tests (tests/tst_*.qml) with a stand-in for the engine, so screens that talk to the Pager server can be tested without one.
#include <QJSValue>
#include <QJsonDocument>
#include <QQmlContext>
#include <QQmlEngine>
#include <QtQuickTest>
#include "appearance.h"
#include "iconprovider.h"
#include "roundedimage.h"
#include "fileinfo.h"
#include "appsettings.h"

/// Answers server calls from a table the test fills in: "METHOD /path" -> {status, body}. Remembers every call.
class MockCore : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString user READ user CONSTANT)
    Q_PROPERTY(QString version READ version CONSTANT)
    Q_PROPERTY(QString updateState READ upd CONSTANT) Q_PROPERTY(QString updateVersion READ upd CONSTANT) Q_PROPERTY(QString updateNotes READ upd CONSTANT)
    Q_PROPERTY(QString updateMessage READ upd CONSTANT) Q_PROPERTY(int updateProgress READ prog CONSTANT) Q_PROPERTY(QString appVersion READ upd CONSTANT)
    Q_PROPERTY(bool recovering READ recovering NOTIFY recoveryChanged)
    Q_PROPERTY(bool recoveryDone READ recoveryDone NOTIFY recoveryChanged)
    Q_PROPERTY(QString recoveryMessage READ recoveryMessage NOTIFY recoveryChanged)
public:
    QString user() const { return QStringLiteral("@me:test"); }
    QString version() const { return QStringLiteral("test"); }
    Q_INVOKABLE void reply(const QString &key, int status, const QVariant &body) { m_replies.insert(key, qMakePair(status, body)); }
    Q_INVOKABLE QVariantList calls() const { return m_calls; }
    Q_INVOKABLE void clear() { m_calls.clear(); m_replies.clear(); }
    Q_INVOKABLE void api(const QString &method, const QString &path, const QVariant &body, const QJSValue &cb) {
        m_calls.append(QVariantMap{{"method", method}, {"path", path}, {"body", body}});
        const auto r = m_replies.value(method + QLatin1Char(' ') + path, qMakePair(404, QVariant(QVariantMap{{"error", "no such route in the test"}})));
        QJSValue f = cb;
        QTimer::singleShot(0, this, [this, f, r]() mutable { if (f.isCallable()) { QJSEngine *js = qjsEngine(this); f.call({QJSValue(r.first), js->toScriptValue(r.second)}); } });
    }
    Q_INVOKABLE QVariantMap qr(const QString &) const { return QVariantMap{{"size", 21}, {"rows", QVariantList()}}; }
    Q_INVOKABLE void logout() {}
    Q_INVOKABLE void addToPhonebook(const QVariantList &) {}
    Q_INVOKABLE QString prettyName(const QString &s) const { return s; }
    Q_INVOKABLE void openWhenAvailable(const QString &id) { m_opened = id; }
    Q_INVOKABLE QString opened() const { return m_opened; }
    Q_INVOKABLE int importContacts(const QString &) { return 0; }
    QString upd() const { return QStringLiteral("idle"); } int prog() const { return 0; }
    Q_INVOKABLE void checkForUpdates(bool) {} Q_INVOKABLE void installUpdate() {}
    bool recovering() const { return false; } bool recoveryDone() const { return m_done; } QString recoveryMessage() const { return m_msg; }
    Q_INVOKABLE void resetRecovery() { m_msg.clear(); m_done = false; emit recoveryChanged(); }
    Q_INVOKABLE void recover(const QString &key) { m_lastKey = key; }
    Q_INVOKABLE QString lastKey() const { return m_lastKey; }
signals:
    void recoveryChanged();
private:
    bool m_done = false; QString m_msg, m_lastKey, m_opened;
    QVariantList m_calls; QHash<QString, QPair<int, QVariant>> m_replies;
};

class Setup : public QObject {
    Q_OBJECT
public slots:
    void qmlEngineAvailable(QQmlEngine *e) {
        e->addImageProvider(QStringLiteral("icon"), new IconProvider); qmlRegisterType<RoundedImage>("Pager.Items", 1, 0, "RoundedImage");
        static MockCore core; static AppSettings settings(QStringLiteral("/tmp/pager-qml-test-settings.json")); static Appearance look(&settings); static FileInfo files;
        e->rootContext()->setContextProperty(QStringLiteral("core"), &core);
        e->rootContext()->setContextProperty(QStringLiteral("look"), &look);
        e->rootContext()->setContextProperty(QStringLiteral("files"), &files);
        e->rootContext()->setContextProperty(QStringLiteral("settings"), &settings);
        e->rootContext()->setContextProperty(QStringLiteral("startupDialog"), QString());
    }
};
QUICK_TEST_MAIN_WITH_SETUP(PagerQml, Setup)
#include "qml_main.moc"
