package app.pager.android

import androidx.compose.animation.togetherWith
import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity

/** Content another app asked us to share. */
data class Shared(val text: String?, val uris: List<Uri>)

class MainActivity : FragmentActivity() {
    private var openRoom by mutableStateOf<String?>(null)
    private var shared by mutableStateOf<Shared?>(null)
    private var locked by mutableStateOf(false)
    private var stoppedAt = 0L
    private val store get() = (application as PagerApp).store

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handleIntent(intent)
        locked = store.settings.value.appLock
        setContent {
            val settings by store.settings.state.collectAsState()
            PagerTheme(settings) {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    Box(Modifier.safeDrawingPadding()) {
                        CompositionLocalProvider(LocalStore provides store) {
                            if (locked && settings.appLock) LockScreen(onUnlock = { unlock() }) else Root()
                            GreetingOverlay()
                        }
                    }
                }
            }
            LaunchedEffect(settings.hideInRecents) {
                if (settings.hideInRecents) window.addFlags(WindowManager.LayoutParams.FLAG_SECURE) else window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
            }
        }
    }

    private fun handleIntent(i: Intent?) {
        i ?: return
        i.getStringExtra("roomId")?.let { openRoom = it }
        when (i.action) {
            Intent.ACTION_SEND -> {
                val uri = if (Build.VERSION.SDK_INT >= 33) i.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else @Suppress("DEPRECATION") i.getParcelableExtra(Intent.EXTRA_STREAM)
                shared = Shared(i.getStringExtra(Intent.EXTRA_TEXT), listOfNotNull(uri))
            }
            Intent.ACTION_SEND_MULTIPLE -> {
                val uris = if (Build.VERSION.SDK_INT >= 33) i.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java) else @Suppress("DEPRECATION") i.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
                shared = Shared(i.getStringExtra(Intent.EXTRA_TEXT), uris.orEmpty())
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    override fun onStart() {
        super.onStart()
        store.appInForeground = true
        val s = store.settings.value
        if (s.appLock && stoppedAt > 0 && System.currentTimeMillis() - stoppedAt >= s.lockAfterSec * 1000L) locked = true
    }

    override fun onStop() { store.appInForeground = false; stoppedAt = System.currentTimeMillis(); super.onStop() }

    private fun unlock() {
        val allowed = BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL
        if (BiometricManager.from(this).canAuthenticate(allowed) != BiometricManager.BIOMETRIC_SUCCESS) { locked = false; return } // nothing to unlock with
        val prompt = BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) { locked = false }
        })
        prompt.authenticate(BiometricPrompt.PromptInfo.Builder().setTitle("Unlock Pager").setAllowedAuthenticators(allowed).build())
    }

    @androidx.compose.runtime.Composable
    private fun LockScreen(onUnlock: () -> Unit) {
        LaunchedEffect(Unit) { onUnlock() }
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Text("🔒", fontSize = 48.sp)
            Text("Pager is locked", Modifier.padding(16.dp))
            Button(onClick = onUnlock) { Text("Unlock") }
        }
    }

    @androidx.compose.runtime.Composable
    private fun Root() {
        val session by store.session.collectAsState()
        // Screens are plain strings so they survive rotation:
        // "inbox", "chat:<id>", "info:<id>", "new", "search", "search:<id>", "forward:<room>|<event>", "share", "settings" / "settings/<page>".
        var screen by rememberSaveable { mutableStateOf("inbox") }
        var back by rememberSaveable { mutableStateOf("inbox") }
        fun go(to: String) { back = screen; screen = to }
        val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}

        LaunchedEffect(session != null) {
            if (session != null && Build.VERSION.SDK_INT >= 33) ask.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        LaunchedEffect(openRoom) { openRoom?.let { screen = "chat:$it"; openRoom = null } }
        // Tell the store which page is open, so the in-page sounds know where they belong.
        SideEffect { store.openRoom = if (screen.startsWith("chat:")) screen.removePrefix("chat:") else null }
        LaunchedEffect(shared, session != null) { if (shared != null && session != null) screen = "share" }

        if (session == null) { AuthScreen(store); return }

        val calm = LocalSettings.current.reduceMotion
        // Screens slide and fade into each other; everything stays put with "Reduce motion" (and in E-ink mode).
        androidx.compose.animation.AnimatedContent(
            targetState = screen,
            transitionSpec = {
                if (calm) androidx.compose.animation.EnterTransition.None togetherWith androidx.compose.animation.ExitTransition.None
                else (androidx.compose.animation.fadeIn(androidx.compose.animation.core.tween(220)) + androidx.compose.animation.slideInHorizontally(androidx.compose.animation.core.tween(260, easing = androidx.compose.animation.core.FastOutSlowInEasing)) { it / 14 }) togetherWith
                    androidx.compose.animation.fadeOut(androidx.compose.animation.core.tween(120))
            },
            label = "screens",
        ) { cur ->
            val arg = cur.substringAfter(':', "")
        when {
            cur.startsWith("chat:") -> {
                BackHandler { screen = "inbox" }
                ChatScreen(arg, onBack = { screen = "inbox" }, onInfo = { screen = "info:$arg" }, onSearch = { go("search:$arg") },
                    onForward = { m -> screen = "forward:$arg|${m.id}" }, onSettings = { p -> screen = if (p.isEmpty()) "settings" else "settings/$p" })
            }
            cur.startsWith("info:") -> {
                BackHandler { screen = "chat:$arg" }
                ChatInfoScreen(arg, onBack = { screen = "chat:$arg" }, onLeft = { screen = "inbox" }, onSearch = { go("search:$arg") })
            }
            cur.startsWith("search") -> {
                val room = arg.ifEmpty { null }
                val up = if (room != null) "chat:$room" else "inbox"
                BackHandler { screen = up }
                SearchScreen(room, onBack = { screen = up }, onOpen = { screen = "chat:$it" })
            }
            cur.startsWith("forward:") -> {
                val (from, id) = arg.split('|', limit = 2).let { it[0] to it.getOrElse(1) { "" } }
                BackHandler { screen = "chat:$from" }
                ChatPicker("Forward to…", onBack = { screen = "chat:$from" }) { target ->
                    store.chatNow(from)?.messages?.firstOrNull { it.id == id }?.let { store.forward(it, target) }
                    screen = "chat:$target"
                }
            }
            cur == "share" -> {
                val sh = shared
                BackHandler { shared = null; screen = "inbox" }
                ChatPicker("Share to…", onBack = { shared = null; screen = "inbox" }) { target ->
                    sh?.text?.takeIf { it.isNotBlank() }?.let { store.send(target, it) }
                    sh?.uris?.forEach { store.sendFile(target, it) }
                    shared = null; screen = "chat:$target"
                }
            }
            cur == "new" -> {
                BackHandler { screen = "inbox" }
                NewChatScreen(onBack = { screen = "inbox" }, onOpen = { screen = "chat:$it" })
            }
            cur.startsWith("settings") -> {
                val page = cur.substringAfter("settings/", "")
                BackHandler { screen = if (page.isEmpty()) "inbox" else "settings" }
                SettingsScreen(page, navigate = { p ->
                    when {
                        p.startsWith("open:") -> screen = "chat:${p.removePrefix("open:")}"
                        p.isEmpty() -> screen = "settings"
                        else -> screen = "settings/$p"
                    }
                }, onBack = { screen = "inbox" })
            }
            else -> InboxScreen(
                onOpen = { screen = "chat:$it" }, onNewChat = { screen = "new" }, onSearch = { go("search") },
                onSettings = { p -> screen = if (p.isEmpty()) "settings" else "settings/$p" },
            )
        }
        }
    }
}
