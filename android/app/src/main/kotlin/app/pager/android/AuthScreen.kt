package app.pager.android

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

@Composable
fun AuthScreen(store: Store) {
    var server by remember { mutableStateOf(store.savedServer) }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var invite by remember { mutableStateOf("") }
    var signingUp by remember { mutableStateOf(false) }
    var inviteRequired by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(28.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Pager", fontSize = 34.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(4.dp))
        Text(
            if (signingUp) "Create your account" else "All your chats, one inbox, on your own server.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(24.dp))

        OutlinedTextField(
            server, { server = it }, label = { Text("Server") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("matrix.example.com") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
        )
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(username, { username = it.lowercase().trim() }, label = { Text("Username") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            password, { password = it }, label = { Text("Password") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        )
        if (signingUp && inviteRequired) {
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(invite, { invite = it }, label = { Text("Invite code") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        }
        if (error.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            Text(error, color = MaterialTheme.colorScheme.error)
        }
        Spacer(Modifier.height(18.dp))
        Button(
            enabled = !busy && server.isNotBlank() && username.isNotBlank() && password.isNotEmpty(),
            modifier = Modifier.fillMaxWidth().height(50.dp),
            onClick = {
                busy = true; error = ""
                scope.launch {
                    try {
                        store.http.baseUrl = store.normalizeServer(server)
                        if (signingUp) store.pager.signup(username, password, invite.trim())
                        store.signIn(server, username, password)
                    } catch (e: Exception) {
                        error = e.message ?: "Something went wrong"
                    }
                    busy = false
                }
            },
        ) { Text(if (busy) "One moment…" else if (signingUp) "Create account" else "Sign in") }
        TextButton(
            modifier = Modifier.fillMaxWidth(),
            onClick = {
                signingUp = !signingUp; error = ""
                if (signingUp && server.isNotBlank()) scope.launch {
                    store.http.baseUrl = store.normalizeServer(server)
                    runCatching { store.pager.config() }.onSuccess { inviteRequired = it.inviteRequired }
                }
            },
        ) { Text(if (signingUp) "Have an account? Sign in" else "New here? Create an account") }
    }
}
