#!/usr/bin/env bash
# Turns on the computer's own automatic security updates (Ubuntu's unattended-upgrades): every day it installs what Ubuntu publishes as a security fix and
# nothing else. It never restarts the computer (a kernel update then waits for you; the nightly maintenance says so in Admin > Logs).
#   sudo ./scripts/system-updates.sh --on       write the setting (a file of its own, /etc/apt/apt.conf.d/52pager-auto-upgrades; undo with --off)
#   ./scripts/system-updates.sh --status        what is set now, and what is waiting
set -euo pipefail
F=/etc/apt/apt.conf.d/52pager-auto-upgrades
case "${1:---status}" in
  --on)  [ "$(id -u)" = 0 ] || { echo "Run with sudo." >&2; exit 1; }
         command -v unattended-upgrade >/dev/null || { apt-get install -y unattended-upgrades; }
         cat > "$F" <<'CONF'
// Pager: install Ubuntu's security fixes by themselves every day. No automatic restart.
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
Unattended-Upgrade::Automatic-Reboot "false";
CONF
         echo "On. Test it without changing anything: sudo unattended-upgrade --dry-run -v";;
  --off) [ "$(id -u)" = 0 ] || { echo "Run with sudo." >&2; exit 1; }; rm -f "$F"; echo "Removed $F (the system's own setting applies again).";;
  --status) echo "Unattended-Upgrade: $(apt-config dump | sed -n 's/^APT::Periodic::Unattended-Upgrade "\([0-9]*\)";/\1/p' | head -1) (1 = on, 0 = off)"
            echo "Security updates waiting: $(apt list --upgradable 2>/dev/null | grep -ci security)"; [ -f /var/run/reboot-required ] && echo "A restart is needed." || true;;
  *) echo "Usage: $0 [--on|--off|--status]" >&2; exit 1;;
esac
