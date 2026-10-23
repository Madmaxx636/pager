#include "rich.h"
#include <QRegularExpression>
#include <QSet>
#include <QUrl>

QString Rich::escape(const QString &s) { QString r = s; r.replace(QLatin1Char('&'), QStringLiteral("&amp;")).replace(QLatin1Char('<'), QStringLiteral("&lt;")).replace(QLatin1Char('>'), QStringLiteral("&gt;")); return r; }

static const QRegularExpression &urlRe() {
    static const QRegularExpression re(QStringLiteral("\\b((?:https?://|www\\.)[^\\s<]+[^\\s<.,;:!?)\\]\"'])"), QRegularExpression::CaseInsensitiveOption);
    return re;
}

QString Rich::firstUrl(const QString &text) {
    const QRegularExpressionMatch m = urlRe().match(text);
    if (!m.hasMatch()) return {};
    const QString u = m.captured(1);
    return u.startsWith(QLatin1String("http"), Qt::CaseInsensitive) ? u : QStringLiteral("https://") + u;
}

QString Rich::linkify(const QString &s) {
    QString out; int last = 0;
    QRegularExpressionMatchIterator it = urlRe().globalMatch(s);
    while (it.hasNext()) {
        const QRegularExpressionMatch m = it.next();
        out += s.mid(last, m.capturedStart() - last);
        const QString shown = m.captured(1);
        const QString href = shown.startsWith(QLatin1String("http"), Qt::CaseInsensitive) ? shown : QStringLiteral("https://") + shown;
        // the text was escaped already (& is &amp;): the address must carry a real &
        QString h = href; h.replace(QStringLiteral("&amp;"), QStringLiteral("&")); h.replace(QLatin1Char('"'), QStringLiteral("%22"));
        QString hAttr = h; hAttr.replace(QLatin1Char('&'), QStringLiteral("&amp;"));
        out += QStringLiteral("<a href=\"%1\">%2</a>").arg(hAttr, shown);
        last = m.capturedEnd();
    }
    return out + s.mid(last);
}

QString Rich::sanitize(const QString &html) {
    static const QSet<QString> allowed{QStringLiteral("b"), QStringLiteral("strong"), QStringLiteral("i"), QStringLiteral("em"), QStringLiteral("u"), QStringLiteral("s"), QStringLiteral("del"), QStringLiteral("strike"),
                                        QStringLiteral("code"), QStringLiteral("pre"), QStringLiteral("blockquote"), QStringLiteral("ul"), QStringLiteral("ol"), QStringLiteral("li"), QStringLiteral("p"), QStringLiteral("br"), QStringLiteral("a")};
    static const QRegularExpression tag(QStringLiteral("<(/?)([a-zA-Z][a-zA-Z0-9]*)((?:\\s[^>]*)?)>"));
    static const QRegularExpression href(QStringLiteral("href\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')"), QRegularExpression::CaseInsensitiveOption);
    QString out; int last = 0; int openLinks = 0;
    auto text = [&](const QString &t) { QString x = t; x.replace(QLatin1Char('<'), QStringLiteral("&lt;")); out += x; };
    QRegularExpressionMatchIterator it = tag.globalMatch(html);
    while (it.hasNext()) {
        const QRegularExpressionMatch m = it.next();
        text(html.mid(last, m.capturedStart() - last)); last = m.capturedEnd();
        const bool closing = !m.captured(1).isEmpty(); const QString name = m.captured(2).toLower();
        if (!allowed.contains(name)) continue;                       // flattened to its text
        if (name == QLatin1String("br")) { out += QStringLiteral("<br>"); continue; }
        if (name == QLatin1String("a")) {
            if (closing) { if (openLinks > 0) { --openLinks; out += QStringLiteral("</a>"); } continue; }
            const QRegularExpressionMatch h = href.match(m.captured(3));
            QString target = h.hasMatch() ? (h.captured(1).isEmpty() ? h.captured(2) : h.captured(1)) : QString();
            static const QRegularExpression ok(QStringLiteral("^(https?:|mailto:|tel:)"), QRegularExpression::CaseInsensitiveOption);
            if (ok.match(target).hasMatch()) { target.replace(QLatin1Char('"'), QStringLiteral("%22")); out += QStringLiteral("<a href=\"%1\">").arg(target); ++openLinks; }
            continue;
        }
        out += closing ? QStringLiteral("</%1>").arg(name) : QStringLiteral("<%1>").arg(name);   // attributes are dropped
    }
    text(html.mid(last));
    while (openLinks-- > 0) out += QStringLiteral("</a>");
    return out;
}

QString Rich::render(const QString &body, const QString &html) {
    if (!html.isEmpty()) {
        QString h = sanitize(html);
        // links in formatted text that are not marked up yet
        if (!h.contains(QLatin1String("<a "))) h = linkify(h);
        return h;
    }
    QString e = escape(body);
    e = linkify(e);
    e.replace(QStringLiteral("\r\n"), QStringLiteral("\n")).replace(QLatin1Char('\n'), QStringLiteral("<br>"));
    return e;
}

QString Rich::plain(const QString &html) {
    static const QRegularExpression tags(QStringLiteral("<[^>]*>"));
    QString t = html; t.replace(QStringLiteral("<br>"), QStringLiteral(" ")).replace(QStringLiteral("</p>"), QStringLiteral(" ")).remove(tags);
    t.replace(QStringLiteral("&lt;"), QStringLiteral("<")).replace(QStringLiteral("&gt;"), QStringLiteral(">")).replace(QStringLiteral("&amp;"), QStringLiteral("&")).replace(QStringLiteral("&quot;"), QStringLiteral("\"")).replace(QStringLiteral("&#39;"), QStringLiteral("'"));
    return t.simplified();
}

QString Rich::markdown(const QString &text) {
    QString html = escape(text); bool changed = false;
    QStringList stash;
    auto keep = [&](const QRegularExpression &re, const QString &open, const QString &close) {
        QString out; int last = 0; QRegularExpressionMatchIterator it = re.globalMatch(html);
        while (it.hasNext()) { const QRegularExpressionMatch m = it.next(); out += html.mid(last, m.capturedStart() - last); stash << open + m.captured(1) + close; out += QStringLiteral("\x01%1\x01").arg(stash.size() - 1); last = m.capturedEnd(); changed = true; }
        html = out + html.mid(last);
    };
    keep(QRegularExpression(QStringLiteral("```([\\s\\S]+?)```")), QStringLiteral("<pre><code>"), QStringLiteral("</code></pre>"));
    keep(QRegularExpression(QStringLiteral("`([^`\\n]+)`")), QStringLiteral("<code>"), QStringLiteral("</code>"));
    auto wrap = [&](const QString &pattern, const QString &open, const QString &close) {
        const QRegularExpression re(pattern); QString out; int last = 0; QRegularExpressionMatchIterator it = re.globalMatch(html);
        while (it.hasNext()) { const QRegularExpressionMatch m = it.next(); out += html.mid(last, m.capturedStart() - last) + m.captured(1) + open + m.captured(2) + close + m.captured(3); last = m.capturedEnd(); changed = true; }
        html = out + html.mid(last);
    };
    wrap(QStringLiteral("()\\*\\*([^*\\n]+)\\*\\*()"), QStringLiteral("<b>"), QStringLiteral("</b>"));
    wrap(QStringLiteral("(^|[^\\w*])\\*([^*\\n]+)\\*([^\\w*]|$)"), QStringLiteral("<i>"), QStringLiteral("</i>"));
    wrap(QStringLiteral("(^|[^\\w_])_([^_\\n]+)_([^\\w_]|$)"), QStringLiteral("<i>"), QStringLiteral("</i>"));
    wrap(QStringLiteral("()~~([^~\\n]+)~~()"), QStringLiteral("<s>"), QStringLiteral("</s>"));
    if (!changed) return {};
    for (int i = 0; i < stash.size(); ++i) html.replace(QStringLiteral("\x01%1\x01").arg(i), stash[i]);
    return html.replace(QLatin1Char('\n'), QStringLiteral("<br>"));
}

bool Rich::emojiOnly(const QString &text) {
    const QString t = text.trimmed();
    if (t.isEmpty() || t.size() > 40) return false;
    int count = 0; uint prev = 0; bool flagOpen = false;
    const QList<uint> cps = t.toUcs4();
    for (uint cp : cps) {
        if (cp == 0x200d || cp == 0xfe0f || (cp >= 0x1f3fb && cp <= 0x1f3ff) || cp == 0x20e3 || QChar::isSpace(cp)) { prev = cp; continue; }
        const bool emoji = (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x2600 && cp <= 0x27bf) || (cp >= 0x2300 && cp <= 0x23ff) || (cp >= 0x1f1e6 && cp <= 0x1f1ff) || (cp >= 0x2190 && cp <= 0x21ff) || (cp >= 0x2b00 && cp <= 0x2bff) || cp == 0xa9 || cp == 0xae || cp == 0x203c || cp == 0x2049;
        if (!emoji) return false;
        const bool flag = cp >= 0x1f1e6 && cp <= 0x1f1ff;
        if (!(prev == 0x200d || (flag && flagOpen))) ++count;     // a joined sequence or a flag pair counts once
        flagOpen = flag && !flagOpen; prev = cp;
    }
    return count >= 1 && count <= 3;
}
