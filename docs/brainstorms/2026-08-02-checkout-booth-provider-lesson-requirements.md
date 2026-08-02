---
date: 2026-08-02
topic: payment-phase-2-checkout-booth-provider-lesson
supersedes: (discarded) payment-phase-2 "real Stripe test mode" draft
comparison_source: artifacts/checkout-booth-comparison.md
---

# Payment Phase 2 (fpv2): the Checkout Booth "which provider?" lesson

## Problem Frame

First Profit is a **framework for building a real business with a game-like
interface**, not "Shopify for kids" and not a task-paced game. A student works the
125 unit tasks / 25 criteria and builds **artifacts** that help them grow a real
business. The first two artifacts are a **website** and a **Checkout Booth**.

The Checkout Booth teaches the student's first big money decision: **which service
they use to collect money from customers and get it to their parent.** On opening it,
the booth asks *"Which provider do you want to use for your Checkout Booth?"* and
teaches the student to **compare providers**.

**Business/product context (why this matters early):** First Profit sells a
**$3,000/year** program to use the software to learn to make money before you can
drive — first `$1,000` in sales, first `$10,000` in profit. The Checkout Booth is a
**sneak-preview hook**: kids get access near the beginning (even though the booth is
formally "built" at criteria 3.2/4.1) because they want to know *how they'll make
money*. That early access gives value to the free tier and builds excitement for the
paid subscription.

Today the booth (`src/components/rooms/CheckoutBooth.tsx`) is a First Profit-branded
Stripe mock ("Invest in me", "Open the live checkout", "double their money as store
credit"). **Phase 2 replaces that** with the provider-comparison lesson.

**First Profit processes no money.** The deliverable is the lesson, the recorded
choice, and real-world **setup guidance**; real sales are collected through the
student's chosen external provider (parent-controlled) and **logged** in the ledger,
where the provider's per-sale fee is modeled.

## The three providers (from `artifacts/checkout-booth-comparison.md`)

The comparison file researched real platforms; the lesson presents **three** options
(Lovable dropped):

| Option | Per-sale fee (modeled) | Monthly subscription | Note |
|---|---|---|---|
| **First Profit Pay** (the strawman) | **50% of the sale** | none | Built-in, "free," obviously bad as you scale — the teaching device. |
| **Replit** | 2.9% + 30¢ (your own Stripe) | ~$25/mo | Fits the First Profit pedagogy: build the store, kid-visible code, parent-owned Stripe. |
| **Shopify Basic** | 2.9% + 30¢ (Shopify Payments) | ~$39/mo | Fastest to launch (an afternoon); full commerce stack. |

Core lesson from the file: **the two real platforms don't take a cut of sales** and
land at ~equal (~4.4% of gross) processing — so the Replit-vs-Shopify choice is a
**features/effort** decision, not a price one. First Profit Pay's 50% is the contrast
that teaches "don't hand a provider half your business." **The parent is the merchant
of record** (18+ to hold any real account; payouts to the parent's bank; taxes flow
through the parent; the kid runs the business) — "exactly the First Profit model."

## Requirements

- **R24.1 — The provider-comparison lesson.** The Checkout Booth presents the three
  options with the dimensions that matter (per-sale fee, subscription, ease/effort,
  who owns the account) and asks the student to choose. Content/copy derives from
  `artifacts/checkout-booth-comparison.md`.
- **R24.2 — First Profit Pay is a real, pickable strawman.** It appears at a **50%**
  fee, framed as a distinctly-named **provider** ("First Profit Pay"), NOT as the
  First Profit *course* taking a cut of its own students. A student CAN pick it and
  feel the consequence (R24.5).
- **R24.3 — Early access / sneak-preview.** The booth + provider choice are **fully
  usable from near the start** (not gated behind criteria 3.2/4.1). Choosing a
  provider and the per-sale fee modeling apply from the student's first logged sale
  onward. This is the free-tier hook.
- **R24.4 — Account-global choice, recorded durably.** One chosen provider per founder
  (matches the single shared ledger). The choice + its fee is recorded in the
  persistent game state so it survives devices (implies a `SaveDoc`/server change +
  migration — see Feasibility).
- **R24.5 — Per-sale fee MODELED in the ledger.** A logged sale records gross, the
  chosen provider's per-sale fee, and **net to the parent** (gross -> fee -> net).
  First Profit Pay bleeds 50% per sale; Replit/Shopify take 2.9% + 30¢. The `$1,000`
  bar / HUD reflect the fee-adjusted numbers so the choice is felt.
- **R24.6 — Switching + a coach/reflection beat.** The student can re-open the
  comparison and **switch** anytime. **Past logged sales keep the fee they were taken
  at; future sales use the new rate.** On a switch (especially away from First Profit
  Pay), a **coach moment names the lesson** ("you just learned why founders compare
  providers") so the past 50% loss reads as learning, not punishment. The scar (past
  sales stay taxed) is the lesson; no refund/floor.
- **R24.7 — Real-sale logging (First Profit processes nothing).** A "sale" is a real
  external transaction the student **logs** (curriculum: "money from a non-family
  customer is in hand and the sale is logged"), honoring the parent-verification
  safety posture (parent controls payments under-13, reviews 13-17). Replaces the
  backing-mint. The `10 sales / 3 repeat customers` and `$1,000` criteria read off
  this ledger.
- **R24.8 — Subscription shown now (lightly); fully accounted later.** The **monthly
  subscription is shown in the comparison** so the choice is informed, PLUS a **light
  running "subscription so far" estimate** in the booth so the recurring cost is not
  invisible. The **full, fully-loaded ongoing-cost accounting is deferred to Criterion
  4.2** (see below) — do NOT build a full P&L here.
- **R24.9 — Retire the old backing/mock plumbing.** Remove/replace `MockCheckout.tsx`,
  the `OPEN_CHECKOUT`/`checkoutOpen` action, `kind:'backing'` rows, `backingSumCents`,
  and the "double their money as store credit" framing. First sale + HUD read
  `kind:'sale'` / `salesSumCents`.
- **R24.10 — Real-world setup guidance.** After choosing, the booth guides the
  student+parent to set up the real provider **in the real world** (parent-controlled)
  using the per-platform walkthroughs in `artifacts/checkout-booth-comparison.md`.
  First Profit does not integrate or process payments.
- **R24.11 — Curriculum voice + mobile.** Handoff fidelity, no em dashes in
  student-facing copy, kid-friendly + parent-aware. Every booth screen passes the
  ~390px mobile bar (the comparison is a **stacked/card** layout, not a wide table;
  the fee-modeled ledger row is re-laid-out for 390px).

## Curriculum connections (fully-loaded cost lives elsewhere)

- **Criterion 1.4 / task 1.4.1 "Count every cost"** already names **transaction fees**
  as a per-unit cost (grades 9-12). The provider's per-sale fee is that cost, made
  concrete.
- **Criterion 4.2 / task 4.2.1 "Build the weekly P&L"** ("money in (sales), money out
  (costs), profit") is where the **fully-loaded ongoing cost** belongs: the chosen
  provider's **subscription + processing fees are "money out" P&L lines.** This is the
  natural home for the total-cost-of-the-business idea and it resolves the
  "no-calendar" problem (the P&L is the periodic accounting). **Forward reference:**
  when the Grow phase / Criterion 4.2 P&L is built, wire the chosen provider's
  subscription + fees into "money out."

## Requirements Trace

- Reframes **R24** (Payment Phase 2): from "real Stripe test mode" to the
  provider-choice lesson. Real payment processing / live money / payouts remain
  **R25 / Phase 3**.
- Builds on **R21** (fpv2 game + Checkout Booth room), **R19** (server-side game state
  / ledger). Connects forward to curriculum **1.4.1** (transaction fees) and **4.2.1**
  (P&L "money out").

## Scope Boundaries

- **Not** a First Profit payment integration — First Profit processes **no** money;
  no First Profit Stripe checkout for kids (supersedes the discarded "real Stripe test
  mode" direction).
- **Not** an external-provider integration — the student sets up Replit/Shopify in the
  **real world** with a parent; First Profit only teaches, records the choice, guides
  setup, and models the per-sale fee.
- **Not** the full P&L / fully-loaded-cost accounting — that is **Criterion 4.2**
  (Grow phase, built later). Here: only the comparison + choice + per-sale fee + a
  light subscription estimate.
- Real money movement, real payouts (Stripe Connect / KYC), public launch are
  **Phase 3 (R25)**.
- **Not** a store-credit / redemption / product-catalog system (that exploration was
  dropped).

## Dependencies / Assumptions

- **`artifacts/checkout-booth-comparison.md`** supplies the provider content, fees,
  and the real-world setup walkthroughs (Replit, Shopify). Ready.
- Reuses the existing Checkout Booth room + ledger + game-state/sync (`src/state/`),
  replacing the FP-Stripe mock; the ledger gains per-sale fee/net modeling.
- The chosen provider persists in game state (likely a `SaveDoc`/server change).

## Feasibility notes for planning (from document-review)

- **Ledger-row schema change:** modeling gross -> fee -> net + fee-snapshot-on-switch
  needs new `fp_ledger`/`LedgerEntry` fields (`grossCents`, `feeCents`/`feeBps`,
  `netCents`, a `providerId` snapshot). Today the row is only
  `{id,kind,payer,amountCents,createdAt}`. Decide whether existing `amountCents` is
  gross or net. Server schema change, not just UI.
- **Save-doc migration:** the chosen provider belongs in the persistent slice;
  `fromSaveDoc` currently **discards** any save whose `DOC_VERSION` differs. Adding
  `chosenProvider` needs a migration path or existing saves are wiped.
- **Fee rounding:** integer cents + 50% or 2.9%+30¢ needs a defined rule so
  `gross = fee + net` always holds.
- **Light "subscription so far" estimate:** with no calendar, pick a simple proxy
  (e.g. a light real-elapsed or progress-based heuristic) — keep it light; the real
  accounting is Criterion 4.2.
- **Booth states to name:** first-visit comparison, no-provider-chosen-yet,
  provider-already-chosen (return visit), mid-switch.

## Success Criteria

- On opening the Checkout Booth (available early), the student is taught the three-way
  comparison and chooses a provider; First Profit Pay @ 50% is a real, pickable option.
- The choice + fee is recorded durably and survives a device switch.
- A logged sale shows gross -> chosen-provider fee -> net; First Profit Pay visibly
  bleeds 50%, Replit/Shopify keep ~97%.
- The student can switch; past sales keep their old fee, future use the new one; a
  switch triggers the coach/reflection beat.
- The subscription is visible in the comparison + a light running estimate; the full
  ongoing accounting is correctly deferred to Criterion 4.2's P&L.
- After choosing, the student+parent get real-world setup guidance; First Profit
  processes no payment.
- Every booth screen passes ~390px + handoff fidelity; no em dashes in student copy.
