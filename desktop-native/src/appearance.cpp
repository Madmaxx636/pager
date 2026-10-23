#include "appearance.h"
#include <QGuiApplication>
#include <QStyleHints>

Appearance::Appearance(QObject *parent) : QObject(parent) {
    auto *hints = QGuiApplication::styleHints();
    m_dark = hints->colorScheme() == Qt::ColorScheme::Dark;
    connect(hints, &QStyleHints::colorSchemeChanged, this, [this](Qt::ColorScheme s) { setDark(s == Qt::ColorScheme::Dark); });
}
