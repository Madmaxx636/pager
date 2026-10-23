// Message text: clickable links, a safe subset of other apps' HTML, and typed markdown.
#include <QtTest>
#include "rich.h"

class RichTest : public QObject {
    Q_OBJECT
private slots:
    void plainTextIsEscapedAndLinksClickable() {
        QCOMPARE(Rich::render("a < b & c"), QString("a &lt; b &amp; c"));
        QCOMPARE(Rich::render("see https://example.com/x?a=1&b=2, ok"), QString("see <a href=\"https://example.com/x?a=1&amp;b=2\">https://example.com/x?a=1&amp;b=2</a>, ok"));
        QVERIFY(Rich::render("go to www.example.org now").contains("href=\"https://www.example.org\""));
        QCOMPARE(Rich::render("one\ntwo"), QString("one<br>two"));
    }
    void aMessageCannotInjectMarkup() {
        QVERIFY(!Rich::render("<script>alert(1)</script>").contains("<script"));
        QVERIFY(!Rich::render("<img src=x onerror=alert(1)>").contains("<img"));
    }
    void formattedHtmlKeepsOnlyTheSafeSubset() {
        const QString h = Rich::render("x", "<b>bold</b> <script>bad()</script><img src=\"http://evil/x.png\"> <a href=\"javascript:alert(1)\">no</a> <a href=\"https://ok.example\" onclick=\"x()\">yes</a> <span style=\"color:red\">span</span>");
        QVERIFY(h.contains("<b>bold</b>")); QVERIFY(!h.contains("<script")); QVERIFY(!h.contains("<img")); QVERIFY(!h.contains("javascript")); QVERIFY(!h.contains("onclick")); QVERIFY(!h.contains("style="));
        QVERIFY(h.contains("<a href=\"https://ok.example\">yes</a>")); QVERIFY(h.contains("bad()"));   // flattened to text, not run
    }
    void markdownBecomesMatrixHtml() {
        QCOMPARE(Rich::markdown("**bold** and _it_ and `code` and ~~gone~~"), QString("<b>bold</b> and <i>it</i> and <code>code</code> and <s>gone</s>"));
        QVERIFY(Rich::markdown("plain text, nothing special").isEmpty());
        QVERIFY(Rich::markdown("snake_case_word stays").isEmpty());
        QCOMPARE(Rich::markdown("a *b*\nc"), QString("a <i>b</i><br>c"));
        QVERIFY(Rich::markdown("```\nx < y\n```").contains("<pre><code>"));
    }
    void firstUrlAndPlainText() {
        QCOMPARE(Rich::firstUrl("look https://a.example/b."), QString("https://a.example/b"));
        QCOMPARE(Rich::firstUrl("www.x.org"), QString("https://www.x.org")); QVERIFY(Rich::firstUrl("nothing").isEmpty());
        QCOMPARE(Rich::plain("<b>hi</b> &amp; bye<br>ok"), QString("hi & bye ok"));
    }
    void emojiOnlyLikeTheOtherApps() {
        QVERIFY(Rich::emojiOnly(QString::fromUtf8("😀"))); QVERIFY(Rich::emojiOnly(QString::fromUtf8("😀 👍🏽 ❤️"))); QVERIFY(Rich::emojiOnly(QString::fromUtf8("🇺🇸")));
        QVERIFY(!Rich::emojiOnly(QString::fromUtf8("😀😀😀😀"))); QVERIFY(!Rich::emojiOnly(QString::fromUtf8("hi 😀"))); QVERIFY(!Rich::emojiOnly(""));
    }
};
QTEST_APPLESS_MAIN(RichTest)
#include "rich_test.moc"
