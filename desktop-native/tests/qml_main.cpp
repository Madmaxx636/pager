// Runs the QML tests (tests/tst_*.qml) with a stand-in for the engine, so screens that talk to the Pager server can be tested without one.
#include <QJSValue>
#include <QJsonDocument>
#include <QQmlContext>
#include <QQmlEngine>
#include <QtQuickTest>
#include "appearance.h"
#include "fileinfo.h"
#include "prefs.h"

/// Answers server calls from a table the test fills in: "METHOD /path" -> {status, body}. Remembers every call.
class MockCore : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString user READ user CONSTANT)
    Q_PROPERTY(QString version READ version CONSTANT)
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
private:
    QVariantList m_calls; QHash<QString, QPair<int, QVariant>> m_replies;
};

class Setup : public QObject {
    Q_OBJECT
public slots:
    void qmlEngineAvailable(QQmlEngine *e) {
        static MockCore core; static Appearance look(nullptr, QStringLiteral("/tmp/pager-qml-test-look.ini")); static FileInfo files; static Prefs prefs(nullptr, QStringLiteral("/tmp/pager-qml-test-prefs.ini"));
        e->rootContext()->setContextProperty(QStringLiteral("core"), &core);
        e->rootContext()->setContextProperty(QStringLiteral("look"), &look);
        e->rootContext()->setContextProperty(QStringLiteral("files"), &files);
        e->rootContext()->setContextProperty(QStringLiteral("prefs"), &prefs);
        e->rootContext()->setContextProperty(QStringLiteral("startupDialog"), QString());
    }
};
QUICK_TEST_MAIN_WITH_SETUP(PagerQml, Setup)
#include "qml_main.moc"
