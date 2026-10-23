import QtQuick
import QtTest
import "../qml/Networks.js" as N

TestCase {
    name: "Networks"
    function test_cookies_from_curl() {
        const c = N.parseCookies("curl 'https://x' -b 'SID=abc; HSID=def' -H 'a: b'")
        compare(c.SID, "abc"); compare(c.HSID, "def")
    }
    function test_cookies_from_header_and_json() {
        compare(N.parseCookies("Cookie: a=1; b=2").b, "2")
        compare(N.parseCookies('{"a": 1, "b": "x"}').a, "1")
    }
    function test_known_and_unknown_networks() {
        compare(N.meta("whatsapp").label, "WhatsApp")
        compare(N.meta("zzz").glyph, "Z")
        compare(N.stateLabel("BAD_CREDENTIALS")[0], "Sign in again")
    }
}
