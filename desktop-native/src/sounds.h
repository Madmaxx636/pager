#pragma once
#include <QString>
#include <QVariantList>

/// The built-in alert sounds (the same little recipes as the web app: beeps, chimes, pops), made on the spot as small WAV files.
namespace Sounds {
/// [{id, label}] of every sound you can choose, "None" last.
QVariantList list();
/// The WAV file for a sound (made the first time, kept in the temp folder), or "" for "none" and unknown names.
QString file(const QString &id);
}
