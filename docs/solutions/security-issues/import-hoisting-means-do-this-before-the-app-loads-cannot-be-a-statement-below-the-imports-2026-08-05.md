---
module: auth
tags: [es-modules, import-hoisting, boot-order, token-stripping, url-fragment, invariant]
problem_type: security_issue
component: authentication
severity: medium
symptoms:
  - "A comment promises something runs before the app, but it runs after every import"
  - "A cleanup/strip/redaction step is placed below the import block and believed to be first"
  - "No live defect yet, because nothing in the import tree happens to observe the thing being protected"
root_cause: wrong_api
resolution_type: code_fix
---

# Import hoisting means "do this before the app loads" cannot be a statement below the imports

## Problem

The cross-domain sign-in handoff delivers a one-time code in the URL fragment. That
code is a live credential, so it must be read and stripped from the address bar before
anything can observe it — the router, any effect, and in particular any analytics or
error-reporting SDK that a future contributor might add (those capture `location.href`
on init).

The entry point looked right, and said so:

```tsx
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { consumeEnterLink } from "./screens/auth/enterLink";

// Read + strip BEFORE createRoot/render, so the stage machine, any effect, and any
// analytics or error-reporting script that may later be added can only ever observe
// the already-stripped URL.
consumeEnterLink();

createRoot(document.getElementById("root")!).render(<App />);
```

The comment is false. ES module `import` declarations are **hoisted**, and a module's
dependencies are evaluated — fully, top-level bodies and all — *before the first
statement of the importing module runs*. So the order is actually:

```
react-dom/client body -> App body -> (GameProvider, GameContext, lib/auth, every screen,
                                      and everything they transitively import)
-> enterLink body
-> consumeEnterLink()     <- the strip, dead last
-> render
```

The entire application module tree evaluates with the live code still in the URL.
`consumeEnterLink()` being physically below the imports buys nothing.

There was no live leak: nothing in that tree reads `location` at module scope *today*.
But the comment is exactly the kind a future contributor relies on — "the strip already
happened, so I can safely `Sentry.init()` wherever" — and the moment anyone adds a
top-level SDK init anywhere in that tree, the credential is captured and the whole
fragment-hygiene design silently fails.

## Symptoms

- A comment or design note says "this runs before the app / before anything else",
  and the code backing it is a plain call below an import block.
- The protection is for something ambient — the URL, `document.cookie`,
  `localStorage`, a global — that any module could read at evaluation time.
- Nothing is broken, because no current module in the tree happens to read it. The
  defect is entirely in the invariant, not the behavior.
- Grepping for the protected thing finds no violators, which reads as confirmation
  and is actually just luck.

## What Didn't Work

- **Reading the file top to bottom.** Source order and execution order differ here, and
  the file reads correctly in source order.
- **`await import("./App")` after the strip.** This does work — dynamic import defers
  evaluation — but in a Vite SPA it splits `App` into its own chunk and costs a serial
  round trip before first paint. On a mobile-first product that is a real cost to buy a
  guarantee available for free.

## Solution

Make the strip a **module** and import it first, so the language's own evaluation order
provides the guarantee:

```tsx
// src/index.tsx
import "./screens/auth/bootEnterLink";   // FIRST. Side-effect only, exports nothing.
import { createRoot } from "react-dom/client";
import { App } from "./App";
```

```ts
// src/screens/auth/bootEnterLink.ts
// Side-effect module: reads and strips the one-time code at module-evaluation time.
// Imported first from index.tsx so ES module evaluation order (post-order DFS, in
// source order) guarantees this completes before ./App's tree is evaluated.
import { consumeEnterLink } from "./enterLink";
consumeEnterLink();
```

Module evaluation is a post-order depth-first walk of the dependency graph in source
order, so a bare import placed above the others provably runs to completion first. The
guarantee stops being a claim about where a statement sits and becomes a property of the
module system.

Then pin it, because the whole failure mode is that the ordering is invisible:

```
bootOrder.test.ts asserts: the import exists, it is bare (no bindings), it is the FIRST
JS import in index.tsx, no loose `consumeEnterLink(` statement survives, and the boot
module exports nothing.
```

(The emitted bundle confirmed it independently: the enterLink body appears at byte ~944,
the App tree at ~140841, with no extra chunk.)

## Why This Works

`import` is not a runtime instruction that executes where it appears; it is a static
declaration that the module graph resolves and evaluates before the importing module's
body starts. Anything you want to happen "first" must therefore be *part of the graph*,
positioned earlier in it — not a call in the body. Putting the work in a side-effect
module and importing it first expresses precisely that.

## Prevention

- **"Before the app loads" means before the imports, which means it must be an
  import.** Any setup that must precede the module tree — token stripping, feature-flag
  bootstrapping, a polyfill, a global error handler that must not miss early throws —
  belongs in a bare side-effect module imported first, never in a statement below the
  import block.
- **Pin import ORDER with a test when order is the guarantee.** Ordering is invisible to
  every other check: it type-checks, it lints, it passes tests, and a reviewer reading
  top-to-bottom sees the intent, not the execution. A five-line assertion on the entry
  file is the only thing that survives a future import being added above it.
- **Prefer the static side-effect module over `await import()`** when the only reason
  for the dynamic form is ordering. Dynamic import buys deferral you may not want, and
  in a bundler it usually buys a chunk split too.
- **A comment claiming an ordering guarantee is a request for a test.** This was the
  fourth time on one branch that a comment asserted a property the code did not have
  (the others: an authorization invariant, a feature-flag reach, and a Bearer-token path
  that was never wired). Treat "this runs before X" / "this can only ever see Y" in a
  comment the same way you would treat a security assertion: prove it or delete it.
- Related: [a flag that gates the page does not gate its Server Actions](../../../../Aardvark/120-The120/docs/solutions/security-issues/a-flag-that-gates-the-page-does-not-gate-its-server-actions-they-are-separately-addressable-endpoints-2026-08-05.md)
  (the120 repo — same family: a guarantee assumed at one layer that the layer below
  never provided).
