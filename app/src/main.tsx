import { installPresence } from "./core/presence";
import "@fontsource-variable/inter";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Greeting } from "./ui/Greeting";
import { Titlebar } from "./ui/Titlebar";
import "./styles.css";
import { loadPhoto } from "./core/wallpapers";
import { loadCustomSound } from "./core/customsound";
import { ErrorBoundary, recordProblem } from "./ui/ErrorBoundary";

void loadCustomSound(); // a sound of your own for alerts, if you added one
void loadPhoto(); // a wallpaper photo of your own, if you added one

createRoot(document.getElementById("root")!).render(<ErrorBoundary><Titlebar /><App /><Greeting /></ErrorBoundary>);
// Problems that do not break the screen are written down too, and the desktop shell is told the page is alive (it restarts a page that goes silent).
window.addEventListener("error", (e) => recordProblem("error", e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => recordProblem("unhandled promise", e.reason));
window.setInterval(() => window.pagerDesktop?.beat?.(), 5000);

// Everything that moves stops while the window is in the background or minimised: no point drawing what nobody can see.
installPresence();
const syncIdle = () => document.documentElement.toggleAttribute("data-idle", document.hidden || !document.hasFocus());
window.addEventListener("focus", syncIdle); window.addEventListener("blur", syncIdle); document.addEventListener("visibilitychange", syncIdle); syncIdle();
