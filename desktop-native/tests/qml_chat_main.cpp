// QML tests of the real chat screens on top of the real engine (in demo mode, so no server): scrolling, loading, what stays put when things arrive.
#include <QQmlContext>
#include <QQmlEngine>
#include <QtQuickTest>
#include "appearance.h"
#include "emoji.h"
#include "engine.h"
#include "fileinfo.h"
#include "prefs.h"
#include "rich.h"

class Setup : public QObject {
    Q_OBJECT
public slots:
    void qmlEngineAvailable(QQmlEngine *e) {
        static Engine core(QString(), true); static Appearance look(nullptr, QStringLiteral("/tmp/pager-qml-chat-look.ini")); static FileInfo files; static Emoji emoji; static Rich rich;
        static Prefs prefs(nullptr, QStringLiteral("/tmp/pager-qml-chat-prefs.ini"));
        e->rootContext()->setContextProperty(QStringLiteral("core"), &core);
        e->rootContext()->setContextProperty(QStringLiteral("look"), &look);
        e->rootContext()->setContextProperty(QStringLiteral("files"), &files);
        e->rootContext()->setContextProperty(QStringLiteral("emoji"), &emoji);
        e->rootContext()->setContextProperty(QStringLiteral("rich"), &rich);
        e->rootContext()->setContextProperty(QStringLiteral("prefs"), &prefs);
        e->rootContext()->setContextProperty(QStringLiteral("startupDialog"), QString());
    }
};
QUICK_TEST_MAIN_WITH_SETUP(PagerChat, Setup)
#include "qml_chat_main.moc"
