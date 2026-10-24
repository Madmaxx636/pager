#pragma once
#include <QList>
#include <QPair>
#include <QString>
#include <functional>

/// Tidy names. Bridges add their tag to every name ("Sam (WA)") and show a bare phone number for anyone they have no name for:
/// the tag is dropped and numbers are looked up in a phone book made from your bridges' contact lists (and any contacts file you import).
namespace Names {
QString stripTag(const QString &name);
bool isPhone(const QString &name);
/// Digits only, matched on the last 10 so "+1 (555) 123-4567" and "5551234567" are the same person.
QString phoneKey(const QString &number);
/// A name fit to show: no network tag, and a contact's name instead of a bare number when it is known.
QString pretty(const QString &raw);
/// Adds names to the phone book. A number that already has a name keeps it unless [override]. Returns whether anything changed.
bool add(const QList<QPair<QString, QString>> &numberAndName, bool override = false, bool mine = false);
/// The entries you added yourself (a contacts file, or another device of yours), as {number, name} pairs: what syncs to your account.
QList<QPair<QString, QString>> ownRows();
QString lookup(const QString &number);
int size();
/// Your own contacts file (a .vcf from Google Contacts, iPhone or Android): name and number pairs.
QList<QPair<QString, QString>> parseVcf(const QString &text);
void load(const QString &file);
void save();
void clear();
extern std::function<void()> onChange;
}
