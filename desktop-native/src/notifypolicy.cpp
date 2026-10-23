#include "notifypolicy.h"
#include <QDateTime>
#include <QRegularExpression>

namespace NotifyPolicy {
bool keywordHit(const QString &text, const QStringList &keywords) {
    for (const QString &k0 : keywords) {
        const QString k = k0.trimmed(); if (k.isEmpty()) continue;
        const QRegularExpression re(QStringLiteral("(^|[^\\p{L}\\p{N}])%1($|[^\\p{L}\\p{N}])").arg(QRegularExpression::escape(k)), QRegularExpression::CaseInsensitiveOption | QRegularExpression::UseUnicodePropertiesOption);
        if (re.match(text).hasMatch()) return true;
    }
    return false;
}

bool inQuietHours(const QVariantMap &s, int m) {
    const int start = s.value("quietStartMin", 22 * 60).toInt(), end = s.value("quietEndMin", 7 * 60).toInt();
    if (!s.value("quietHoursEnabled").toBool() || start == end) return false;
    return start < end ? (m >= start && m < end) : (m >= start || m < end);
}

Decision decide(const Input &in, const QVariantMap &s) {
    QStringList keywords; for (const QVariant &k : s.value("notifKeywords").toList()) keywords << k.toString();
    Decision d;
    d.direct = in.mentioned || in.replyToMe || keywordHit(in.text, keywords);
    const QVariantMap chat = s.value("notifChat").toMap().value(in.roomId).toMap();
    const QString chatMode = (!chat.value("mode").toString().isEmpty() && chat.value("mode").toString() != QLatin1String("default")) ? chat.value("mode").toString() : QString();
    const QVariantMap netModes = s.value("notifNetworkMode").toMap();
    QStringList mutedNets; for (const QVariant &n : s.value("notifMutedNetworks").toList()) mutedNets << n.toString();
    const QString netMode = netModes.contains(in.network) ? netModes.value(in.network).toString() : (mutedNets.contains(in.network) ? QStringLiteral("none") : QStringLiteral("all"));
    const QString cp = chat.value("preview").toString();
    d.preview = cp == QLatin1String("show") ? QStringLiteral("full") : cp == QLatin1String("hide") ? QStringLiteral("hidden") : s.value("notifPreview", "full").toString();
    const QString csound = chat.value("soundId").toString();
    d.sound = (!csound.isEmpty() && csound != QLatin1String("default")) ? csound : (s.value("notifNetworkSound").toMap().contains(in.network) ? s.value("notifNetworkSound").toMap().value(in.network).toString() : s.value("notifSoundId", "chime").toString());
    Decision no = d; no.show = false; no.silent = true;

    if (!s.value("notifEnabled", true).toBool() || chatMode == QLatin1String("none")) return no;
    // Do not disturb: nothing alerts, except important things if you allowed that for quiet hours.
    const qint64 now = in.nowMs ? in.nowMs : QDateTime::currentMSecsSinceEpoch();
    const bool dnd = s.value("dndUntil").toLongLong() > now;
    const bool priority = chat.value("level").toString() == QLatin1String("priority");
    if (dnd && !(priority || (s.value("notifQuietBreakThrough").toBool() && (in.pinned || d.direct)))) return no;

    bool allowed;
    const QString kindMode = in.isGroup ? s.value("notifGroupMode", "all").toString() : s.value("notifDirectMode", "all").toString();
    if (chatMode == QLatin1String("mentions")) allowed = d.direct;
    else if (chatMode == QLatin1String("all")) allowed = true;
    else if (netMode == QLatin1String("none")) allowed = false;
    else if (netMode == QLatin1String("mentions")) allowed = d.direct;
    else if (kindMode == QLatin1String("none")) allowed = false;
    else if (kindMode == QLatin1String("mentions")) allowed = d.direct;
    else {
        const QString scope = s.value("notifScope", "all").toString();
        allowed = scope == QLatin1String("dm_mentions") ? (!in.isGroup || d.direct) : scope == QLatin1String("favorites") ? (in.pinned || d.direct) : true;
        if (in.isGroup && s.value("notifGroupMentionsOnly").toBool() && !d.direct) allowed = false;
    }
    if (in.quiet && !d.direct && !priority) allowed = false;      // muted and Low priority chats stay quiet except for things about you
    if (priority) allowed = true;
    if (!allowed) return no;

    QList<int> days; for (const QVariant &v : s.value("notifQuietDays").toList()) days << v.toInt();
    const bool inQuiet = days.contains(in.day) && inQuietHours(s, in.nowMin);
    const bool breaks = inQuiet && (priority || ((in.pinned || d.direct) && s.value("notifQuietBreakThrough").toBool()));
    d.show = true;
    d.silent = (inQuiet && !breaks) || !s.value("notifSound", true).toBool() || chat.value("sound").toString() == QLatin1String("off") || chat.value("level").toString() == QLatin1String("silent");
    return d;
}
}
