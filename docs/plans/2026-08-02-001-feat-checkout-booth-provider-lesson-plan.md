---
title: "feat: Checkout Booth provider-choice lesson (fpv2 Payment Phase 2)"
type: feat
status: active
date: 2026-08-02
origin: docs/brainstorms/2026-08-02-checkout-booth-provider-lesson-requirements.md
---

# feat: Checkout Booth provider-choice lesson (fpv2 Payment Phase 2)

## Overview

Replace the First Profit-branded Stripe **mock** in the Checkout Booth with a
**provider-choice lesson**: the student compares three payment providers, chooses one,
gets real-world setup guidance, and their logged sales are modeled net of the chosen
provider's per-sale fee. First Profit processes no money. See origin:
`docs/brainstorms/2026-08-02-checkout-booth-provider-lesson-requirements.md`.

## Problem Frame

First Profit is a framework for building a real business; the Checkout Booth teaches
the student's first money decision — **which service collects their money and gets it
to their parent**. First Profit Pay (50% fee) is a strawman; the student learns to
compare and pick a real provider (Replit or Shopify). The choice is felt because the
provider's per-sale fee is modeled in the ledger (gross -> fee -> net). Content comes
from `artifacts/checkout-booth-comparison.md`.

## Requirements Trace

- R24.1 provider comparison lesson · R24.2 First Profit Pay strawman @ 50% ·
  R24.3 early access (usable from start) · R24.4 account-global durable choice ·
  R24.5 per-sale fee modeled in ledger · R24.6 switch + coach beat (past sales keep
  their fee) · R24.7 real-sale logging (FP processes nothing) · R24.8 subscription
  shown + light running estimate; full accounting deferred to Criterion 4.2 ·
  R24.9 retire backing/mock plumbing · R24.10 real-world setup guidance · R24.11
  curriculum voice + 390px (no em dashes).

## Scope Boundaries

- No First Profit payment processing; no external-provider integration (setup is
  real-world, parent-controlled). No full P&L / fully-loaded-cost accounting (that is
  Criterion 4.2, Grow phase, built later — this plan leaves a forward reference only).
  No store-credit/redemption. Real money/payouts/launch = Phase 3.

## Context & Research

### Relevant Code and Patterns

- `src/components/rooms/CheckoutBooth.tsx` — the room body (the mock being replaced).
- `src/components/MockCheckout.tsx` + `OPEN_CHECKOUT`/`checkoutOpen` in
  `src/state/gameCore.ts` — the mock overlay to retire.
- `src/components/rooms/LedgerList.tsx` — the ledger row (one line: icon · payer ·
  amount); needs a gross->fee->net re-layout at 390px.
- `src/state/gameCore.ts` — `LedgerEntry {id, kind:"sale"|"backing", payer,
  amountCents}`, `LedgerKind`, `ADD_LEDGER` (a logged `sale` auto-completes the last
  task of criterion 1.2 for the active idea), `salesSumCents`/`backingSumCents`,
  `SaveDoc`/`toSaveDoc`/`fromSaveDoc`, `DOC_VERSION = 1`. NOTE: `toSaveDoc` EXCLUDES the
  ledger and `HYDRATE` clears it — the ledger is NOT in the save doc (see below).
- **The ledger is a RELATIONAL table `fp_ledger` (managed in The120's Supabase), not
  JSONB.** `src/lib/sync.ts` owns its persistence: `loadLedger` (reads
  `id, kind, payer, amount_cents, created_at`), `insertLedger` (writes them,
  `source` pinned to `'mock'` at ~:327), `flushLedgerViaKeepalive` (~:579, same pinned
  `source`), the kind validators at `~:258` (`loadLedger`) and `~:381`
  (`isValidLedgerRow`), and `OUTBOX_VERSION = DOC_VERSION`. `src/state/GameContext.tsx`
  `notifyLedger` (~:249) forwards `{id, kind, payer, amountCents}` from each new
  `state.ledger` row into the engine.
- `src/state/GameContext.tsx` + `src/lib/sync.ts` — server-side SAVE-DOC persistence is
  separate (`fp_player_saves`, JSONB, CAS-guarded); the ledger rides the `fp_ledger`
  path above.
- `src/data/path.ts` — curriculum; the Checkout Booth room + the 1.2 sale + the
  1.4.1/4.2.1 cost tasks.
- Shared UI primitives: reuse the overlay/dialog + card conventions the room screens
  already use (aria-modal, Escape-to-close, full-screen<sm / floating>=sm).

### Institutional Learnings (`docs/solutions/`)

- The RLS-values-not-columns / column-scoped-grant discipline if any new server column
  is child-writable — the new `fp_ledger` fee columns are client-inserted, so this applies.
- Cross-repo migration discipline: the `fp_ledger` schema lives in The120; new columns
  must be added (migration authored + applied per The120's migration ordering) BEFORE FP
  code writes them, or an insert fails on a missing column.

### External References

- `artifacts/checkout-booth-comparison.md` — the authoritative provider content, fees,
  and per-provider real-world setup walkthroughs (Replit, Shopify).

## Key Technical Decisions

- **CORRECTION (document-review): the ledger is a RELATIONAL table `fp_ledger` (in
  The120), NOT the JSONB save doc.** `toSaveDoc` excludes the ledger; `HYDRATE` clears
  it; `sync.ts` `loadLedger`/`insertLedger` and `GameContext.notifyLedger` are the
  real persistence path. Therefore the fee snapshot must be persisted as `fp_ledger`
  COLUMNS + threaded through `sync.ts`, and legacy-row back-fill happens in
  `loadLedger`/the DB — NOT in `fromSaveDoc`. This is a **cross-repo** change (a
  The120 Supabase migration adds the columns; FP code reads/writes them).
- **Ledger row is fee-snapshotted, persisted to `fp_ledger`.** Add columns
  `gross_cents`, `fee_cents`, `net_cents`, `provider_id` (keep `amount_cents` = gross).
  `LedgerEntry` gains `grossCents/feeCents/netCents/providerId`. `loadLedger` DEFAULTS
  legacy rows (`net = amount, fee = 0, providerId = null`) so a reload never yields
  `NaN`. A switch never rewrites past rows — "past sales keep their fee" (R24.6) holds
  because the fee is stored per row.
- **`$1,000` bar tracks NET, shows gross.** `salesSumCents` -> sum of `netCents`
  (with `loadLedger` defaults so legacy rows count at gross); add `grossSalesSumCents`
  for display; update `Hud.tsx`. The 1.2 sale auto-complete stays keyed on a logged
  `sale` EXISTING (verified: `markTaskDone` fires on `kind==='sale'` regardless of
  amount), so net does not break it.
- **Chosen provider lives in the save doc — NO DOC_VERSION bump.** Add `chosenProvider`
  (id + `chosenAt`) to `GameState` + `SaveDoc` as an additive OPTIONAL field;
  `fromSaveDoc` DEFAULTS it to `null` for existing v1 docs. Keep `DOC_VERSION = 1` — a
  bump is unnecessary (the field is additive-optional) and a bump would discard
  in-flight outbox entries (`OUTBOX_VERSION = DOC_VERSION`, `readOutbox` drops
  mismatched entries). The earlier "migrate ledger rows in `fromSaveDoc`" idea was
  wrong (see correction above).
- **Retire `kind:'backing'` across all readers.** Not just the reducer: `Hud.tsx`
  (backing stat), `GameContext.tsx` (`backingSumCents` bind/export), `sync.ts` kind
  validators (`:258`, `:381`), and the test suite. Existing `fp_ledger` `backing` rows
  are a DB-data decision made in the ledger-load path (drop-on-load is acceptable);
  confirm the `source`/`kind` CHECK constraints + whether a real logged sale keeps
  `source:'mock'` or needs a new `source` value.
- **Subscription is light now.** Shown in the comparison; a light running estimate uses
  a simple `chosenAt`-based elapsed heuristic (directional, not a P&L). Full accounting
  is Criterion 4.2.
- **Provider data is a pure module.** `src/data/providers.ts` holds the 3 providers,
  fee models, and comparison copy so the reducer/UI stay thin and testable.

## Open Questions

### Resolved During Planning

- Ledger field names: `grossCents`, `feeCents`, `netCents`, `providerId` (+ keep
  `amountCents` = gross for back-compat).
- `$1,000` bar: NET via `salesSumCents`; gross exposed separately.
- Provider set: `first_profit_pay` (50%), `replit` (2.9%+30c, ~$25/mo), `shopify`
  (2.9%+30c, ~$39/mo). Lovable dropped.
- Fee persistence: the ledger is relational (`fp_ledger`), so the fee snapshot is stored
  as NEW COLUMNS (`gross_cents`, `fee_cents`, `net_cents`, `provider_id`) added by a
  The120 Supabase migration and threaded through `sync.ts` — NOT in the JSONB save doc.
  Legacy amount-only rows are back-filled at load (`loadLedger`), not in `fromSaveDoc`.
- Save-doc change: `chosenProvider` is an additive OPTIONAL SaveDoc field, so
  DOC_VERSION STAYS 1 (no bump). A bump would discard in-flight outbox entries
  (`OUTBOX_VERSION = DOC_VERSION`, `readOutbox` drops mismatched `v`); `fromSaveDoc`
  defaults the field to `null` for existing docs instead.

### Deferred to Implementation

- Exact subscription-estimate heuristic (keep light; a `chosenAt` elapsed proxy).
- Fee rounding rule (floor the fee so `gross = fee + net` always holds) — settle when
  writing `computeFee`.
- `source` value for a real logged sale: keep `source:'mock'` (the current pin at
  `insertLedger` ~:327 / `flushLedgerViaKeepalive` ~:590) or introduce a new value — and
  whether any `fp_ledger` CHECK constraint on `source`/`kind` must change (cross-repo,
  The120). Decide when authoring the migration (see Unit 2).
- Whether legacy `kind:'backing'` rows exist in real `fp_ledger` data — with the kind
  validators dropping `'backing'` at load, such rows are skipped (acceptable); confirm
  against a loaded ledger at implementation.

## Implementation Units

- [ ] **Unit 1: Provider model + fee math + comparison data**

**Goal:** A pure module defining the 3 providers, their fee models, `computeFee`, and
the comparison/setup content from the file.

**Requirements:** R24.1, R24.2, R24.5, R24.10.

**Dependencies:** None.

**Files:**
- Create: `src/data/providers.ts`
- Test: `src/data/__tests__/providers.test.ts`

**Approach:**
- Define `PROVIDERS`: `first_profit_pay` (percentBps 5000, no subscription), `replit`
  (percentBps 290 + 30c flat, ~$2500/mo cents), `shopify` (percentBps 290 + 30c flat,
  ~$3900/mo cents). Include display copy (name, tagline, ease/effort, who-owns-account,
  the setup walkthrough steps) sourced from `artifacts/checkout-booth-comparison.md`.
- `computeFee(grossCents, provider) -> { feeCents, netCents }` with a defined rounding
  rule so `gross = fee + net`. First Profit Pay = 50% of gross; Replit/Shopify =
  round(gross * 290/10000) + 30.

**Patterns to follow:** `src/data/path.ts` (a typed, pure data module).

**Test scenarios:**
- Happy path: `computeFee(2000, replit)` -> fee 88 (58+30), net 1912; `first_profit_pay`
  -> fee 1000, net 1000; `shopify` == replit at same gross.
- Edge case: `computeFee(1, provider)` and an odd gross both keep `gross = fee + net`;
  a very large gross; a gross where the 30c flat exceeds a naive percent.
- Edge case: `first_profit_pay` has no subscription; Replit/Shopify subscription cents
  are present and positive.

**Verification:** provider set + fee math are pure, typed, and fully covered; no UI or
state touched.

- [ ] **Unit 2: Server ledger persistence — `fp_ledger` fee columns + `sync.ts`**

**Goal:** Persist the per-sale fee snapshot on the RELATIONAL `fp_ledger` table (new
columns), threaded through the `sync.ts` load/insert path and `notifyLedger`, so a fee
survives a reload and legacy rows never yield `NaN`.

**Requirements:** R24.5, R24.7, R24.9 (server side).

**Dependencies:** Unit 1 (provider ids for `provider_id`).

**Files:**
- Migration (**CROSS-REPO — target repo `120-The120`, authored + applied per The120's
  migration discipline**): add `fp_ledger` columns `gross_cents`, `fee_cents`,
  `net_cents`, `provider_id` (keep `amount_cents` = gross). Must be applied+ordered so
  the columns exist BEFORE any FP build that writes them ships. Decide the `source`
  question (keep `'mock'` vs a new value) and whether the `source`/`kind` CHECK
  constraints change here.
- Modify: `src/lib/sync.ts` — `insertLedger` (~:315) + `flushLedgerViaKeepalive` (~:579)
  write the 4 new columns; `LedgerInsertRow` / `LedgerDbRow` gain the fields;
  `loadLedger` (~:245) selects + maps them AND DEFAULTS legacy rows
  (`net_cents ?? amount_cents`, `fee_cents ?? 0`, `provider_id ?? null`) so a reload
  never produces `NaN`; the kind validators at `~:258` (`loadLedger`) and `~:381`
  (`isValidLedgerRow`) DROP `'backing'` (accept only `'sale'`).
- Modify: `src/state/GameContext.tsx` — `notifyLedger` (~:249) forwards the new fields
  (`grossCents`, `feeCents`, `netCents`, `providerId`) alongside the existing ones.
- Test: `src/lib/__tests__/sync.test.ts` (extend).

**Approach:**
- Thread the fee snapshot end to end: reducer row -> `notifyLedger` -> `insertLedger`
  columns; and DB row -> `loadLedger` -> `LedgerEntry`. The snapshot is stored per row,
  so a later provider switch never rewrites past rows (R24.6 holds at the storage layer).
- Back-fill is at LOAD (`loadLedger`) and/or the DB default, NEVER in `fromSaveDoc` (the
  save doc excludes the ledger).

**Patterns to follow:** the existing `insertLedger`/`loadLedger`/`isValidLedgerRow`
shape; the RLS column-scoped-grant discipline for client-writable columns.

**Test scenarios:**
- Happy path (durability): a logged sale inserted with `gross/fee/net/providerId`
  survives a `loadLedger` round-trip with all four fields intact.
- Edge case (durability): a legacy amount-only row (`net_cents`/`fee_cents`/`provider_id`
  null) loads with `net = amount_cents`, `fee = 0`, `providerId = null` — NO `NaN`.
- Edge case: a `kind:'backing'` DB row is dropped by both validators (not surfaced).
- Error path: an insert that fails on a missing column / constraint is classified
  (terminal vs retryable) exactly as today — no new storm path.

- [ ] **Unit 3: Game-state — in-memory ledger fields + `chosenProvider` (NO DOC_VERSION bump)**

**Goal:** Model the chosen provider and the fee-snapshotted ledger row IN MEMORY, adding
`chosenProvider` as an additive-optional save-doc field WITHOUT bumping `DOC_VERSION`.

**Requirements:** R24.3, R24.4, R24.5, R24.6, R24.9.

**Dependencies:** Units 1-2.

**Files:**
- Modify: `src/state/gameCore.ts`
- Test: `src/state/__tests__/gameCore.test.ts` (extend)

**Approach:**
- Extend the in-memory `LedgerEntry` with `grossCents`, `feeCents`, `netCents`,
  `providerId` (`amountCents` retained = gross); mirror `loadLedger`'s mapping.
  `LedgerKind` retires `backing`.
- Add `chosenProvider: { providerId; chosenAt } | null` to `GameState` + `SaveDoc` as an
  ADDITIVE OPTIONAL field; add `SET_PROVIDER`. Add it to `toSaveDoc`; in `fromSaveDoc`
  DEFAULT it to `null` for existing docs.
- KEEP `DOC_VERSION = 1` — do NOT bump. A bump would discard in-flight outbox entries
  (`OUTBOX_VERSION = DOC_VERSION`, `readOutbox` drops mismatched `v`); the field is
  additive-optional so no bump is warranted. There is NO ledger-row migration in
  `fromSaveDoc` (the save doc excludes the ledger; back-fill lives in Unit 2's
  `loadLedger`).
- `salesSumCents` -> sum of `netCents`; add `grossSalesSumCents`. Retire
  `backingSumCents`.
- Keep the 1.2 sale auto-complete keyed on a logged `sale` existing (verified:
  `markTaskDone` fires on `kind==='sale'` regardless of amount, so net does not break it).

**Execution note:** Add the `chosenProvider`-default round-trip test first (an existing
save with no `chosenProvider` must load with `chosenProvider=null`, NOT discard).

**Patterns to follow:** existing `fromSaveDoc`/`toSaveDoc`; the 1.2 auto-complete in
`ADD_LEDGER`.

**Test scenarios:**
- Happy path: `SET_PROVIDER` records id + `chosenAt`; `toSaveDoc`/`fromSaveDoc`
  round-trips a doc carrying `chosenProvider`.
- Integration: a doc WITHOUT `chosenProvider` (existing v1 shape) loads with
  `chosenProvider=null` at `DOC_VERSION=1` — NOT discarded, no version bump.
- Edge case: `salesSumCents` sums `netCents`; `grossSalesSumCents` sums gross; a sale
  with a 50% fee halves the net contribution.
- Edge case: a malformed save still returns `malformed` (unchanged).

- [ ] **Unit 4: Checkout Booth comparison UI + choice; retire the mock overlay**

**Goal:** Replace the "Invest in me" mock with the 3-option comparison + choice, mobile-
first.

**Requirements:** R24.1, R24.2, R24.3, R24.4, R24.9, R24.11.

**Dependencies:** Units 1-3.

**Files:**
- Modify: `src/components/rooms/CheckoutBooth.tsx`
- Create: `src/components/rooms/ProviderComparison.tsx`
- Remove/replace: `src/components/MockCheckout.tsx`; drop `OPEN_CHECKOUT`/`checkoutOpen`
  in `src/state/gameCore.ts` and its mount in `src/screens/Factory.tsx`
- Retire remaining `backing`/mock references surfaced by the audit:
  `src/components/Hud.tsx` (uses `backingSumCents` + renders the backed stat + the
  `$1,000` bar — folds into the net/gross edit below), `src/state/GameContext.tsx`
  (`backingSumCents` bind/export at ~:33, ~:77, ~:391), `src/lib/useFocusTrap.ts:3`
  (stale `MockCheckout` comment — tidy).
- Modify: `src/components/Hud.tsx` — the `$1,000` bar tracks NET (`salesSumCents`) and
  shows gross (`grossSalesSumCents`); drop the backed stat.
- Test (update the backing/`OPEN_CHECKOUT`/`checkoutOpen`/`MockCheckout`/
  `backingSumCents` references): `src/state/__tests__/gameCore.test.ts`,
  `src/state/__tests__/GameContext.test.tsx`,
  `src/components/rooms/__tests__/rooms.test.tsx`, `src/lib/__tests__/sync.test.ts`
- Test: `src/components/rooms/__tests__/ProviderComparison.test.tsx`

**Approach:**
- `ProviderComparison` renders the 3 providers as **stacked cards** (no wide table) at
  390px, each showing fee, subscription, ease/effort, who-owns-the-account, and a
  "Choose" action that dispatches `SET_PROVIDER`. First Profit Pay shown as a real,
  pickable option framed as a provider ("First Profit Pay"), not the course.
- Booth states: no-provider-yet (show the comparison), provider-already-chosen (summary
  + "compare again"/switch), from R24.6/Unit 6.
- **R24.3 early access (reachability, verified):** the Checkout Booth is criterion 1.2's
  room (`src/data/path.ts:300`) and is reachable via `isStepUnlocked`
  (`src/state/gameCore.ts:254`) once 1.1 is complete — i.e. as soon as the payment slice
  opens (the earliest money criterion). "Early access" therefore means the comparison +
  provider CHOICE is available the moment the booth is first reachable — it is NOT gated
  behind logging a sale. No new room-unlock/entry-point is added; state that the choice
  renders on first booth entry (no-provider-yet state) rather than only after a sale.
- Retire the mock overlay + action cleanly (no dangling references).

**Patterns to follow:** existing room card styling + the overlay/aria conventions;
`src/screens/onboarding/screens.tsx` card primitives.

**Test scenarios:**
- Happy path: renders 3 provider cards; choosing dispatches `SET_PROVIDER` with the id;
  after choice the booth shows the chosen-provider summary.
- Edge case: First Profit Pay is pickable and labeled as a provider (not "the course").
- Edge case (reachability): the comparison renders on first booth entry (1.2 unlocked, no
  sale yet) — the choice is not gated behind a logged sale.
- Standards: no em dashes in copy; all interactive controls >=44px; no fixed width
  >390px (class-audit + a **lightweight ~390px devtools/screenshot check on the
  comparison view** here, not only at final assembly).

- [ ] **Unit 5: Real-sale logging + per-sale fee modeling + ledger re-layout**

**Goal:** Let the student log a real sale; model gross->fee->net via the chosen
provider; show it in the ledger at 390px. (First Profit processes nothing.)

**Requirements:** R24.5, R24.7, R24.11.

**Dependencies:** Units 1-4.

**Files:**
- Modify: `src/components/rooms/CheckoutBooth.tsx` (a "log a sale" affordance)
- Create: `src/components/rooms/LogSaleForm.tsx`
- Modify: `src/components/rooms/LedgerList.tsx` (gross -> fee -> net row)
- Modify: `src/state/gameCore.ts` (`ADD_LEDGER` computes fee/net from `chosenProvider`
  via Unit 1's `computeFee`, snapshots `providerId` onto the row so Unit 2 persists it)
- Test: `src/components/rooms/__tests__/LogSaleForm.test.tsx`, extend
  `src/state/__tests__/gameCore.test.ts`

**Approach:**
- Logging a sale: amount (gross), payer/customer label, honoring the parent-verification
  safety posture (a note/attestation; parent controls for under-13). On submit,
  `ADD_LEDGER {kind:'sale', grossCents}`; the reducer computes fee/net from the chosen
  provider and snapshots `providerId`; the new row flows through `notifyLedger` ->
  `insertLedger` (Unit 2) with its fee columns. If no provider chosen yet, prompt the
  choice first (R24.3 makes it available from the start).
- `LedgerList` row re-laid-out for 390px: gross, the provider fee, net — stacked/compact.

**Test scenarios:**
- Happy path: log a $20 sale on Replit -> row gross 2000, fee 88, net 1912; ledger shows
  gross/fee/net; `salesSumCents` rises by net.
- Integration: logging a `sale` still auto-completes criterion 1.2's last task (active
  idea, 1.2 unlocked) — unchanged by the fee modeling.
- Integration (durability): a logged sale's fee fields survive a reload
  (`notifyLedger`/`insertLedger` -> `loadLedger` round-trip, per Unit 2) — the reloaded
  row shows the same gross/fee/net/providerId.
- Edge case: logging with First Profit Pay chosen halves the net; logging with no
  provider chosen routes to the choice first (no un-modeled row is created).
- Error path: a zero/empty/negative amount is rejected.
- Standards: no em dashes; the gross/fee/net `LedgerList` row + the log-sale form stack
  cleanly at 390px — a **lightweight ~390px devtools/screenshot check on the re-laid-out
  ledger** here, not only at final assembly.

- [ ] **Unit 6: Switch provider + coach/reflection beat**

**Goal:** Let the student switch providers anytime; past sales keep their fee; a switch
triggers a coach moment.

**Requirements:** R24.6.

**Dependencies:** Units 2-5.

**Files:**
- Modify: `src/components/rooms/CheckoutBooth.tsx` / `ProviderComparison.tsx` (a
  "compare again"/switch entry)
- Create: `src/components/rooms/ProviderSwitchCoach.tsx` (the reflection beat)
- Test: `src/components/rooms/__tests__/ProviderSwitchCoach.test.tsx`, extend gameCore
  tests

**Approach:**
- Switch = `SET_PROVIDER` with a new id + new `chosenAt`. Past ledger rows are untouched
  (fee snapshot). A switch (especially away from `first_profit_pay`) shows a coach beat
  that names the lesson; the past 50% rows stay taxed (the scar is the lesson) — no
  refund/floor.

**Test scenarios:**
- Happy path: switch from `first_profit_pay` to `replit`; a NEW sale uses 2.9%+30c; a
  PRIOR sale still shows 50% fee/net (unchanged).
- Integration: the coach beat renders on a switch and names the lesson; dismissing it
  returns to the booth with the new provider active.
- Integration (durability, R24.6 proof): after a switch + reload, prior rows STILL show
  their old fee (e.g. the pre-switch 50% rows) — the snapshot is per row, persisted in
  `fp_ledger`, and a switch never rewrites past rows.
- Edge case: switching to the same provider is a no-op (no spurious coach beat).

- [ ] **Unit 7: Subscription surfacing + real-world setup guidance + Criterion 4.2 ref**

**Goal:** Show each provider's subscription in the comparison + a light running estimate;
provide real-world setup guidance; leave the forward reference to Criterion 4.2.

**Requirements:** R24.8, R24.10, R24.11.

**Dependencies:** Units 1, 4.

**Files:**
- Modify: `src/components/rooms/ProviderComparison.tsx` (subscription in cards)
- Create: `src/components/rooms/SetupGuide.tsx` (per-provider real-world walkthrough)
- Modify: `src/components/rooms/CheckoutBooth.tsx` (a light "subscription so far"
  estimate for the chosen provider)
- Modify: `src/data/path.ts` OR a code comment at the Criterion 4.2 task noting the
  provider subscription+fees belong in the future P&L "money out"
- Test: `src/components/rooms/__tests__/SetupGuide.test.tsx`

**Approach:**
- Comparison cards show the monthly subscription (from Unit 1 data). The chosen-provider
  view shows a **light** "subscription so far" estimate using a `chosenAt` elapsed proxy
  (directional; not a P&L). `SetupGuide` renders the chosen provider's real-world
  walkthrough steps (Replit/Shopify) with the parent-controlled framing; First Profit
  Pay needs no external setup.
- Add the forward reference (comment or a `path.ts` note) at Criterion 4.2 that the
  provider subscription+fees are the P&L "money out" lines — do NOT build the P&L.

**Test scenarios:**
- Happy path: comparison cards render each subscription; `SetupGuide` renders the chosen
  provider's steps; First Profit Pay shows no external-setup steps.
- Edge case: the "subscription so far" estimate renders for a subscription provider and
  is absent/zero for First Profit Pay.
- Standards: no em dashes; 390px card/stacked layout; **run a live ~390px screenshot
  pass over the assembled booth flow** (comparison, log-sale, ledger, switch coach,
  setup guide) as this unit's acceptance.

## System-Wide Impact

- **Interaction graph:** `ADD_LEDGER` now depends on `chosenProvider` for fee modeling;
  the fee then flows through `notifyLedger` -> `insertLedger` -> `fp_ledger` columns and
  back via `loadLedger`. The 1.2 auto-complete path must stay intact. Retiring
  `OPEN_CHECKOUT`/`checkoutOpen` touches `Factory.tsx` (overlay mount).
- **State lifecycle:** the save doc gains an additive-optional `chosenProvider` with NO
  `DOC_VERSION` bump (defaulted in `fromSaveDoc`), so existing saves and in-flight outbox
  entries are preserved. The ledger fee snapshot lives in `fp_ledger`, not the save doc.
- **API surface parity — RELATIONAL schema change (cross-repo).** `fp_ledger` gains
  columns `gross_cents`, `fee_cents`, `net_cents`, `provider_id`; the migration lives in
  The120 and must be applied+ordered BEFORE the FP build that writes them ships (a
  deploy-ordering constraint). This is NOT a JSONB-only change. The chosen provider,
  separately, rides the existing save doc (no column).
- **Unchanged invariants:** the login/auth, the criteria/task engine, and the 1.1/1.2
  playable flow are unchanged except the sale row's shape + the retired backing.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Cross-repo migration ordering (`fp_ledger` columns in The120 vs FP writes) | Author + apply the The120 migration FIRST; FP build that writes the columns ships only after they exist (Unit 2, deploy-ordering constraint). |
| DOC_VERSION discard of saves/outbox | Avoided by NOT bumping: `chosenProvider` is additive-optional, defaulted in `fromSaveDoc`; `DOC_VERSION` stays 1 so `OUTBOX_VERSION` entries survive (Unit 3). |
| Legacy amount-only ledger rows yield `NaN` | `loadLedger` defaults `net=amount, fee=0, providerId=null` (Unit 2) + a durability test. |
| `source` value for a real logged sale | Decide keep `'mock'` vs a new value, and whether the `source`/`kind` CHECK must change, when authoring the Unit 2 migration (cross-repo). |
| Fee rounding drift (`gross != fee + net`) | Defined rounding rule in `computeFee` + invariant test (Unit 1). |
| Brand confusion (course vs "First Profit Pay") | Distinct provider name + framing copy (Unit 4, R24.2). |
| 390px comparison/ledger overflow | Stacked cards, not a table; lightweight 390px checks at Units 4 and 5; live pass at Unit 7. |
| Scope creep into a P&L | Forward reference only; no P&L built (Scope Boundaries). |

## Sources & References

- **Origin document:** `docs/brainstorms/2026-08-02-checkout-booth-provider-lesson-requirements.md`
- Comparison content: `artifacts/checkout-booth-comparison.md`
- Related code: `src/components/rooms/CheckoutBooth.tsx`, `src/state/gameCore.ts`,
  `src/components/rooms/LedgerList.tsx`, `src/data/path.ts`
