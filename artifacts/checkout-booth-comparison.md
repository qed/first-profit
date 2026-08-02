# Checkout Booth Comparison: Replit vs. Lovable vs. Shopify

**Internal planning · payments research · August 2026**

Where should a kid business take real money? Priced against a real case: an 11-year-old founder selling custom chess pieces at $2,000 a week in gross revenue.

Companion deck: `first-profit-payments-platforms.pptx`

---

## The case study

An 11-year-old hand-finishes custom chess pieces and sells two products online:

| Product | Contents | Price | Assumed volume |
|---|---|---|---|
| Starter set | 8 custom pawns | $20 | 50 orders / wk |
| Double set | 16 custom pawns | $40 | 25 orders / wk |

- **Gross revenue:** $2,000 / week
- **Annualized run rate:** $104,000
- **Orders:** 75 / week (assuming revenue splits 50/50 across the two products)

The order-mix assumption drives the 30¢ per-transaction fee component. If average order value rises, per-order fees fall slightly.

---

## The core finding: none of the three takes a cut of sales

Replit and Lovable are app builders: payments run through a **Stripe account you own**, and the platforms charge only their subscription. Shopify processes payments itself (Shopify Payments, Stripe-powered) at the same headline rate.

**Money flow on all three:** customer pays on your store → Stripe/Shopify Payments processes at 2.9% + 30¢ → payout lands in the parent's bank account.

Caveats:

- On Shopify, using a third-party gateway instead of Shopify Payments adds **2.0%** on the Basic plan.
- Shopify's $5/mo **Starter** tier runs ~**5% per sale** — cheap subscription, expensive rate.

---

## What each platform charges (US pricing, August 2026)

| | Replit | Lovable | Shopify Basic |
|---|---|---|---|
| **Software subscription** | Core $25/mo ($20/mo annual). Pro $100/mo. | Pro $25/mo (100 credits). Business $50/mo. | $39/mo (~$29/mo on annual). Starter tier $5/mo. |
| **Payment processing** | Your own Stripe: 2.9% + 30¢ per online card charge | Your own Stripe: 2.9% + 30¢ per online card charge | Shopify Payments: 2.9% + 30¢ online (Basic) |
| **Platform cut of sales** | None | None | None with Shopify Payments; +2.0% with another gateway |
| **Likely extras** | Deployment/hosting ~$5–20+/mo beyond credits; domain ~$12/yr | Supabase backend (free tier → $25/mo); domain ~$12/yr | Theme free–$300 one-time; apps optional; domain ~$15/yr |
| **Commerce features included** | None built in — Agent generates cart, orders, emails; shipping & tax are DIY | None built in — you assemble checkout, order records, receipts | Full stack: inventory, shipping labels, tax, discounts, abandoned-cart |

---

## The math at $2,000/week

Card processing is identical everywhere: **2.9% × $2,000 + 30¢ × 75 orders = $80.50/wk = $4,186/yr**. The platform choice moves the total by about ±$4/wk.

| Platform | Processing / yr | Software & hosting / yr | Total / yr | % of gross |
|---|---|---|---|---|
| Lovable Pro | $4,186 | $300 | **$4,486** | 4.3% |
| Shopify Basic | $4,186 | $468 | **$4,654** | 4.5% |
| Replit Core (+ ~$15/mo hosting) | $4,186 | $480 | **$4,666** | 4.5% |
| Shopify Starter (~5% rate) | $5,200 | $60 | **$5,260** | 5.1% |

**Takeaways:**

- ~4.4% of gross goes to fees on all three main options ($86–90/wk).
- Fees are a rounding error apart — the decision should be made on features and effort, not price.
- Avoid Shopify Starter at this volume: ~$600/yr more than any option above. The percentage rate is what compounds with revenue, not the subscription.

---

## Ease of setup: how fast can a parent-kid team go live?

**1. Shopify — one afternoon.** Guided store wizard, zero code. Add two products, pick a free theme, verify identity, and payments are already on. Shipping labels and tax handled inside. Hardest step: parent's identity + bank verification.

**2. Replit — a weekend.** Agent builds the storefront from a prompt and adds the Stripe connector in one step. But going live means Stripe business verification, swapping in live keys, and publishing the app. Hardest step: Stripe KYB + moving from sandbox to live keys.

**3. Lovable — a weekend, plus debugging.** Prompt-built storefront too, but payments need your Stripe API keys, a Supabase backend for orders, and webhook wiring. Most moving parts to break. Hardest step: wiring Stripe + Supabase so orders record reliably.

---

## Full walkthrough: Shopify Basic ($39/mo)

1. **Parent creates the account** (10 min) — sign up with the parent's email; start on the trial, then pick Basic ($39/mo, ~$29 annual).
2. **Add the two products** (30 min) — photos, names, descriptions; $20 and $40 prices; track pawn-set inventory.
3. **Pick a free theme & brand it** (45 min) — choose a free theme, drop in the chess branding, arrange the home page.
4. **Activate Shopify Payments** (15 min + review) — parent submits legal name, SSN/EIN, address, and bank account. Cards work once approved.
5. **Set shipping** (20 min) — flat-rate or carrier-calculated; buy discounted USPS labels right inside Shopify.
6. **Connect a domain** (10 min) — buy through Shopify (~$15/yr) or connect an existing one.
7. **Place a test order & launch** (20 min) — run a real $1 test card order end to end, refund it, then share the link.

**Reality check:** total ~2–4 focused hours. No code anywhere. The kid can run products, orders, and fulfillment from the mobile app.

---

## Full walkthrough: Replit Core ($25/mo)

1. **Parent creates a Core account** (10 min) — Stripe integration needs a paid tier; Core is $25/mo ($20/mo annual).
2. **Prompt Agent to build the store** (1–3 hrs) — "Build a store selling 2 chess-piece sets, $20 and $40, with a cart and order emails." Iterate on design in chat.
3. **Add the Stripe connector** (15 min) — ask Agent to add Stripe; it scaffolds checkout, products, and webhooks against a sandbox.
4. **Parent completes Stripe verification** (20 min + review) — create the live Stripe account: identity, business type (individual is fine), bank for payouts (KYB).
5. **Test in sandbox** (30 min) — run 4242-4242 test cards through both products; check order emails fire.
6. **Go live** (20 min) — install Replit's Integrated Payments app in the live Stripe account; paste live keys into the Publish pane.
7. **Publish & connect a domain** (20 min) — publish the app (hosting ~$5–20/mo usage) and point a custom domain at it.
8. **Bolt on the boring parts** (ongoing) — shipping rates, sales-tax handling, and refunds are yours to configure in Stripe or code.

**Reality check:** a weekend project. More setup than Shopify, but the build itself is the lesson — closest to the First Profit pedagogy.

---

## Full walkthrough: Lovable Pro ($25/mo)

1. **Parent creates a Pro account** (10 min) — $25/mo for 100 credits; the free tier can't publish to a custom domain.
2. **Prompt the storefront** (1–3 hrs) — describe the two chess products and look; Lovable generates the site. Iterating burns credits.
3. **Connect Supabase** (20 min) — one-click integration; this backend stores products, orders, and customers.
4. **Parent sets up Stripe & adds keys** (30 min + review) — create the Stripe account (18+, bank, identity), then paste publishable + secret keys into Lovable.
5. **Wire checkout & webhooks** (1–2 hrs) — prompt Lovable to create the Stripe checkout session and a webhook that records paid orders in Supabase.
6. **Test with Stripe test cards** (45 min) — verify a $20 and a $40 order land in Supabase and trigger receipts.
7. **Publish & connect a domain** (20 min) — publish on Lovable hosting; connect a ~$12/yr domain.
8. **Bolt on the boring parts** (ongoing) — shipping, tax, refunds, and order-status emails all need prompting and testing.

**Reality check:** the most moving parts — Lovable + Supabase + Stripe must agree. Great flexibility, weakest guardrails for a first store.

---

## The fine print that matters most: an 11-year-old can't own any of these accounts

Stripe, Shopify, Replit, and Lovable all require account holders to be 18+. That is not a blocker — it is the standard structure for every kid business:

- **Parent is the merchant of record.** The parent opens the Stripe or Shopify account in their name: identity, SSN, and terms of service are theirs.
- **Payouts land in a parent-controlled bank account.** Money settles to the parent's checking account (or a joint/custodial account); the kid's cut is an allowance-style transfer.
- **Taxes flow through the parent.** At $104K/yr this is real income: 1099-K forms, sales-tax collection, and income reporting sit with the parent. Get an accountant. (Not legal or tax advice.)
- **The kid still runs the business.** Products, pricing, fulfillment, customer messages — day-to-day operation is genuinely the founder's job.

This is exactly the First Profit model: "a parent sets up every account" — the parent owns the rails, the kid earns on them.

---

## Internal takeaways for First Profit

1. **Fees won't decide it.** All three land at ~4.4% of gross ($86–90/wk at $2,000/wk). Processing is identical; subscriptions differ by pennies per order. Steer families away from percentage-based tiers like Shopify Starter as revenue grows.
2. **Shopify wins on speed.** For a physical-product business already at volume, Shopify Basic is live in an afternoon with shipping and tax handled. It's the answer to "just make selling work."
3. **Replit fits the pedagogy.** If building the store is part of the curriculum, Replit is the strongest fit: one connector, kid-visible code, and the same parent-owned-Stripe structure First Profit already teaches. Lovable works but has the most breakable payments plumbing.

---

## Sources

Numbers verified August 2026. Model: $2,000/wk gross, 75 orders/wk (50 × $20 + 25 × $40).

- [Replit Stripe payments docs](https://docs.replit.com/core-concepts/monetization/stripe-payments)
- [Replit pricing 2026 (No Code MBA)](https://www.nocode.mba/articles/replit-pricing)
- [Lovable pricing 2026 (No Code MBA)](https://www.nocode.mba/articles/lovable-pricing)
- [Lovable Stripe tutorial (No Code MBA)](https://www.nocode.mba/articles/lovable-tutorial-stripe)
- [Shopify pricing & fees 2026 (Style Factory)](https://www.stylefactoryproductions.com/blog/shopify-fees)
- [Stripe fees explained 2026 (Checkout Page)](https://checkoutpage.com/blog/stripe-processing-fees)
