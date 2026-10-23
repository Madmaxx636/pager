#include <QCommandLineParser>
#include <QDir>
#include <QApplication>
#include <QMenu>
#include <QSystemTrayIcon>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickStyle>
#include <QQuickWindow>
#include <QStandardPaths>
#include <QTimer>
#include "appearance.h"
#include "emoji.h"
#include "engine.h"

int main(int argc, char *argv[]) {
    QApplication app(argc, argv);
    QApplication::setQuitOnLastWindowClosed(false);   // closing the window leaves Pager in the tray, so messages still reach you
    QGuiApplication::setOrganizationName(QStringLiteral("Pager"));
    QGuiApplication::setApplicationName(QStringLiteral("pager-native"));
    QGuiApplication::setApplicationDisplayName(QStringLiteral("Pager"));
    QGuiApplication::setDesktopFileName(QStringLiteral("pager-native"));
    QQuickStyle::setStyle(QStringLiteral("Basic"));      // plain controls: every colour and shape comes from Pager's own screens, not from a system theme

    QCommandLineParser cli;
    cli.addHelpOption();
    QCommandLineOption demo(QStringLiteral("demo"), QStringLiteral("Show made-up chats instead of signing in (for trying the screens)."));
    QCommandLineOption data(QStringLiteral("data-dir"), QStringLiteral("Where the sign-in and the encrypted store are kept."), QStringLiteral("folder"));
    QCommandLineOption shot(QStringLiteral("screenshot"), QStringLiteral("Save a picture of the window to this file and quit (used for checking the screens)."), QStringLiteral("file"));
    QCommandLineOption size(QStringLiteral("size"), QStringLiteral("Window size for --screenshot, like 1100x720."), QStringLiteral("WxH"));
    cli.addOption(demo); cli.addOption(data); cli.addOption(shot); cli.addOption(size);
    cli.process(app);

    const QString dir = cli.isSet(data) ? cli.value(data) : QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    QDir().mkpath(dir);
    Engine engine(dir, cli.isSet(demo));
    Appearance look;
    Emoji emoji;

    QQmlApplicationEngine qml;
    qml.rootContext()->setContextProperty(QStringLiteral("core"), &engine);
    qml.rootContext()->setContextProperty(QStringLiteral("look"), &look);
    qml.rootContext()->setContextProperty(QStringLiteral("emoji"), &emoji);
    qml.load(QUrl(QStringLiteral("qrc:/Pager/qml/Main.qml")));
    if (qml.rootObjects().isEmpty()) return 1;
    auto *win = qobject_cast<QQuickWindow *>(qml.rootObjects().first());
    const bool testing = cli.isSet(shot);
    QSystemTrayIcon tray(QIcon(QStringLiteral(":/pager.svg")));
    QMenu trayMenu;
    auto showWindow = [win] { win->show(); win->raise(); win->requestActivate(); };
    if (!testing && QSystemTrayIcon::isSystemTrayAvailable()) {
        trayMenu.addAction(QStringLiteral("Open Pager"), showWindow);
        trayMenu.addAction(QStringLiteral("Quit"), &app, &QApplication::quit);
        tray.setContextMenu(&trayMenu);
        tray.setToolTip(QStringLiteral("Pager"));
        QObject::connect(&tray, &QSystemTrayIcon::activated, [&](QSystemTrayIcon::ActivationReason why) { if (why == QSystemTrayIcon::Trigger) { if (win->isVisible() && win->isActive()) win->hide(); else showWindow(); } });
        tray.show();
    } else QApplication::setQuitOnLastWindowClosed(true);   // no tray on this desktop: closing the window quits
    static QString notifiedRoom;
    QObject::connect(&engine, &Engine::notify, [&](const QString &room, const QString &title, const QString &body) {
        if (!tray.isVisible()) return;
        notifiedRoom = room;
        tray.showMessage(title, body.left(200), QSystemTrayIcon::NoIcon, 8000);
    });
    QObject::connect(&tray, &QSystemTrayIcon::messageClicked, [&] { showWindow(); if (!notifiedRoom.isEmpty()) engine.openRoom(notifiedRoom); });
    QObject::connect(&engine, &Engine::unreadChanged, [&](int n) { tray.setToolTip(n > 0 ? QStringLiteral("Pager · %1 unread").arg(n) : QStringLiteral("Pager")); });
    if (cli.isSet(shot)) {
        QQuickWindow *w = win;
        if (cli.isSet(size)) { const QStringList wh = cli.value(size).split('x'); if (wh.size() == 2) w->resize(wh[0].toInt(), wh[1].toInt()); }
        QTimer::singleShot(1500, &app, [&] { w->grabWindow().save(cli.value(shot)); app.quit(); });
    }
    return app.exec();
}
