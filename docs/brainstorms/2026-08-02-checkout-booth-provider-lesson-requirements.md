---
date: 2026-08-02
topic: payment-phase-2-checkout-booth-provider-lesson
supersedes: (discarded) payment-phase-2 "real Stripe test mode" draft
---

# Payment Phase 2 (fpv2): the Checkout Booth "which provider?" lesson

## Problem Frame

First Profit is a business **course**, not "Shopify for kids." By the end of
criteria 1-2 (the first ten unit tasks) every student makes their first **real**
sale. Their first big money decision is **which service they use to collect money
from customers and get it to their parent**. The Checkout Booth is where that lesson
lives.

Today the Checkout Booth (`src/components/rooms/CheckoutBooth.tsx`) is a First
Profit-branded Stripe mock ("Invest in me", "Open the live checkout",
`pay.firstprofit.school/{handle} · Stripe, via the First Profit account", "double
their money as store credit"). **Phase 2 replaces that** with a lesson: on first
visit the booth asks *"Which provider do you want to use for your Checkout Booth?"*
and teaches the student to **compare providers**. First Profit is offered as one
option with a deliberately-bad **50% fee** — the teaching device. A student who
learns the lesson picks a **different, cheaper** provider.

First Profit does **not** process payments in this phase. The deliverable is the
lesson, the recorded choice, and real-world **setup guidance**; the student's real
sales are collected through their chosen external provider (parent-controlled) and
**logged in the ledger**, where the provider's fee is modeled.

**Where the comparison content comes from:** the provider list, their fees, and the
comparison dimensions live in `checkout-booth-comparison.md` (authored by the product
owner; "all the information needed to deliver the lesson"). This document specifies
the lesson STRUCTURE and behavior; the provider data is a placeholder that file fills.

## Requirements

- **R24.1 — First-visit provider choice.** The first time a student opens the Checkout
  Booth, it presents the provider-comparison lesson and asks them to choose a payment
  provider before they can "put a working checkout live." The comparison shows each
  provider and the dimensions that matter (fee, and the other dimensions defined in
  `checkout-booth-comparison.md`).
- **R24.2 — First Profit is a real (bad) option.** First Profit appears in the
  comparison as a selectable provider charging a **50% fee**. It is not hidden or
  disabled; a student CAN pick it (and then feel the consequence, R24.5). It is the
  contrast that makes the lesson land.
- **R24.3 — The choice is recorded and durable.** The chosen provider (and its fee) is
  recorded as part of the student's game state so it persists across devices/sessions
  (game state is already server-side, R19). It is a durable part of their founder
  record, not a transient UI state.
- **R24.4 — Real-world setup guidance.** After choosing, the booth GUIDES the student
  and parent to set up that provider **in the real world** (parent-controlled per the
  safety rules: parents control payments for under-13, review for 13-17). First Profit
  does not integrate or process payments; the guidance is instructional (what to do,
  with a parent). Depth of the guidance (checklist vs links vs copy) is an open
  question tied to `checkout-booth-comparison.md`.
- **R24.5 — The provider fee is MODELED in the ledger.** A logged sale records the
  gross amount, the chosen provider's fee, and the **net that reaches the parent**. The
  ledger shows gross -> fee -> net. A student who chose First Profit watches ~50% of
  each sale disappear; a cheaper provider keeps most of it. This connects to the
  curriculum's "transaction fees are a real cost" and makes the lesson felt in the
  `$1,000` sales bar.
- **R24.6 — Switching providers anytime.** The student can re-open the comparison and
  **switch** providers later (real businesses do). **Past logged sales keep the fee
  they were taken at; future sales use the new provider's fee.** This enables the core
  arc: pick First Profit -> watch 50% vanish -> switch to a better provider.
- **R24.7 — Real-sale logging (not First Profit-processed).** Because First Profit no
  longer runs the checkout, a "sale" is a **real** external transaction the student
  **logs** (the curriculum's "the sale is logged", "money from a non-family customer is
  in hand and the sale is logged"). The ledger becomes a logged-sales record with the
  provider fee applied, honoring the parent-verification safety posture (open question:
  exact logging + verification UX). The `10 sales or 3 repeat customers` and `$1,000`
  criteria read off this ledger.
- **R24.8 — Ledger + HUD reflect net.** The Sell-phase HUD / `$1,000` bar and the
  ledger derive from the fee-adjusted numbers so the provider choice visibly changes
  progress. (Whether the bar tracks gross or net is an open question, R below.)
- **R24.9 — No em dashes, curriculum voice.** All student-facing copy follows the
  handoff fidelity + the repo's no-em-dash rule; the lesson reads as First Profit
  curriculum, kid-friendly, parent-aware.
- **R24.10 — Retire the old backing/mock plumbing.** Explicitly remove/replace the
  `MockCheckout.tsx` "Invest in me" card, the `OPEN_CHECKOUT`/`checkoutOpen` action,
  the `kind:'backing'` ledger rows, `backingSumCents`, and the "double their money as
  store credit" framing. The first real sale and the HUD read `kind:'sale'` /
  `salesSumCents` (today only `kind:'sale'` completes criterion 1.2; the current booth
  emits `backing`, so the mock does not even complete the first sale — this must be
  reconciled).
- **R24.11 — Distinct provider identity for the 50% option.** The bad option is
  presented as a distinctly-named PROVIDER (e.g. "First Profit Pay"), framed as one
  provider among several, NOT as the First Profit course taking a cut of its own
  students. Copy must prevent the course-vs-provider brand confusion. (Naming is an
  open product decision below.)

## Requirements Trace

- Reframes **R24** (Payment Phase 2) from "real Stripe test mode" to the provider-choice
  lesson. Real payment processing / live money / payouts remain **R25 / Phase 3**.
- Builds on **R21** (the fpv2 game + Checkout Booth room) and **R19** (server-side game
  state / ledger) — the choice + fee-modeled ledger live in that state.
- Delivers the curriculum's Checkout Booth tasks in `src/data/path.ts`:
  `@checkout Put a working checkout live` (now = choose + set up a provider),
  `@checkout Take payments through your checkout` (= log real sales through it),
  `10 sales or 3 repeat customers`, and the `$1,000` promise.

## Scope Boundaries

- **Not** a First Profit payment integration. First Profit processes **no** money in
  this phase; there is no First Profit Stripe checkout for kids (this supersedes the
  discarded "real Stripe test mode" direction).
- **Not** an external-provider integration either. The student sets up their chosen
  provider in the **real world** with a parent; First Profit only teaches, records the
  choice, guides setup, and models the fee on logged sales.
- Real money movement, real payouts (Stripe Connect / KYC), and public launch are
  **Phase 3 (R25)**.
- **Not** a store-credit / redemption / product-catalog system (the earlier "prepaid
  store credit" exploration is dropped — that was the wrong frame).

## Dependencies / Assumptions

- **`checkout-booth-comparison.md`** (product owner, ~in progress) supplies the provider
  list, fees, comparison dimensions, and the setup-guidance content. Build waits on it
  for the lesson CONTENT; the structure here does not.
- Reuses the existing Checkout Booth room + ledger + game-state/sync (`src/state/`),
  replacing the FP-Stripe mock (`MockCheckout.tsx` becomes / is replaced by the
  provider lesson; the ledger gains fee/net modeling).
- The chosen provider likely needs to persist in **server-side** game state (The120)
  so it survives devices; confirm during planning whether this touches The120 schema or
  fits existing game-state persistence.

## Open Questions (for planning / the comparison file)

**Strategic (a human must decide before planning):**
1. **Curriculum placement / sequencing (P1).** The frame says the provider decision
   lands at criteria 1-2 (first sale), but in `src/data/path.ts` the Checkout Booth
   (`room:'checkout'`) is wired to criteria **3.2** and **4.1**, while the first real
   sale is criterion **1.2** (`room:'market'`). So today a student logs their first
   sale(s) BEFORE ever choosing a provider. Decide: move the provider lesson earlier
   (resequence 1.2 through the booth) OR correct the frame — and define what a sale
   logged before a provider is chosen does (default provider? no fee yet?).
   (`checkout-booth-comparison.md` may resolve this.)
2. **Provider brand naming (P1).** The name for the 50%-fee First Profit option so it
   reads as a provider, not the course ripping off its students (R24.11).
3. **"Stuck after the 50% trap" (P2).** Switchability fixes future sales, but past
   sales keep the 50% fee, so a kid could feel permanently taxed toward the (net)
   `$1,000` bar. Is there a reflection/coach beat reframing the loss as the lesson, and
   any floor so the goal never feels permanently out of reach?
4. **Per-idea vs per-account provider.** The engine supports up to 5 parallel ideas but
   the ledger is one shared list. Is the provider choice account-global (recommended,
   matches the shared ledger) or one-per-idea?

**Content / from `checkout-booth-comparison.md`:**
5. **Provider list + fees + comparison dimensions.**
6. **Setup-guidance depth** — checklist, external links, or copy the parent follows;
   how the parent-control gate is expressed.
7. **Real-sale logging UX** — how a student logs a real sale (amount, customer, parent
   verification) and how the provider fee applies per row.
8. **Does the `$1,000` bar track gross or net?** (Rec: show both; the bar is net-to-
   parent so the fee is felt, gross visible.)
9. **First-visit gating** — must a provider be chosen before other booth actions unlock?

**Feasibility notes for planning (from document-review):**
- **Ledger-row schema change:** modeling gross->fee->net + fee-snapshot-on-switch
  needs new `fp_ledger`/`LedgerEntry` fields (`grossCents`, `feeCents`/`feeBps`,
  `netCents`, a `providerId` snapshot); today the row is only
  `{id,kind,payer,amountCents,createdAt}`. Decide whether existing `amountCents` is
  gross or net. This is a SERVER schema change, not just UI.
- **Save-doc migration gotcha:** the chosen provider belongs in the persistent save
  slice; `SaveDoc` bumping `DOC_VERSION` currently **hard-discards** any save whose
  version differs (`fromSaveDoc` → `unknown-version`). Adding `chosenProvider` needs a
  migration path or existing saves are wiped.
- **Fee rounding rule:** integer cents + a 50% fee on odd amounts needs a defined rule
  so `gross = fee + net` always holds.
- **Mobile (390px):** the provider comparison must be a stacked/card layout, not a wide
  table (no-horizontal-scroll gate); the fee-modeled ledger row (gross/fee/net) needs a
  390px-friendly re-layout of `LedgerList.tsx`.
- **Booth states to name in planning:** no-provider-chosen-yet, provider-already-chosen
  (return visit), and mid-switch, in addition to the first-visit comparison.

## Success Criteria

- On first Checkout Booth visit, the student is taught the provider comparison and must
  choose a provider (First Profit @ 50% is a real, pickable option).
- The chosen provider + fee is recorded durably and survives a device switch.
- After choosing, the student+parent get clear real-world setup guidance; First Profit
  processes no payment.
- A logged sale shows gross -> chosen-provider fee -> net; a First Profit choice
  visibly bleeds ~50%, a cheaper provider keeps most.
- The student can switch providers; past sales keep their old fee, future sales use the
  new one.
- Every Checkout Booth screen passes the ~390px mobile bar and the handoff fidelity;
  no em dashes in student-facing copy.
