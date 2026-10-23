#pragma once
#include <QString>

/// Puts a downloaded update in place of the running program.
namespace SelfUpdate {
/// Linux: [archive] is a .tar.gz with one top folder (pager-native/) holding the program and its libraries; its files replace the ones in [appDir].
/// Returns an empty string when it worked, otherwise what to tell the person.
QString installArchive(const QString &archive, const QString &appDir);
/// True when [appDir] can be written to by this user (a copy installed system-wide can't update itself).
bool canWrite(const QString &appDir);
}
