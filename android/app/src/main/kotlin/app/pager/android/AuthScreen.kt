package app.pager.android

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
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
    val shape = RoundedCornerShape(16.dp)

    Column(Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(28.dp), verticalArrangement = Arrangement.Center) {
        PagerLogo(64.dp)
        Spacer(Modifier.height(20.dp))
        Text(if (signingUp) "Create your account" else "Welcome to Pager", style = MaterialTheme.typography.headlineMedium)
        Text("All your chats in one inbox, on your own server.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
        Spacer(Modifier.height(28.dp))

        OutlinedTextField(server, { server = it }, label = { Text("Server") }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = shape, placeholder = { Text("matrix.example.com") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri))
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(username, { username = it.lowercase().trim() }, label = { Text("Username") }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = shape)
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(password, { password = it }, label = { Text("Password") }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = shape, visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
        if (signingUp && inviteRequired) {
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(invite, { invite = it }, label = { Text("Invite code") }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = shape)
        }
        if (error.isNotEmpty()) Text(error, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 12.dp))
        Spacer(Modifier.height(24.dp))
        Button(
            enabled = !busy && server.isNotBlank() && username.isNotBlank() && password.isNotEmpty(),
            modifier = Modifier.fillMaxWidth().height(54.dp), shape = shape,
            onClick = {
                busy = true; error = ""
                scope.launch {
                    try {
                        store.http.baseUrl = store.normalizeServer(server)
                        if (signingUp) store.pager.signup(username, password, invite.trim())
                        store.signIn(server, username, password)
                    } catch (e: Exception) { error = e.message ?: "Something went wrong" }
                    busy = false
                }
            },
        ) { Text(if (busy) "One moment…" else if (signingUp) "Create account" else "Sign in", style = MaterialTheme.typography.titleMedium) }
        TextButton(
            modifier = Modifier.fillMaxWidth().align(Alignment.CenterHorizontally),
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
