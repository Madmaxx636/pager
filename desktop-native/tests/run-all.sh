#!/usr/bin/env bash
# Runs every test of the native app that can run here. For the engine tests that need a server, start a throwaway homeserver first and pass
#   PAGER_TEST_SERVER=http://127.0.0.1:8008 PAGER_TEST_ALICE=alice:pw PAGER_TEST_BOB=bob:pw     (never your real server)
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; fail=0
export QT_QPA_PLATFORM=offscreen QT_QUICK_CONTROLS_STYLE=Basic
cmake -S "$HERE" -B "$HERE/build" -G Ninja >/dev/null && cmake --build "$HERE/build" >/dev/null || { echo "build failed"; exit 1; }
for t in store-test models-test rich-test names-test appsettings-test notifypolicy-test emoji-test appearance-test selfupdate-test engine-live-test qml-test qml-chat-test; do
  out="$("$HERE/build/$t" 2>&1)"; echo "$out" | grep -E "^Totals" | sed "s/^/$t: /"; echo "$out" | grep -q "^FAIL" && { echo "$out" | grep -E "FAIL|Actual|Expected"; fail=1; }
done
/usr/lib/qt6/bin/qmltestrunner -input "$HERE/tests/networks_test.qml" 2>&1 | grep -E "^Totals" | sed 's/^/networks (qml): /'
[ -n "${PAGER_TEST_SERVER:-}" ] && { "$HERE/tests/run-live-test.sh" 2>&1 | grep -E "^test |test result" || fail=1; } || echo "(engine tests against a server skipped: no PAGER_TEST_SERVER)"
exit $fail
