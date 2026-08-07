/**
 * SIDE-EFFECT BOOT MODULE — the strip, hoisted (v3 Unit 6 review, FIX 4).
 *
 * THE PROBLEM THIS EXISTS TO SOLVE
 * `src/index.tsx` used to call `consumeEnterLink()` as a STATEMENT, with
 * `import { App } from "./App"` sitting above it. ES module imports are
 * hoisted: every imported module's body is fully evaluated BEFORE the first
 * statement of the importing module runs. So the entire App tree — GameProvider,
 * GameContext, lib/auth, every screen and everything they transitively import —
 * was evaluated while the live one-time sign-in code was STILL IN THE URL. The
 * comment in index.tsx claimed the opposite. Nothing in that tree reads
 * `location` at module scope today, so nothing leaked — but the invariant a
 * future contributor would rely on when adding Sentry/analytics was false.
 *
 * THE FIX, AND WHY IT IS ACTUALLY TRUE
 * Module evaluation is a post-order depth-first walk of each module's requested
 * modules IN SOURCE ORDER. So a side-effect import placed ABOVE `./App` is
 * guaranteed by the language to run to completion before `./App`'s body — and
 * `consumeEnterLink()` is that body here. The guarantee is ordering, not luck:
 * it holds in dev (native ESM), in the Rollup/Vite build (side-effectful bare
 * imports keep their order), and for any module the App tree pulls in.
 *
 * Chosen over `await import("./App")` deliberately: a dynamic import would also
 * be correct, but it splits App into its own chunk and costs a serial round
 * trip on first paint — a real cost on the phones this app is used on, to buy
 * an ordering the static form already gives.
 *
 * ⚠ DO NOT convert `import "./screens/auth/bootEnterLink"` in src/index.tsx
 *   into a named import, move it below another local import, or delete it as
 *   "unused". `src/screens/auth/__tests__/bootOrder.test.ts` fails if you do.
 */
import { consumeEnterLink } from "./enterLink";

consumeEnterLink();
