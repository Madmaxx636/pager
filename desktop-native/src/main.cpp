#include <QCommandLineParser>
#include <QDir>
#include <QApplication>
#include <QMenu>
#include <QSystemTrayIcon>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickStyle>
#include <QQuickWindow>
#include <QSvgRenderer>
#include <QPainter>
#include <QPixmap>
#include <tuple>
#include <QFontDatabase>
#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>
#include <QCoreApplication>
#include <QStandardPaths>
#include <QTimer>
#include "appearance.h"
#include "emoji.h"
#include "iconprovider.h"
#include "roundedimage.h"
#include "wallpaper.h"
#include "screeneffects.h"
#include "fileinfo.h"
#include "appsettings.h"
#include "rich.h"
#include "selfupdate.h"
#include <QDesktopServices>
#include <QProcess>
#include "engine.h"

/// "Low-end mode" (Settings > Advanced) draws the screens with the processor instead of the graphics chip: less memory and no graphics-driver surprises on older computers.
/// It has to be decided before the window system starts, so the saved settings are read early.
static void chooseGraphics(int argc, char **argv) {
    QString dir;
    for (int i = 1; i + 1 < argc; ++i) if (QString::fromLocal8Bit(argv[i]) == QLatin1String("--data-dir")) dir = QString::fromLocal8Bit(argv[i + 1]);
    if (dir.isEmpty()) {
        QCoreApplication::setOrganizationName(QStringLiteral("Pager")); QCoreApplication::setApplicationName(QStringLiteral("pager-native"));
        dir = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    }
    QFile f(dir + QStringLiteral("/settings.json"));
    bool low = qEnvironmentVariableIsSet("PAGER_LOW_END");
    if (!low && f.open(QIODevice::ReadOnly)) low = QJsonDocument::fromJson(f.readAll()).object().value(QStringLiteral("lowEnd")).toBool();
    if (low && !qEnvironmentVariableIsSet("QSG_RHI_BACKEND")) QQuickWindow::setGraphicsApi(QSGRendererInterface::Software);
}

int main(int argc, char *argv[]) {
    chooseGraphics(argc, argv);
    QApplication app(argc, argv);
    QApplication::setQuitOnLastWindowClosed(false);   // closing the window leaves Pager in the tray (unless switched off in Settings), so messages still reach you
    QGuiApplication::setOrganizationName(QStringLiteral("Pager"));
    QGuiApplication::setApplicationName(QStringLiteral("pager-native"));
    QGuiApplication::setApplicationDisplayName(QStringLiteral("Pager"));
    QGuiApplication::setDesktopFileName(QStringLiteral("pager-native"));
    const int inter = QFontDatabase::addApplicationFont(QStringLiteral(":/fonts/Inter.ttf"));
    if (inter >= 0) { QFont f(QFontDatabase::applicationFontFamilies(inter).value(0)); f.setPixelSize(15); QGuiApplication::setFont(f); }
    QQuickStyle::setStyle(QStringLiteral("PagerStyle"));      // plain controls: every colour and shape comes from Pager's own screens, not from a system theme

    QCommandLineParser cli;
    cli.addHelpOption();
    QCommandLineOption demo(QStringLiteral("demo"), QStringLiteral("Show made-up chats instead of signing in (for trying the screens)."));
    QCommandLineOption data(QStringLiteral("data-dir"), QStringLiteral("Where the sign-in and the encrypted store are kept."), QStringLiteral("folder"));
    QCommandLineOption shot(QStringLiteral("screenshot"), QStringLiteral("Save a picture of the window to this file and quit (used for checking the screens)."), QStringLiteral("file"));
    QCommandLineOption size(QStringLiteral("size"), QStringLiteral("Window size for --screenshot, like 1100x720."), QStringLiteral("WxH"));
    QCommandLineOption open(QStringLiteral("open"), QStringLiteral("Open a window on start (settings, emoji, poll) for screenshots."), QStringLiteral("which"));
    QCommandLineOption wait(QStringLiteral("wait"), QStringLiteral("Milliseconds to wait before the --screenshot is taken."), QStringLiteral("ms"));
    QCommandLineOption chat(QStringLiteral("chat"), QStringLiteral("Open the first chat whose name contains this (for screenshots)."), QStringLiteral("name"));
    cli.addOption(wait); cli.addOption(chat);
    cli.addOption(open);
    cli.addOption(demo); cli.addOption(data); cli.addOption(shot); cli.addOption(size);
    cli.process(app);

    const QString dir = cli.isSet(data) ? cli.value(data) : QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    QDir().mkpath(dir);
    Engine engine(dir, cli.isSet(demo));
    AppSettings settings(dir + QStringLiteral("/settings.json"));
    engine.setSettings(&settings);
    // For trying the app against a test server without typing: PAGER_AUTOLOGIN="https://server,user,password" signs in once (the sign-in is then remembered).
    if (qEnvironmentVariableIsSet("PAGER_AUTOLOGIN")) {
        const QStringList a = qEnvironmentVariable("PAGER_AUTOLOGIN").split(QLatin1Char(','));
        if (a.size() == 3) QTimer::singleShot(1500, &engine, [&engine, a] { if (!engine.signedIn()) engine.login(a[0], a[1], a[2]); });
    }
    // the font the whole app is drawn in (Settings > Appearance > Font); the first family that is installed wins
    static const QHash<QString, QStringList> kFonts{{"serif", {"Georgia", "Iowan Old Style", "Noto Serif", "DejaVu Serif"}}, {"rounded", {"Nunito", "Varela Round", "Quicksand", "Noto Sans"}},
        {"humanist", {"Gill Sans", "Trebuchet MS", "Noto Sans", "Candara"}}, {"mono", {"JetBrains Mono", "DejaVu Sans Mono", "Noto Sans Mono", "Consolas"}}, {"sf", {"SF Pro Text", "Helvetica Neue", "Cantarell", "Noto Sans"}},
        {"googlesans", {"Google Sans", "Product Sans", "Roboto", "Noto Sans"}}, {"roboto", {"Roboto", "Helvetica Neue", "Arial"}}, {"readable", {"Atkinson Hyperlegible", "Verdana", "DejaVu Sans", "Tahoma"}}};
    const QString interFamily = QGuiApplication::font().family();
    auto applyFont = [&settings, interFamily] {
        QFont f = QGuiApplication::font(); const QString id = settings.value(QStringLiteral("fontFamily")).toString();
        if (kFonts.contains(id)) f.setFamilies(kFonts.value(id) + QStringList{interFamily}); else f.setFamilies({interFamily});
        QGuiApplication::setFont(f);
    };
    applyFont(); QObject::connect(&settings, &AppSettings::valueChanged, &app, [applyFont](const QString &k) { if (k == QLatin1String("fontFamily")) applyFont(); });
    Appearance look(&settings);
    Emoji emoji;
    FileInfo files;
    Rich rich;

    QQmlApplicationEngine qml;
    qml.addImageProvider(QStringLiteral("icon"), new IconProvider);
    qmlRegisterType<RoundedImage>("Pager.Items", 1, 0, "RoundedImage"); qmlRegisterType<Wallpaper>("Pager.Items", 1, 0, "Wallpaper"); qmlRegisterType<ScreenEffects>("Pager.Items", 1, 0, "ScreenEffects");
    qml.addImportPath(QStringLiteral("qrc:/qml"));
    qml.rootContext()->setContextProperty(QStringLiteral("core"), &engine);
    qml.rootContext()->setContextProperty(QStringLiteral("look"), &look);
    qml.rootContext()->setContextProperty(QStringLiteral("emoji"), &emoji);
    qml.rootContext()->setContextProperty(QStringLiteral("files"), &files);
    qml.rootContext()->setContextProperty(QStringLiteral("settings"), &settings);
    qml.rootContext()->setContextProperty(QStringLiteral("rich"), &rich);
    qml.rootContext()->setContextProperty(QStringLiteral("startupDialog"), cli.value(open));
    qml.load(QUrl(QStringLiteral("qrc:/Pager/qml/Main.qml")));
    if (qml.rootObjects().isEmpty()) return 1;
    auto *win = qobject_cast<QQuickWindow *>(qml.rootObjects().first());
    const bool testing = cli.isSet(shot);
    QSystemTrayIcon tray(QIcon(QStringLiteral(":/pager.svg")));
    QMenu trayMenu;
    // the app icon: the same pager drawing in the colours you pick (Settings > Appearance > App icon)
    static const QVector<std::tuple<QString, QString, QString>> kIcons{{"classic", "#6ff0dc", "#0f9d90"}, {"sunset", "#ffb36b", "#e8408c"}, {"midnight", "#4b5bd6", "#0b1030"}, {"candy", "#ff9ad5", "#8b5cf6"},
        {"mint", "#c5f7d2", "#2fa36b"}, {"retro", "#e4dec9", "#8c8670"}, {"graphite", "#58626f", "#0b0f14"}, {"sky", "#8fd8ff", "#2563eb"}, {"lemon", "#fff0a6", "#f59e0b"}, {"rose", "#fda4af", "#be123c"}};
    auto applyIcon = [&settings, &tray, win] {
        QFile f(QStringLiteral(":/pager.svg")); if (!f.open(QIODevice::ReadOnly)) return;
        QString svg = QString::fromUtf8(f.readAll()); const QString id = settings.value(QStringLiteral("appIcon")).toString();
        for (const auto &i : kIcons) if (std::get<0>(i) == id) { svg.replace(QStringLiteral("#6ff0dc"), std::get<1>(i), Qt::CaseInsensitive).replace(QStringLiteral("#0f9d90"), std::get<2>(i), Qt::CaseInsensitive); }
        QSvgRenderer r(svg.toUtf8()); QIcon icon;
        for (int sz : {16, 24, 32, 48, 64, 128, 256}) { QPixmap pm(sz, sz); pm.fill(Qt::transparent); QPainter p(&pm); r.render(&p); icon.addPixmap(pm); }
        QGuiApplication::setWindowIcon(icon); win->setIcon(icon); tray.setIcon(icon);
    };
    applyIcon(); QObject::connect(&settings, &AppSettings::valueChanged, [applyIcon](const QString &k) { if (k == QLatin1String("appIcon")) applyIcon(); });
    auto showWindow = [win] { win->show(); win->raise(); win->requestActivate(); };
    if (!testing && QSystemTrayIcon::isSystemTrayAvailable()) {
        trayMenu.addAction(QStringLiteral("Open Pager"), showWindow);
        trayMenu.addAction(QStringLiteral("Quit"), &app, &QApplication::quit);
        tray.setContextMenu(&trayMenu);
        tray.setToolTip(QStringLiteral("Pager"));
        QObject::connect(&tray, &QSystemTrayIcon::activated, [&](QSystemTrayIcon::ActivationReason why) { if (why == QSystemTrayIcon::Trigger) { if (win->isVisible() && win->isActive()) win->hide(); else showWindow(); } });
        tray.show();
        if (settings.value(QStringLiteral("startMinimized")).toBool()) win->hide();      // "Start minimized to tray"
    } else QApplication::setQuitOnLastWindowClosed(true);   // no tray on this desktop: closing the window quits
    QObject::connect(&app, &QGuiApplication::lastWindowClosed, [&] { if (!settings.value(QStringLiteral("closeToTray")).toBool() || !tray.isVisible()) app.quit(); });
    QObject::connect(&engine, &Engine::updateReady, [&](const QString &path) {
#ifdef Q_OS_WIN
        // The installer (per user, no administrator rights) closes this Pager, replaces the files and starts the new one.
        if (QProcess::startDetached(path, {QStringLiteral("/S")})) { engine.updateInstalled(QString()); }
        else engine.updateInstalled(QStringLiteral("Windows wouldn't start the installer. Open it yourself: ") + QDir::toNativeSeparators(path));
#else
        engine.updateInstalled(SelfUpdate::installArchive(path, QCoreApplication::applicationDirPath()));
#endif
    });
    QObject::connect(&engine, &Engine::restartRequested, [&] {
#ifndef Q_OS_WIN
        QProcess::startDetached(QCoreApplication::applicationFilePath(), QCoreApplication::arguments().mid(1));
#endif
        app.quit();
    });
    if (!testing) {                                              // look for a newer version a little after start, then every six hours
        QTimer::singleShot(20000, &engine, [&] { if (engine.signedIn()) engine.checkForUpdates(true); });
        auto *every = new QTimer(&app); every->setInterval(6 * 60 * 60 * 1000);
        QObject::connect(every, &QTimer::timeout, &engine, [&] { if (engine.signedIn()) engine.checkForUpdates(true); });
        every->start();
    }
    static QString notifiedRoom;
    QObject::connect(&engine, &Engine::notify, [&](const QString &room, const QString &title, const QString &body, bool silent) {
        if (!tray.isVisible() || !settings.value(QStringLiteral("notifEnabled")).toBool()) return;
        notifiedRoom = room;
        Q_UNUSED(silent)   // the desktop decides on the sound of its own pop-ups
        tray.showMessage(title, body.left(200), QSystemTrayIcon::NoIcon, 8000);
    });
    QObject::connect(&tray, &QSystemTrayIcon::messageClicked, [&] { showWindow(); if (!notifiedRoom.isEmpty()) engine.openRoom(notifiedRoom); });
    QObject::connect(&engine, &Engine::unreadChanged, [&](int n) { tray.setToolTip(n > 0 ? QStringLiteral("Pager · %1 unread").arg(n) : QStringLiteral("Pager")); });
    if (cli.isSet(shot)) {
        QQuickWindow *w = win;
        if (cli.isSet(size)) { const QStringList wh = cli.value(size).split('x'); if (wh.size() == 2) w->resize(wh[0].toInt(), wh[1].toInt()); }
        if (cli.isSet(chat)) {
            auto *poll = new QTimer(&app); poll->setInterval(400);
            QObject::connect(poll, &QTimer::timeout, &app, [&engine, poll, text = cli.value(chat)] {
                for (const QString &id : engine.chatIds()) if (engine.chatName(id).contains(text, Qt::CaseInsensitive)) { engine.openRoom(id); poll->stop(); return; }
            });
            poll->start();
        }
        QTimer::singleShot(cli.isSet(wait) ? cli.value(wait).toInt() : 1500, &app, [&] { w->grabWindow().save(cli.value(shot)); app.quit(); });
    }
    return app.exec();
}
