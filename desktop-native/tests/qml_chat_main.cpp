// QML tests of the real chat screens on top of the real engine (in demo mode, so no server): scrolling, loading, what stays put when things arrive.
#include <QQmlContext>
#include <QQmlEngine>
#include <QtQuickTest>
#include "appearance.h"
#include "iconprovider.h"
#include "roundedimage.h"
#include "emoji.h"
#include "engine.h"
#include "fileinfo.h"
#include "appsettings.h"
#include "rich.h"

class Setup : public QObject {
    Q_OBJECT
public slots:
    void qmlEngineAvailable(QQmlEngine *e) {
        e->addImageProvider(QStringLiteral("icon"), new IconProvider); qmlRegisterType<RoundedImage>("Pager.Items", 1, 0, "RoundedImage");
        static Engine core(QString(), true); static AppSettings settings(QStringLiteral("/tmp/pager-qml-chat-settings.json")); static Appearance look(&settings); static FileInfo files; static Emoji emoji; static Rich rich;
        e->rootContext()->setContextProperty(QStringLiteral("core"), &core);
        e->rootContext()->setContextProperty(QStringLiteral("look"), &look);
        e->rootContext()->setContextProperty(QStringLiteral("files"), &files);
        e->rootContext()->setContextProperty(QStringLiteral("emoji"), &emoji);
        e->rootContext()->setContextProperty(QStringLiteral("rich"), &rich);
        e->rootContext()->setContextProperty(QStringLiteral("settings"), &settings);
        e->rootContext()->setContextProperty(QStringLiteral("startupDialog"), QString());
    }
};
QUICK_TEST_MAIN_WITH_SETUP(PagerChat, Setup)
#include "qml_chat_main.moc"
