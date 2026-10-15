import { installPresence } from "./core/presence";
import "@fontsource-variable/inter";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Greeting } from "./ui/Greeting";
import { Titlebar } from "./ui/Titlebar";
import "./styles.css";
import { loadPhoto } from "./core/wallpapers";
import { loadCustomSound } from "./core/customsound";

void loadCustomSound(); // a sound of your own for alerts, if you added one
void loadPhoto(); // a wallpaper photo of your own, if you added one

createRoot(document.getElementById("root")!).render(<><Titlebar /><App /><Greeting /></>);

// Everything that moves stops while the window is in the background or minimised: no point drawing what nobody can see.
installPresence();
const syncIdle = () => document.documentElement.toggleAttribute("data-idle", document.hidden || !document.hasFocus());
window.addEventListener("focus", syncIdle); window.addEventListener("blur", syncIdle); document.addEventListener("visibilitychange", syncIdle); syncIdle();
