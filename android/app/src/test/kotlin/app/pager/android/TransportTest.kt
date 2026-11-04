package app.pager.android

import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class TransportTest {
    @Test fun ownNetworkAddressesMayUsePlainHttp() {
        for (h in listOf("localhost", "127.0.0.1", "10.0.0.5", "192.168.1.126", "172.16.4.2", "172.31.255.1", "169.254.1.1", "mypager.local", "pager", "[::1]", "fe80::1")) assertTrue(h, Transport.isLocalHost(h))
    }
    @Test fun theInternetMayNot() {
        for (h in listOf("mcpager.duckdns.org", "8.8.8.8", "172.32.0.1", "172.15.0.1", "192.169.1.1", "11.0.0.1", "example.com")) assertFalse(h, Transport.isLocalHost(h))
    }
    @Test fun httpsIsAlwaysFineAndPublicHttpIsRefused() {
        Transport.check("https://mcpager.duckdns.org/_matrix/client/versions")
        Transport.check("http://192.168.1.126:8008/_matrix/client/versions")
        assertThrows(ApiException::class.java) { Transport.check("http://mcpager.duckdns.org/_matrix/client/versions") }
    }
}
