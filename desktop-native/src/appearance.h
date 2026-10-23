#pragma once
#include <QColor>
#include <QObject>
#include <QSettings>
#include <QVariantList>
#include <memory>

/// The look of the app: light/dark/black or a ready-made palette, an accent colour and the text size. Remembered between runs.
class Appearance : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool dark READ dark NOTIFY changed)
    Q_PROPERTY(QColor bg READ bg NOTIFY changed)
    Q_PROPERTY(QColor panel READ panel NOTIFY changed)
    Q_PROPERTY(QColor panel2 READ panel2 NOTIFY changed)
    Q_PROPERTY(QColor line READ line NOTIFY changed)
    Q_PROPERTY(QColor text READ text NOTIFY changed)
    Q_PROPERTY(QColor muted READ muted NOTIFY changed)
    Q_PROPERTY(QColor accent READ accent NOTIFY changed)
    Q_PROPERTY(QColor accentInk READ accentInk NOTIFY changed)
    Q_PROPERTY(QColor theirs READ theirs NOTIFY changed)
    Q_PROPERTY(QColor danger READ danger NOTIFY changed)
    Q_PROPERTY(QString mode READ mode NOTIFY changed)           // system, light, dark or black
    Q_PROPERTY(QString accentName READ accentName NOTIFY changed) // a name from accents(), or a #rrggbb of your own
    Q_PROPERTY(QString palette READ palette NOTIFY changed)     // id of a ready-made look, or empty
    Q_PROPERTY(qreal textScale READ textScale NOTIFY changed)
public:
    /// [settingsFile] and [palettesTsv] are for tests; normally the app's own saved settings and built-in palettes are used.
    explicit Appearance(QObject *parent = nullptr, const QString &settingsFile = QString(), const QByteArray &palettesTsv = QByteArray());
    bool dark() const { return m_dark; }
    QColor bg() const { return m_c.bg; }
    QColor panel() const { return m_c.panel; }
    QColor panel2() const { return m_c.panel2; }
    QColor line() const { return m_c.line; }
    QColor text() const { return m_c.text; }
    QColor muted() const { return m_c.muted; }
    QColor accent() const { return m_c.accent; }
    QColor accentInk() const { return m_c.ink; }
    QColor theirs() const { return m_c.theirs; }
    QColor danger() const { return m_dark ? QColor("#ff7b7b") : QColor("#c62828"); }
    QString mode() const { return m_mode; }
    QString accentName() const { return m_accent; }
    QString palette() const { return m_palette; }
    qreal textScale() const { return m_scale; }
    Q_INVOKABLE void setMode(const QString &mode);
    Q_INVOKABLE void setAccent(const QString &nameOrHex);
    Q_INVOKABLE void setPalette(const QString &id);
    Q_INVOKABLE void setTextScale(qreal s);
    /// [{id, name, group, dark, bg, accent, line, text}] for the picker.
    Q_INVOKABLE QVariantList palettes() const;
    /// [{name, color}] of the ready accents.
    Q_INVOKABLE QVariantList accents() const;
    void setSystemDark(bool d) { if (d != m_systemDark) { m_systemDark = d; recompute(); } }
signals:
    void changed();
private:
    struct Colors { QColor bg, panel, panel2, line, text, muted, accent, ink, theirs; };
    struct Pal { QString id, name, group; bool dark; QColor bg, panel, panel2, line, theirs, text, muted, accent; };
    void recompute();
    void save() const;
    QVector<Pal> m_pals;
    std::unique_ptr<QSettings> m_settings;
    Colors m_c;
    QString m_mode = QStringLiteral("system"), m_accent = QStringLiteral("teal"), m_palette;
    qreal m_scale = 1.0;
    bool m_dark = false, m_systemDark = false;
};
