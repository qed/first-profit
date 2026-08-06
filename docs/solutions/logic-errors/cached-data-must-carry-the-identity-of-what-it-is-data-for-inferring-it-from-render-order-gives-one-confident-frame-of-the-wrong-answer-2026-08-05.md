---
title: "Cached data must carry the identity of what it is data FOR — inferring it from render order gives you one confident frame of the wrong answer"
module: fp-staff-watchtower
date: 2026-08-05
problem_type: logic_error
component: state-management
severity: high
symptoms:
  - "Selecting a new criterion produced one committed frame whose heading, task rows and caption were the NEW criterion while every number came from the OLD criterion's payload"
  - "Reproduced with flushSync: caption 'Flow through step 1.2 — Make a real sale', nine ideas shown sitting on 1.2.1, footer '9 ideas live' — every figure derived from 1.1's payload, which contains no 1.2 task id at all"
  - "The wrong data passed the placement gate by coincidence: 1.2's entry predecessor is 1.1.5, a task that IS present in the 1.1 payload, so the numbers looked plausible rather than broken"
  - "No behavioural test could observe it — every criterion switch in the suite goes through act(), which flushes effects before any assertion"
root_cause: race_condition
resolution_type: code_fix
last_updated: 2026-08-05
related_components:
  - src/screens/staff/StaffWatchtower.tsx (CohortEntry.criterionId; the `shown` derivation; the one fetch effect)
  - src/screens/staff/watchtowerCache.ts (the per-criterion cache key)
  - src/screens/__tests__/StaffWatchtower.test.tsx ("refuses to render an entry that does not BELONG to the selected criterion")
tags:
  - cache
  - identity
  - useeffect
  - render-derived-state
  - stale-data
  - structural-test
  - staff-tools
---

# Cached data must carry the identity of what it is data FOR

## Problem

The Watchtower shows one criterion's flow board at a time. Selecting a different
criterion changes shell-owned state, and the tab fetches that criterion's cohort
and caches it under a per-criterion key. The cached value was:

```ts
interface CohortEntry {
  cohort: NormalizedCohort;
  fetchedAt: number;
  rejectedChildren: number;
  rejectedIdeas: number;
  rejectedBusinesses: number;
}
```

Note what is missing: **nothing in the value records which criterion it
describes.** The key knew, but the key is not what gets rendered — the value is
lifted into a variable and the pairing between "the criterion currently
selected" and "the payload currently drawn" was maintained by a `useEffect` that
cleared the stale entry when the selection changed.

That is a race, and it is a race React guarantees you lose at least once. A
`useEffect` is a **passive** effect: React runs it after commit, and it may run
after paint. The heading, the task rows, the caption and the footer are all
render output and update immediately; the clearing effect does not. So every
criterion change produced one committed frame of the NEW criterion's chrome over
the OLD criterion's numbers.

Reproduced by forcing the commit with `flushSync`: the caption read
`Flow through step 1.2 — Make a real sale`, nine ideas were shown sitting on
task `1.2.1`, and the footer read `9 ideas live`. Every one of those figures was
computed from criterion 1.1's payload — a payload that contains no 1.2 task id
at all.

## Why it looked plausible instead of obviously broken

A frame of mismatched data usually announces itself: zeros everywhere, empty
rows, a "no data" state. This one did not, and the reason is worth stating
because it is the part that generalises.

The board's placement walk decides which task each unit is sitting on. It did
not reject those units, because criterion 1.2's entry predecessor is task
`1.1.5` — and `1.1.5` **is** in the 1.1 payload. The sanity check that should
have noticed "this data is not about this criterion" was satisfied by an
accident of the curriculum's shape: consecutive criteria overlap at exactly the
boundary task the walk looks at.

So the wrong payload produced confident, internally consistent, wrongly-labelled
numbers on a staff tool whose whole purpose is telling someone which child to
nudge. "It passed the validity check" was not evidence the data was valid; it
was evidence the check could not tell.

## Why it was untestable behaviourally

Every criterion switch in the suite goes through `act()`, and `act()` flushes
passive effects before control returns. The bad frame exists between commit and
effect-flush — precisely the window `act()` closes. **No behavioural test in
this codebase can observe the bug**, which is also why it survived a full unit
of test-writing.

The passing kill is structural. Seed the cache with an entry whose
`criterionId` disagrees with the selection, hold the replacing request open
forever so nothing else can supply data, and assert that nothing is drawn:

```tsx
it("refuses to render an entry that does not BELONG to the selected criterion", async () => {
  // The structural pin for the stale-frame bug. A behavioural test cannot see
  // it — `act()` flushes the replacing fetch before any assertion — so the
  // identity is asserted directly: an entry sitting under 1.2's cache key
  // while CLAIMING to be 1.1's must not be drawn under 1.2's heading. Only a
  // render that checks `criterionId` ON THE VALUE can refuse this.
  const cache = stubCache();
  const fetchedAt = Date.now();
  cache.store.set(watchtowerCacheKey("1.2"), {
    criterionId: "1.1",
    cohort: normalizeCohort(COHORT as never, fetchedAt),
    fetchedAt,
    /* … */
  });
  // The request never settles, so anything rendered came from that entry.
  const request = vi.fn((_path: string) => new Promise<StaffApiResult>(() => {}));
  /* … render at criterionId="1.2" … */
  expect(screen.queryByTestId("fp-watchtower-table")).toBeNull();
  expect(screen.getByRole("status").textContent).toBe(STAFF_COPY.watchtowerLoading);
});
```

The mismatched key/value pair is deliberately impossible for the production
writer to produce — that is the point. The test asserts the *render* checks
identity on the value, which is the only property that makes the bad frame
unreachable.

## Solution

Put the identity in the value, and decide what to show **during render** rather
than after commit:

```ts
/**
 * One criterion's board. `criterionId` is part of the VALUE, not just the cache
 * key, so the render can prove the payload belongs to the selection it is about
 * to draw a heading for.
 */
interface CohortEntry {
  criterionId: string;
  cohort: NormalizedCohort;
  fetchedAt: number;
  /* … */
}
```

```tsx
// ── What is SHOWN: the entry that BELONGS to this criterion, or nothing.
// `entry` is preferred over the cache so a manual refresh (which CLEARS the
// cache before it fetches) keeps the stale table on screen, and a REFUSED
// cache write leaves the previous board standing rather than rendering a
// payload the session no longer owns.
const cached = cache.read<CohortEntry>(watchtowerCacheKey(criterion));
const shown =
  entry && entry.criterionId === criterion
    ? entry
    : cached && cached.criterionId === criterion
      ? cached
      : null;
```

The effect's job shrinks to the one thing an effect is entitled to do — start
work — and its comment says so:

```tsx
// One effect owns "does the selected criterion need fetching". What is SHOWN
// is derived during render instead, so no committed frame can pair this
// step's heading with the last step's numbers.
```

## Why this works

The bad frame is not fixed by making the effect faster; it is made
**unrepresentable**. `shown` is a pure function of the current selection and the
data's own claim about itself, evaluated in the same pass that produces the
heading. There is no ordering between the two, so there is no window. A payload
that does not match is simply not data yet, and the tab shows its loading state
— which is the truth.

The same header states the principle for the whole screen:

```
 * ── The rendered payload is CHOSEN BY IDENTITY, not by an effect ──
 * A criterion change re-renders the heading and the window immediately, but a
 * passive effect runs only after commit — so an entry with no criterion identity
 * gave one committed frame of the NEW step's caption over the OLD step's numbers.
```

## Prevention

- **Cached or async-loaded state must carry the identity of the request it
  answers.** A key in a `Map` is not enough the moment the value is lifted out
  into a variable, passed as a prop, or held in a state field — the key stays
  behind and the value travels alone. Put the discriminator *in* the payload
  and check it where the payload is consumed.
- **Never let a `useEffect` be the only thing maintaining a correspondence the
  render depends on.** Effects run after commit; therefore there is always at
  least one frame in which they have not run. If the invariant is "these two
  things agree", derive one from the other during render.
- **When a bug is unobservable because the test harness flushes the mechanism
  that hides it, assert the invariant structurally.** `act()` closing the window
  is not evidence the window is closed in production. Construct the impossible
  state directly and assert the code refuses it.
- **Treat "the wrong data passed the validity check" as a finding about the
  check, not a reassurance about the data.** Here the placement gate accepted
  1.1's units under 1.2 because the curriculum's criteria overlap at their
  boundary task. A check that cannot distinguish adjacent inputs is not
  protecting the thing it appears to protect.
- On any surface where a label and a number come from different sources, ask
  what renders them *in the same pass*. If the answer is "an effect keeps them
  in step", the label and the number will disagree, and the disagreement will be
  a screenshot someone acts on.
