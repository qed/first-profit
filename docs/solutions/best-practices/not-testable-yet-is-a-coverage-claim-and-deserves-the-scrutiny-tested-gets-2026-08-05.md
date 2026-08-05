---
title: "'Not testable yet' is a coverage claim and deserves exactly the scrutiny 'tested' gets — try writing the test, and prove every substitute pin fails against its mutant"
module: fp-staff-shell
date: 2026-08-05
problem_type: process_gap
component: development_workflow
severity: medium
applies_when: "A unit ships a guarantee whose only real exerciser arrives in a LATER unit, and the implementer proposes a substitute assertion instead"
symptoms:
  - "Two guarantees ('exactly one refresh grant across concurrent callers', 'a refusal clears a POPULATED cache') were declared untestable in this unit because the second tab makes no requests until Unit 5"
  - "The substitute pin — callsTo('grant_type=refresh_token') === 1 — ran a scenario containing exactly ONE caller, so it reads 1 whether or not de-duplication exists, and passes with the mechanism deleted"
  - "Two cache-clearing tests were both named for the guarantee and neither pinned it: dropSession and signIn each reset the cache, so deleting either alone left the suite green"
root_cause: missing_workflow_step
resolution_type: workflow_improvement
last_updated: 2026-08-05
related_components:
  - src/screens/__tests__/StaffShellRaces.test.tsx (the vi.mock probe tab)
  - src/screens/staff/singleFlight.ts (the de-duplication under test)
  - src/screens/staff/StaffShell.tsx (dropSession as the single owner of the cache reset)
tags:
  - testing
  - mutation-testing
  - coverage-claim
  - test-double
  - single-owner
  - review
  - vitest
---

# "Not testable yet" is a coverage claim and deserves exactly the scrutiny "tested" gets

## Problem

Unit 3 of the Watchtower turned `/staff` into a two-tab shell. Two of its
guarantees have no natural exerciser yet, because the second tab (`StaffWatchtower`)
renders a placeholder and makes no requests until a later unit:

1. **exactly one refresh grant across concurrent callers** — needs two readers
   racing a 401, and there is only one reader;
2. **a refusal clears a POPULATED cache** — needs data in the cache from a tab
   other than the one being refused.

The implementer said so honestly rather than hiding it, and offered substitute
assertions. That framing is the trap. "Not testable yet" is not a status; it is a
**claim about the world**, and it sits in exactly the place a coverage claim sits
— it tells the next reader that the absence of a test is explained, so they stop
looking.

Both instances of it in this unit were wrong, in different ways.

**The claim was false.** A reviewer disproved it by writing the test. A test-only
`vi.mock` of the placeholder tab module supplies a stub that calls the shell's
`request` directly, as many times and as concurrently as the scenario needs:

```tsx
/** What the stub tab should do when it mounts. Set per test. */
const probe: { paths: string[]; results: string[] } = { paths: [], results: [] };

vi.mock("../staff/StaffWatchtower", async () => {
  const react = await import("react");
  return {
    StaffWatchtower: ({ request }: { request: (p: string) => Promise<{ kind: string }> }) => {
      const started = react.useRef(false);
      react.useEffect(() => {
        if (started.current) return;
        started.current = true;
        for (const path of probe.paths) {
          void request(path).then((res) => probe.results.push(`${path}:${res.kind}`));
        }
      }, [request]);
      return react.createElement("h2", { id: "fp-staff-panel-title" }, "Probe");
    },
  };
});
```

No production seam, no test-only prop, no `if (import.meta.env.TEST)`. The shell
is exercised exactly as shipped; only the module it renders is substituted. The
resulting probe passes on real source and fails on a mutant that removes the
de-duplication entirely:

```tsx
await act(async () => {
  gateA.resolve(jsonResponse(401, { ok: false }));
  gateB.resolve(jsonResponse(401, { ok: false }));
  await Promise.resolve();
});

expect(callsTo("grant_type=refresh_token")).toBe(1);
```

**The substitute pin was hollow.** The assertion offered in place of the real
test was `expect(callsTo("grant_type=refresh_token")).toBe(1)` — the same
assertion, in a shell test whose scenario contains exactly ONE caller. With one
caller the count is 1 whether or not de-duplication exists; the assertion passes
with `createSingleFlight` deleted from the shell. It reads like a pin and pins
nothing. The distinguishing question is never "does this assertion mention the
mechanism?" but "**would this assertion FAIL if the mechanism were gone?**"

**A second instance, same unit, different shape.** Two tests were named for the
cache-clearing guarantee and neither pinned it, because two code paths both
enforced it: `dropSession` reset the cache and `signIn` reset it again. Deleting
either one alone left the suite green. Only deleting BOTH was caught. What the
suite actually pinned was "at least one clear exists somewhere" — not "data dies
with the credential."

The fix was not a better test. It was making `dropSession` the single owner
FIRST:

```tsx
/**
 * Drop the session: state, storage, in-flight reads AND every tab's cached
 * data, in one update. The SINGLE owner of the cache reset — a second
 * clear elsewhere would mask this one in tests and drift from it in fact.
 * A sign-out from ANY tab clears ALL of them, so no cohort or suggestion data
 * survives the credential that fetched it.
 */
```

The redundant clear was not merely untested; it was **what made testing
impossible**. Two enforcers of one invariant mask each other, and no test written
against them can discriminate.

## The counter-lesson

After the fixes, two mutants remained unkillable, and both were left alone:

- One survives because three redundant epoch guards short-circuit any
  single-line mutation — `performRequest` re-checks `epoch.current !== startEpoch`
  after each await, and `renewOnce` checks it again inside. Remove any one and the
  others still catch it. The COMBINED mutant does die.
- One survives because a synchronous state set in the same flush makes an
  initial-value branch unobservable: nothing ever renders the pre-set value.

Both were flagged in the review record rather than engineered around.
**Mutation coverage is a means, not a target.** Contorting the code so a
redundant guard becomes individually observable — deleting two of the three
checks so the third is load-bearing — would trade real defence-in-depth for a
green metric. That is the wrong trade every time, and the reason the "unkillable"
list must carry reasons rather than counts.

## Prevention

- **Treat "not testable yet" as a claim to verify, not a status to accept.** The
  cheapest check is to try writing the test; a reviewer who spends twenty minutes
  on it either produces the test or produces a much better justification.
- **A substituted pin must be shown to FAIL against the mutant it stands in
  for**, or it is decoration. Delete the mechanism, run the test, watch it go red.
  If it stays green, the assertion is documentation with an `expect` around it.
- **When two code paths both enforce an invariant, they mask each other.**
  Consolidate ownership before writing the test — a single owner is both better
  code and the only shape a test can discriminate. Name the owner in a comment so
  the next contributor does not helpfully add the redundancy back.
- **Prefer a test-only module substitution to a production seam.** `vi.mock` of a
  collaborator keeps the unit under test byte-identical to what ships; a test-only
  prop or env branch changes the thing you are trying to verify.
- **When a mutant genuinely cannot be killed, record WHY next to the code**, so
  the next reviewer reads it as a deliberate property (redundant guards,
  unobservable initial value) and not as a gap to be closed.
