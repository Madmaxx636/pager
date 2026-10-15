package app.pager.android

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

/** What the pager says when you open the app. Silly and 90s, in the voice of a pager. */
object Greetings {
    val all = listOf(
        "BEEP!!",
        "BEEP BEEP!",
        "BEEEEEEP!",
        "May the force be with you",
        "Howdy!",
        "Page me maybe?",
        "143!",
        "07734",
        "Cowabunga!",
        "Radical!",
        "Totally tubular!",
        "Gnarly, dude!",
        "All that and a bag of chips",
        "Talk to the hand",
        "Don't have a cow",
        "As if!",
        "Whatever!",
        "Booyah!",
        "Word up!",
        "Dial-up not required",
        "You've got Pages!",
        "Call me back ASAP!",
        "Clipped to your belt",
        "Please hold… just kidding",
        "Is this thing on?",
        "Boop!",
        "Y2K ready!",
        "Doctor on call!",
        "Beep me if you wanna reach me",
        "Stay tuned, dude",
        "Rewinding your messages…",
        "Insert quarter for more pages",
        "Hang loose!",
        "Hello, 1997!",
        "Low battery? Nah.",
        "Mission accomplished: you showed up",
        "Pagers assemble!",
        "Ring ring, I mean beep beep",
        "Not a toaster",
        "Out of range? Never!",
        "You rang?",
        "Ahoy, matey!",
        "Beep boop, human",
        "Roger that!",
        "10-4, good buddy",
        "Wassup?!",
        "What's the sitch?",
        "Hasta la vista, baby",
        "Where's the beef?",
        "Eat my shorts!",
        "Schwing!",
        "Da-na-na-na, Batman!",
        "Is it Friday yet?",
        "Dude, where's my pager?",
        "Hey, nineteen-ninety-who?",
        "Be kind, rewind",
        "Blow in the cartridge",
        "Saved by the bell",
        "This is so fetch",
        "Make like a tree and leave",
        "Not! Just kidding",
        "Get a clue!",
        "No way, José!",
        "Cool beans",
        "Rad-ical, dude",
        "Bodacious!",
        "Aw, snap!",
        "Don't go chasing waterfalls",
        "Livin' la vida loca",
        "Spice up your day",
        "Thank u, next… I mean, hello",
        "Tamagotchi is hungry!",
        "You've got mail!",
        "A/S/L?",
        "brb, ttyl",
        "g2g, mom's on the phone",
        "Hold the phone!",
        "Nothing but net",
        "Pogs and slammers!",
        "Surf the information highway",
        "Loading… please wait",
        "Windows 95 says hi",
        "Press any key to continue",
        "Insert disc 2",
        "Blockbuster night!",
        "Pizza party!",
        "Choose your fighter!",
        "Finish him! …with kindness",
        "Hadouken!",
        "It's dangerous to go alone",
        "Wah-hoo!",
        "Level up!",
        "Player 2 has joined",
        "Continue? 9…8…7…",
        "Gotta catch 'em all",
        "Wazzzup?!",
        "Away message: gone fishing",
        "Top 8 updated!",
        "Poke!",
        "Hey, it's your 2003 self",
        "Flip phone energy",
        "T9 wizard in the house",
        "Snake high score: 2,048",
        "Ringtone: polyphonic!",
        "Sent from my Razr",
        "Burn me a CD",
        "Now playing: on repeat",
        "Lol u there?",
        "brb, charging",
        "<3 u 4eva",
        "xoxo gossip pager",
        "Y2K survivor",
        "Hot Topic hello",
        "Mood: low-rise",
        "Bling bling!",
        "That's hot",
        "I'm lovin' it",
        "Frosted tips unlocked",
        "Zune? No, Pager!",
        "Dial 1-800-HELLO",
        "Page me, I'm not a robot",
        "Your call is important to us",
        "Pardon my beep",
        "Can you hear me now?",
        "Good.",
        "Hello, Moto",
        "Texting like it's 2005",
        "Hi, you!",
        "You're doing great",
        "Tiny beep for a big day",
        "Sending you good vibes",
        "Warm hugs, via radio waves",
        "A little beep, just for you",
        "Snacks are important, remember",
        "Water break?",
        "Be nice to yourself",
        "You're my favorite beep",
        "Boop! Smooch!",
        "Sparkle mode on",
        "Your pocket friend is here",
        "Cozy beep",
        "Soft landing, friend",
        "Sunshine, delivered",
        "Today's mood: cuddly",
        "Gentle reminder: you rock",
        "Hello hello hello",
        "Pager loves you",
        "Pocket-sized joy",
        "Be the beep you wish to see",
        "Cheers, dear!",
        "One little page at a time",
    )
    fun pick(random: kotlin.random.Random = kotlin.random.Random) = all[random.nextInt(all.size)]

    /** Once per run of the app: closing it completely and opening it again says something new. */
    @Volatile var shown = false
}

@Composable
fun GreetingOverlay() {
    val on = LocalSettings.current.greetings
    var visible by remember { mutableStateOf(on && !Greetings.shown) }
    val text = remember { Greetings.pick() }
    LaunchedEffect(Unit) {
        if (visible) { Greetings.shown = true; delay(2400); visible = false }
    }
    AnimatedVisibility(visible, enter = fadeIn() + scaleIn(initialScale = 0.9f), exit = fadeOut()) {
        Box(
            Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.55f)).dpadFocus().clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { visible = false },
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.padding(32.dp)) {
                PagerMascot(150.dp, mood = MascotMood.Ring)
                Text(
                    text, color = Color(0xFF0B4A22), fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 22.sp, textAlign = TextAlign.Center,
                    modifier = Modifier.clip(RoundedCornerShape(14.dp)).background(Color(0xFF8CEB99)).padding(horizontal = 20.dp, vertical = 14.dp),
                )
            }
        }
    }
}
