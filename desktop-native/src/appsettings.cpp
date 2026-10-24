#include "appsettings.h"
#include <QFile>
#include <QJsonDocument>

static QVariantMap makeDefaults() {
    QVariantMap d;
    auto strs = [](std::initializer_list<const char *> l) { QVariantList v; for (const char *s : l) v << QString::fromUtf8(s); return v; };
    d.insert("themeMode", "system"); d.insert("accent", "teal"); d.insert("accentCustom", "#0d9488"); d.insert("fontScale", 1.0); d.insert("palette", "none"); d.insert("themeFollowSystem", true);
    d.insert("bubbleStyle", "round"); d.insert("colorSenderNames", true); d.insert("timeFormat", "system"); d.insert("wallpaper", "none"); d.insert("wallpaperDim", 0);
    d.insert("bubbleFill", "solid"); d.insert("bubbleBorder", "none"); d.insert("bubbleBorderColor", ""); d.insert("outStyle", ""); d.insert("outRadius", -1); d.insert("outBorder", ""); d.insert("outBorderColor", "");
    d.insert("bubbleMine", ""); d.insert("bubbleTheirs", ""); d.insert("bubbleMineDark", ""); d.insert("bubbleTheirsDark", ""); d.insert("bubbleMineText", ""); d.insert("bubbleTheirsText", ""); d.insert("bubbleMineTextDark", ""); d.insert("bubbleTheirsTextDark", "");
    d.insert("bubbleNative", false); d.insert("bubbleRadius", 0); d.insert("bubbleWidth", 0); d.insert("bubbleDepth", "soft");
    d.insert("deleteAtSource", false); d.insert("fontFamily", "system"); d.insert("look", "none"); d.insert("reactionStyle", "filled"); d.insert("reactionSound", "tick"); d.insert("uiScale", "medium"); d.insert("skin", "default"); d.insert("skinAccent", "");
    d.insert("appIcon", "classic"); d.insert("wallpaperPhoto", ""); d.insert("autoTranscribe", false); d.insert("smoothGraphics", false);
    d.insert("fancyMotion", true); d.insert("reduceMotion", false); d.insert("screenEffects", true); d.insert("messageAnimation", "pop");
    d.insert("density", "comfortable"); d.insert("showAvatars", true); d.insert("showNetworkBadges", true); d.insert("showNetworkNameInRows", false); d.insert("showPreviews", true); d.insert("showFilterBar", true);
    d.insert("showReadTicks", true); d.insert("showMessageTimes", true); d.insert("inboxStyle", "pro"); d.insert("showPinsRow", true); d.insert("sortUnreadFirst", false); d.insert("defaultTab", "inbox");
    d.insert("avatarShape", "circle"); d.insert("showLabelsInFilterBar", true); d.insert("sidebarWidth", 360); d.insert("rowAction1", "read"); d.insert("rowAction2", "archive");
    d.insert("enterToSend", true); d.insert("sendReadReceipts", true); d.insert("sendTyping", true); d.insert("linkPreviews", true); d.insert("autoDownload", "always"); d.insert("unarchiveOnMessage", true);
    d.insert("doubleTapEmoji", QString::fromUtf8("👍")); d.insert("confirmDelete", true); d.insert("greetings", true); d.insert("mentionSuggestions", true); d.insert("markdown", true); d.insert("largeEmoji", true);
    d.insert("autoPlayGifs", true); d.insert("groupGapMin", 5); d.insert("markReadMode", "scrolled"); d.insert("openAtUnread", false); d.insert("gifKeys", QVariantMap()); d.insert("lowData", false); d.insert("lowEnd", false);
    d.insert("doubleTapReact", true); d.insert("swipeToReply", true);
    d.insert("quickReactions", QVariantList{QString::fromUtf8("👍"), QString::fromUtf8("❤️"), QString::fromUtf8("😂"), QString::fromUtf8("😮"), QString::fromUtf8("😢"), QString::fromUtf8("🙏")}); d.insert("recentEmoji", QVariantList()); d.insert("customSoundPath", ""); d.insert("scrollSpeed", 1.5);
    d.insert("notifEnabled", true); d.insert("accountAlerts", true); d.insert("updateAlerts", true); d.insert("convoSounds", true); d.insert("sendSound", "swoosh"); d.insert("receiveSound", "pop"); d.insert("convoSoundVolume", 0.5);
    d.insert("notifPreview", "full"); d.insert("notifSound", true); d.insert("notifGroupMentionsOnly", false); d.insert("notifScope", "all"); d.insert("notifMutedNetworks", QVariantList()); d.insert("notifNetworkMode", QVariantMap());
    d.insert("notifChat", QVariantMap()); d.insert("notifKeywords", QVariantList()); d.insert("notifQuietDays", QVariantList{0, 1, 2, 3, 4, 5, 6}); d.insert("notifQuietBreakThrough", false); d.insert("notifDelaySec", 0);
    d.insert("notifBadge", "unmuted"); d.insert("notifDirectMode", "all"); d.insert("notifGroupMode", "all"); d.insert("notifSoundId", "chime"); d.insert("notifSoundVolume", 0.7); d.insert("notifNetworkSound", QVariantMap()); d.insert("dndUntil", 0);
    d.insert("quietHoursEnabled", false); d.insert("quietStartMin", 22 * 60); d.insert("quietEndMin", 7 * 60);
    d.insert("hiddenNetworks", QVariantList()); d.insert("developerMode", false); d.insert("shortcuts", QVariantMap());
    d.insert("closeToTray", true); d.insert("startMinimized", false); d.insert("launchAtLogin", false); d.insert("hideStories", false);
    Q_UNUSED(strs)
    return d;
}
const QVariantMap &AppSettings::defaults() { static const QVariantMap d = makeDefaults(); return d; }

AppSettings::AppSettings(const QString &file, QObject *parent) : QQmlPropertyMap(this, parent), m_file(file) {
    m_timer.setSingleShot(true); m_timer.setInterval(400);
    connect(&m_timer, &QTimer::timeout, this, [this] { save(); });
    const QVariantMap &d = defaults();
    for (auto it = d.cbegin(); it != d.cend(); ++it) insert(it.key(), it.value());
    if (m_file.isEmpty()) return;
    QFile f(m_file);
    if (f.open(QIODevice::ReadOnly)) {
        const QJsonObject o = QJsonDocument::fromJson(f.readAll()).object();
        for (auto it = o.begin(); it != o.end(); ++it) if (d.contains(it.key())) insert(it.key(), it.value().toVariant());
    }
}

QVariant AppSettings::updateValue(const QString &key, const QVariant &input) {
    // keep the type of the default (QML hands numbers over as doubles, for instance)
    const QVariant def = defaults().value(key);
    QVariant v = input;
    if (def.isValid() && def.typeId() != QMetaType::QVariantList && def.typeId() != QMetaType::QVariantMap && v.metaType() != def.metaType()) v.convert(def.metaType());
    QTimer::singleShot(0, this, [this] { schedule(); });
    return v;
}
void AppSettings::set(const QString &key, const QVariant &value) {
    if (!defaults().contains(key)) return;
    QVariant v = value; const QVariant def = defaults().value(key);
    if (def.typeId() != QMetaType::QVariantList && def.typeId() != QMetaType::QVariantMap && v.metaType() != def.metaType()) v.convert(def.metaType());
    if (this->value(key) == v) return;
    insert(key, v); emit valueChanged(key, v); schedule();
}
void AppSettings::setEntry(const QString &table, const QString &id, const QString &field, const QVariant &v) {
    QVariantMap t = value(table).toMap(); QVariantMap e = t.value(id).toMap();
    if (!v.isValid() || v.toString().isEmpty() || v.toString() == QLatin1String("default")) e.remove(field); else e.insert(field, v);
    if (e.isEmpty()) t.remove(id); else t.insert(id, e);
    set(table, t);
}
void AppSettings::reset() { const QVariantMap &d = defaults(); for (auto it = d.cbegin(); it != d.cend(); ++it) { insert(it.key(), it.value()); emit valueChanged(it.key(), it.value()); } schedule(); }
QVariantMap AppSettings::snapshot() const { QVariantMap m; for (const QString &k : keys()) m.insert(k, value(k)); return m; }
QString AppSettings::exportJson() const { return QString::fromUtf8(QJsonDocument(QJsonObject::fromVariantMap(snapshot())).toJson(QJsonDocument::Indented)); }
bool AppSettings::importJson(const QString &json) {
    const QJsonDocument doc = QJsonDocument::fromJson(json.toUtf8());
    if (!doc.isObject()) return false;
    const QJsonObject o = doc.object(); bool any = false;
    for (auto it = o.begin(); it != o.end(); ++it) if (defaults().contains(it.key())) { set(it.key(), it.value().toVariant()); any = true; }
    return any;
}
void AppSettings::schedule() { m_timer.start(); }
void AppSettings::save() const {
    if (m_file.isEmpty()) return;
    QFile f(m_file);
    if (f.open(QIODevice::WriteOnly | QIODevice::Truncate)) f.write(QJsonDocument(QJsonObject::fromVariantMap(snapshot())).toJson(QJsonDocument::Indented));
}
