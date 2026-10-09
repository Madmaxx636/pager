#!/usr/bin/env bash
# Installs the Pager desktop app on Debian/Ubuntu/KDE and refreshes the icon caches, so the menu and taskbar show the current icon.
#   ./desktop/install.sh            builds nothing; installs the newest .deb in desktop/release
#   ./desktop/install.sh path.deb   installs that file
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
deb="${1:-$(ls -t "$here"/release/pager-desktop_*_amd64.deb 2>/dev/null | head -n1 || true)}"
[ -n "$deb" ] && [ -f "$deb" ] || { echo "No .deb found. Build it first: cd desktop && npm run dist" >&2; exit 1; }

pkill -x pager-desktop 2>/dev/null || true   # close a running copy so the new files load
echo "Installing $deb"
sudo apt install -y --reinstall "$(readlink -f "$deb")"

sudo gtk-update-icon-cache -f /usr/share/icons/hicolor 2>/dev/null || true
sudo update-desktop-database /usr/share/applications 2>/dev/null || true
for k in kbuildsycoca6 kbuildsycoca5; do command -v "$k" >/dev/null && { "$k" --noincremental >/dev/null 2>&1 || true; break; }; done
echo "Done. Open Pager from the app menu. If the old icon still shows, log out and back in once."
