#pragma once
#include <QString>
#include <QVariantMap>

/// What to do with one incoming message, from every notification setting. The same rules as the other Pager apps.
namespace NotifyPolicy {
struct Input {
    QString roomId, network, text;
    bool isGroup = false, mentioned = false, replyToMe = false;
    bool quiet = false;        // the chat is muted or in Low priority
    bool pinned = false;
    int nowMin = 0;            // minutes since midnight
    int day = 0;               // 0 = Sunday
    qint64 nowMs = 0;
};
struct Decision {
    bool show = false;
    bool silent = true;        // show it, but without sound
    QString preview = QStringLiteral("full");   // full, sender or hidden
    bool direct = false;       // about you: a mention, a reply or one of your keywords
    QString sound;
};
bool keywordHit(const QString &text, const QStringList &keywords);
bool inQuietHours(const QVariantMap &settings, int minuteOfDay);
Decision decide(const Input &in, const QVariantMap &settings);
}
