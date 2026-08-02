// Pure data module: the three Checkout Booth payment providers, their fee
// models, comparison copy, and real-world setup walkthroughs. No UI, no state,
// no network. All student-facing copy is sourced from
// `artifacts/checkout-booth-comparison.md` and contains no em dashes.

export type ProviderId = 'first_profit_pay' | 'replit' | 'shopify';

/**
 * A provider's per-sale fee. `percentBps` is basis points of gross (290 = 2.9%);
 * `flatCents` is a fixed per-sale charge in cents (30 = 30c).
 */
export interface FeeModel {
  percentBps: number;
  flatCents: number;
}

/** One step of a provider's real-world setup walkthrough (parent-controlled). */
export interface SetupStep {
  title: string;
  detail: string;
}

export interface Provider {
  id: ProviderId;
  /** Provider brand name shown to the student. */
  name: string;
  /** One-line framing of what the provider is. */
  tagline: string;
  fee: FeeModel;
  /** Monthly software subscription in cents. `null` = no subscription. */
  subscriptionCents: number | null;
  /** How fast and how hard it is to go live. */
  ease: string;
  /** Plain-language answer to "who owns the account and holds the money". */
  whoOwnsAccount: string;
  /** Real-world setup walkthrough. Empty when nothing needs setting up. */
  setup: SetupStep[];
}

export const PROVIDERS: Record<ProviderId, Provider> = {
  first_profit_pay: {
    id: 'first_profit_pay',
    name: 'First Profit Pay',
    tagline:
      'The easy button that takes half of every sale. Nothing to set up, but it costs you the most.',
    fee: { percentBps: 5000, flatCents: 0 },
    subscriptionCents: null,
    ease: 'Instant. There is nothing to build and no account to open.',
    whoOwnsAccount:
      'First Profit Pay holds the money and keeps half of every sale before passing the rest along.',
    setup: [],
  },
  replit: {
    id: 'replit',
    name: 'Replit',
    tagline:
      'Build the store yourself with an AI agent. Your parent owns the Stripe account that collects the money.',
    fee: { percentBps: 290, flatCents: 30 },
    subscriptionCents: 2500,
    ease: 'A weekend project. More setup than Shopify, but building the store is the lesson.',
    whoOwnsAccount:
      'Your parent owns the Stripe account. Payouts land in their bank account and your cut is an allowance-style transfer.',
    setup: [
      {
        title: 'Parent creates a Core account',
        detail:
          'The Stripe connector needs a paid tier. Core is about 25 dollars a month.',
      },
      {
        title: 'Prompt the agent to build the store',
        detail:
          'Ask for a store that sells your two products with a cart and order emails, then iterate on the design in chat.',
      },
      {
        title: 'Add the Stripe connector',
        detail:
          'Ask the agent to add Stripe. It scaffolds checkout, products, and webhooks against a sandbox.',
      },
      {
        title: 'Parent completes Stripe verification',
        detail:
          'Create the live Stripe account with identity, business type, and a bank account for payouts.',
      },
      {
        title: 'Test in the sandbox',
        detail:
          'Run test cards through both products and check that the order emails fire.',
      },
      {
        title: 'Go live',
        detail:
          'Install the payments app in the live Stripe account and paste the live keys into the publish pane.',
      },
      {
        title: 'Publish and connect a domain',
        detail:
          'Publish the app, then point a custom domain at it. Hosting runs a few dollars a month.',
      },
      {
        title: 'Bolt on the boring parts',
        detail:
          'Shipping rates, sales tax, and refunds are yours to configure in Stripe or in code.',
      },
    ],
  },
  shopify: {
    id: 'shopify',
    name: 'Shopify',
    tagline:
      'The fastest way to open a real store. Guided setup, no code, shipping and tax built in.',
    fee: { percentBps: 290, flatCents: 30 },
    subscriptionCents: 3900,
    ease: 'One afternoon. A guided wizard with zero code. Shipping labels and tax are handled inside.',
    whoOwnsAccount:
      'Your parent owns the Shopify account and Shopify Payments. Money settles into their bank account.',
    setup: [
      {
        title: 'Parent creates the account',
        detail:
          'Sign up with the parent email, start on the trial, then pick the Basic plan at about 39 dollars a month.',
      },
      {
        title: 'Add the two products',
        detail:
          'Add photos, names, descriptions, and prices, and track how many of each set you have.',
      },
      {
        title: 'Pick a free theme and brand it',
        detail:
          'Choose a free theme, drop in your branding, and arrange the home page.',
      },
      {
        title: 'Activate Shopify Payments',
        detail:
          'The parent submits legal name, tax id, address, and a bank account. Cards work once approved.',
      },
      {
        title: 'Set shipping',
        detail:
          'Choose flat-rate or carrier-calculated shipping and buy discounted labels right inside Shopify.',
      },
      {
        title: 'Connect a domain',
        detail: 'Buy a domain through Shopify or connect one you already own.',
      },
      {
        title: 'Place a test order and launch',
        detail:
          'Run a real test order end to end, refund it, then share the link.',
      },
    ],
  },
};

/** The three providers in display order (strawman first, then the real options). */
export const PROVIDER_IDS: ProviderId[] = ['first_profit_pay', 'replit', 'shopify'];

export const providerById = (id: ProviderId): Provider => PROVIDERS[id];

/**
 * Split a gross sale amount into the provider's fee and the seller's net.
 *
 * Rounding rule (guarantees `grossCents === feeCents + netCents` for any
 * integer `grossCents >= 0`):
 *   1. rawFee = round(gross * percentBps / 10000) + flatCents
 *   2. feeCents = min(rawFee, gross)   // clamp so netCents is never negative
 *   3. netCents = gross - feeCents     // net is defined as the remainder
 *
 * Because netCents is derived by subtraction, the two parts always sum back to
 * gross exactly, and the clamp keeps net >= 0 even when the flat component alone
 * would exceed a tiny sale.
 */
export function computeFee(
  grossCents: number,
  provider: Provider,
): { feeCents: number; netCents: number } {
  const gross = Math.max(0, Math.trunc(grossCents));
  const rawFee =
    Math.round((gross * provider.fee.percentBps) / 10000) + provider.fee.flatCents;
  const feeCents = Math.min(rawFee, gross);
  const netCents = gross - feeCents;
  return { feeCents, netCents };
}
