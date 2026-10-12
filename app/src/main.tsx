import "@fontsource-variable/inter";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Greeting } from "./ui/Greeting";
import "./styles.css";
import { loadPhoto } from "./core/wallpapers";

void loadPhoto(); // a wallpaper photo of your own, if you added one

createRoot(document.getElementById("root")!).render(<><App /><Greeting /></>);
