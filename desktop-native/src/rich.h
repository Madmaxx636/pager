#pragma once
#include <QObject>
#include <QString>

/// Message text for the screen: plain text with links you can click, the small HTML subset other apps and bridges send (everything else is flattened to its text),
/// and the markdown you type (**bold**, *italic*, `code`...) turned into Matrix HTML.
class Rich : public QObject {
    Q_OBJECT
public:
    using QObject::QObject;
    /// Safe HTML to show [body]; uses [html] (a message's formatted body) when there is one. Links are marked up and newlines kept.
    Q_INVOKABLE static QString render(const QString &body, const QString &html = QString());
    /// Matrix HTML for typed [text], or empty when it has no formatting.
    Q_INVOKABLE static QString markdown(const QString &text);
    /// The first web address in [text] (https:// added to bare www. ones), or empty.
    Q_INVOKABLE static QString firstUrl(const QString &text);
    /// The words of formatted text without its tags.
    Q_INVOKABLE static QString plain(const QString &html);
    /// True for a message of just 1-3 emoji (shown large).
    Q_INVOKABLE static bool emojiOnly(const QString &text);
    static QString escape(const QString &s);
    static QString sanitize(const QString &html);
    static QString linkify(const QString &escapedPlain);
};
