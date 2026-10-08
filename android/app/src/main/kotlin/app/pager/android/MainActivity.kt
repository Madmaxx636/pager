package app.pager.android

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier

class MainActivity : ComponentActivity() {
    private var openRoom by mutableStateOf<String?>(null)
    private val store get() = (application as PagerApp).store

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        openRoom = intent?.getStringExtra("roomId")
        setContent {
            PagerTheme {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    Box(Modifier.safeDrawingPadding()) { Root() }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra("roomId")?.let { openRoom = it }
    }

    override fun onStart() { super.onStart(); store.appInForeground = true }
    override fun onStop() { store.appInForeground = false; super.onStop() }

    @androidx.compose.runtime.Composable
    private fun Root() {
        val session by store.session.collectAsState()
        var selected by rememberSaveable { mutableStateOf<String?>(null) }
        val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}

        LaunchedEffect(session != null) {
            if (session != null && Build.VERSION.SDK_INT >= 33) ask.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        LaunchedEffect(openRoom) { openRoom?.let { selected = it; openRoom = null } }

        if (session == null) {
            AuthScreen(store)
        } else if (selected != null) {
            BackHandler { selected = null }
            ChatScreen(store, selected!!, onBack = { selected = null })
        } else {
            InboxScreen(store, onOpen = { selected = it })
        }
    }
}
