// THE FIRST THING THE APP DOES WITH THE URL (v3 Unit 6). The handoff sign-in
// code arrives in the fragment at /auth/enter; this side-effect import reads it
// into memory and rewrites the history entry.
//
// IT IS AN IMPORT, NOT A STATEMENT, AND IT IS FIRST, ON PURPOSE. ES imports are
// hoisted — a `consumeEnterLink()` call further down this file would run AFTER
// the whole App module tree had already been evaluated with the live code still
// in the URL. Module bodies evaluate depth-first in source order, so placing
// this above every other import is what actually makes the guarantee true: the
// stage machine, every effect, and any analytics or error-reporting script a
// future contributor adds inside the app can only ever observe the
// already-stripped URL. See src/screens/auth/bootEnterLink.ts for the full
// rationale, and src/screens/auth/__tests__/bootOrder.test.ts for the guard.
//
// (Only the font/CSS imports below sit lower; they are stylesheets and Vite
// hoists no JS behind them. The guard test pins this import ahead of every
// JS module.)
import "./screens/auth/bootEnterLink";

// Self-hosted fonts (Fontsource) — no Google Fonts network requests.
import "@fontsource-variable/fraunces/opsz.css";
import "@fontsource-variable/inter";
import "@fontsource/spline-sans-mono/400.css";
import "@fontsource/spline-sans-mono/500.css";
import "@fontsource/spline-sans-mono/600.css";
import "@fontsource/spline-sans-mono/700.css";
import "@fontsource/caveat/400.css";
import "@fontsource/caveat/500.css";
import "@fontsource/caveat/600.css";
import "@fontsource/caveat/700.css";
import "./index.css";
import ReactDOM from "react-dom/client";
import { App } from "./App";

const rootEl = document.getElementById("root");
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(<App />);
}