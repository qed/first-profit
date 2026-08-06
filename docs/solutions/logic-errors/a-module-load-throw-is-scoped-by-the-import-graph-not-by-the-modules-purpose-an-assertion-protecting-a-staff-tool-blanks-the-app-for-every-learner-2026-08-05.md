---
title: "A module-load throw is scoped by the import graph, not by the module's purpose — an assertion protecting a staff tool blanks the app for every learner"
module: fp-staff-watchtower
date: 2026-08-05
problem_type: logic_error
component: build-config
severity: high
symptoms:
  - "A module-scope budget assertion in flowBoard.ts was added to 'fail loudly' if a curriculum edit pushed a request over its id budget, with the recorded blast radius 'a staff tab that stopped loading'"
  - "App.tsx imports StaffShell STATICALLY and the shell statically imports the Watchtower tab, which imports flowBoard — so a top-level throw aborts the entry module graph and every LEARNER gets a blank page, not just staff"
  - "The comment claimed the build catches it; it does not — the build preflight never imported the module and `vite build` bundles top-level code without executing it"
  - "The assertion was byte-for-byte the same loop as an existing test, so neutering it left the whole suite green: risk with no added coverage"
root_cause: false_assumption
resolution_type: code_fix
last_updated: 2026-08-05
related_components:
  - src/screens/staff/flowBoard.ts (REQUESTED_TASK_IDS_BUDGET, REQUESTED_TASK_IDS_CAP, requestedTaskIds)
  - src/App.tsx (static `import { StaffShell }`)
  - src/screens/staff/StaffShell.tsx (static `import { StaffWatchtower }`)
  - scripts/check-path-content.ts (section 5 — WATCHTOWER request budget, the gate that actually executes)
  - src/screens/staff/__tests__/flowBoard.test.ts ("stays well under the server's 32-id cap for EVERY criterion", "is importable without side effects — no module-load throw")
tags:
  - module-load
  - import-graph
  - blast-radius
  - fail-fast
  - build-gate
  - static-import
  - staff-tooling
  - availability
---

# A module-load throw is scoped by the import graph, not by the module's purpose

## Problem

`flowBoard.ts` builds the `?tasks=` list the Watchtower sends to the120's
`/api/fp/progress`: one criterion's ~5 task ids, plus the single predecessor id
from the preceding criterion, plus every OTHER SPELLING those ids might still
have in a child's save doc (legacy `${stepId}#${index}` keys, and old stable ids
a `TASK_REMAP` entry has moved). The endpoint refuses past
`PROGRESS_MAX_REQUESTED_TASK_IDS = 32`, so the client holds itself to half that.

The risk is real. A curriculum edit that grows a criterion, or a fat `TASK_REMAP`,
would push a request over the cap and 400 in production, visible only to whoever
next opened the tab. So a budget assertion was added at module scope, deliberately,
to fail loudly. The recorded blast radius was "a staff tab that stopped loading".

That is wrong, and the import graph is the reason. `App.tsx` imports the staff
shell statically:

```tsx
import { StaffShell } from "./screens/staff/StaffShell";
```

and the shell statically imports the Watchtower tab, which imports `flowBoard`:

```tsx
import { StaffWatchtower } from "./StaffWatchtower";
```

No `React.lazy`, no dynamic `import()`, no route-level code split. A top-level
throw in an eagerly-imported ES module aborts evaluation of the entry module
graph — the app never mounts. Every learner, on a phone, mid-lesson, gets a blank
page. An assertion protecting an internal staff tool was a production outage for
children, and the property that makes it so appears in neither `flowBoard.ts`'s
diff nor its purpose statement. It is a property of a file two hops away.

Two further problems compounded it:

- **The claim about the build was false.** The comment asserted the build catches
  a budget breach. `scripts/check-path-content.ts` never imported the module, and
  `vite build` bundles top-level code without executing it. Nothing in the deploy
  path ever evaluated the assertion. The only thing that did was the test run —
  which reaches it by importing the module, not because the assertion was designed
  as a gate.
- **It was unkillable by mutation.** The assertion was byte-for-byte the same loop
  as a test that already existed, so neutering the assertion left the suite green.
  It carried the entire outage risk and added no coverage whatsoever.

## Solution

Delete the module-load throw. Keep the test. Move the gate to the script that
already gates this class of change and that actually executes.

The constant now documents its own enforcement, and why it is deliberately not a
throw:

```ts
/**
 * The budget this client holds itself to: half the server's cap.
 *
 * A criterion is ~5 tasks plus one predecessor plus their legacy aliases and any
 * remapped old ids, so today's worst case is nowhere near this.
 *
 * THE GUARD IS THE TEST — `flowBoard.test.ts` ("stays well under the server's
 * 32-id cap for EVERY criterion") — plus `scripts/check-path-content.ts`, the
 * build preflight where content edits are already gated. It is deliberately NOT
 * a module-load throw: `App.tsx` imports `StaffShell` statically and Unit 5
 * pulls this module in behind it, so a top-level throw would abort the entry
 * module graph and blank the app for every LEARNER, not just staff. (`vite build`
 * bundles without executing top-level code, so a throw would not have been a
 * build gate either.)
 */
export const REQUESTED_TASK_IDS_BUDGET = 16;
```

The preflight — which `npm run build` runs BEFORE vite, so Vercel can never
deploy past it — imports the module and walks every criterion:

```ts
  // 5: REQUEST BUDGET — the staff Watchtower asks the120's /api/fp/progress for
  // one criterion's task ids plus their other spellings, and that endpoint
  // refuses past PROGRESS_MAX_REQUESTED_TASK_IDS. A content edit that grows a
  // criterion (or a fat TASK_REMAP) would push a request past the cap and 400 in
  // production, visible only to whoever next opened the tab. Checked HERE
  // because this is where content edits are already gated — flowBoard.ts
  // deliberately does NOT throw at module load: App.tsx imports the staff shell
  // statically, so a top-level throw would blank the app for every learner.
  const { REQUESTED_TASK_IDS_BUDGET, REQUESTED_TASK_IDS_CAP, requestedTaskIds } = await import(
    "../src/screens/staff/flowBoard"
  );
```

and a test pins the absence of the throw, so nobody helpfully adds it back:

```ts
  it("is importable without side effects — no module-load throw", async () => {
    // App.tsx imports StaffShell statically and Unit 5 pulls this module in
    // behind it, so a top-level throw here would blank the app for every
    // LEARNER, not just staff. The budget guard is this suite plus the build
    // preflight, never module evaluation.
    await expect(import("../flowBoard")).resolves.toBeDefined();
  });
```

## Why This Works

The failure now happens where the class of change that causes it is made. A
budget breach can only arise from a content edit or a `TASK_REMAP` edit, and both
already pass through `check-path-content.ts` on every build. That script runs
before vite, refuses the deploy, and prints the offending criterion and its count
— strictly more information than a thrown `Error` at import time, delivered to
the person who caused it rather than to a child opening the app.

"Fail loudly" was the right instinct pointed at the wrong axis. The question is
never only *how* loudly, but *to whom, at what moment, and taking what down with
it*. A module-scope throw answers all three by the shape of the import graph,
which is not a fact about the module and is not visible in it.

## Prevention

- **Before adding a module-scope throw, trace the import graph to the entry
  point.** `grep` the importers of your module, then their importers, until you
  reach `main.tsx` / `App.tsx`. If every hop is a static import, the blast radius
  is the whole app regardless of what the module is for. Only a `React.lazy` or a
  dynamic `import()` boundary contains it.
- **A claim about which build step catches a failure is checkable in about a
  minute — check it.** "The build catches this" was false here in two ways, and it
  is exactly the sentence a future reader relies on instead of re-deriving the
  answer. If you cannot point at the line that executes the check, do not write
  the claim.
- **Bundling is not evaluation.** `vite build` will happily bundle a module whose
  top level throws. A top-level assertion is a RUNTIME gate for whoever loads the
  bundle, never a build gate.
- **If an existing test already asserts the property, the module-load assertion
  adds risk and no coverage.** Delete the mechanism and re-run the suite: if it
  stays green, the mechanism is buying nothing but exposure.
- **Fail in a step that already gates the class of change you are worried
  about.** Content edits are gated by the content preflight; schema edits by the
  migration check; type contracts by the compiler. Putting the gate where the
  cause lives also puts the error message in front of the right person.
- **Record the absence as a test when the tempting version is dangerous.** An
  "importable without side effects" test plus a comment naming the import graph is
  what stops the next contributor re-adding the throw for the same good reason.
