import "@fontsource-variable/inter";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Greeting } from "./ui/Greeting";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<><App /><Greeting /></>);
