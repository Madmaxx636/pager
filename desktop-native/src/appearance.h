#pragma once
#include <QColor>
#include <QObject>

/// The colours of the app. They follow the system's light or dark choice (and the look chosen later on).
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
public:
    explicit Appearance(QObject *parent = nullptr);
    bool dark() const { return m_dark; }
    QColor bg() const { return m_dark ? "#0b0e13" : "#ffffff"; }
    QColor panel() const { return m_dark ? "#12161d" : "#f6f7f9"; }
    QColor panel2() const { return m_dark ? "#1c222c" : "#eceff3"; }
    QColor line() const { return m_dark ? "#232a35" : "#e3e6ea"; }
    QColor text() const { return m_dark ? "#e8ecf2" : "#14171a"; }
    QColor muted() const { return m_dark ? "#8b95a5" : "#6b7480"; }
    QColor accent() const { return m_dark ? "#2dd4bf" : "#0d9488"; }
    QColor accentInk() const { return m_dark ? "#04201c" : "#ffffff"; }
    QColor theirs() const { return m_dark ? "#1c222c" : "#eceff3"; }
    QColor danger() const { return m_dark ? "#ff7b7b" : "#c62828"; }
    void setDark(bool d) { if (d != m_dark) { m_dark = d; emit changed(); } }
signals:
    void changed();
private:
    bool m_dark = false;
};
