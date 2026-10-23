#pragma once
#include <QObject>
#include <QSettings>
#include <memory>

/// Things you can switch on or off. Remembered between runs.
class Prefs : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool enterSends READ enterSends WRITE setEnterSends NOTIFY changed)
    Q_PROPERTY(bool notifications READ notifications WRITE setNotifications NOTIFY changed)
    Q_PROPERTY(bool markdown READ markdown WRITE setMarkdown NOTIFY changed)
    Q_PROPERTY(bool sendTyping READ sendTyping WRITE setSendTyping NOTIFY changed)
    Q_PROPERTY(bool closeToTray READ closeToTray WRITE setCloseToTray NOTIFY changed)
public:
    explicit Prefs(QObject *parent = nullptr, const QString &file = QString()) : QObject(parent), m_s(file.isEmpty() ? new QSettings() : new QSettings(file, QSettings::IniFormat)) {}
    bool enterSends() const { return m_s->value("chats/enterSends", true).toBool(); }
    bool notifications() const { return m_s->value("notify/popups", true).toBool(); }
    bool markdown() const { return m_s->value("chats/markdown", true).toBool(); }
    bool sendTyping() const { return m_s->value("chats/sendTyping", true).toBool(); }
    void setMarkdown(bool v) { put("chats/markdown", v); }
    void setSendTyping(bool v) { put("chats/sendTyping", v); }
    bool closeToTray() const { return m_s->value("window/closeToTray", true).toBool(); }
    void setEnterSends(bool v) { put("chats/enterSends", v); }
    void setNotifications(bool v) { put("notify/popups", v); }
    void setCloseToTray(bool v) { put("window/closeToTray", v); }
signals:
    void changed();
private:
    void put(const char *k, bool v) { m_s->setValue(QLatin1String(k), v); m_s->sync(); emit changed(); }
    std::unique_ptr<QSettings> m_s;
};
