/**
 * Pure HTML renderer for the public learner page at firstprofit.school/<handle>
 * (real-public-site plan Unit 3). NO Vercel imports, NO env reads, NO I/O —
 * every function takes injected data and returns a complete HTML string, like
 * `src/screens/signup/verifyLink.ts` is pure over an injected location. The
 * thin handler in `api/site.ts` owns status codes and headers.
 *
 * ESCAPING RULE (enforcement, not garnish — XSS on a child's public page is
 * the worst failure this module can have): EVERY learner-sourced string
 * (`first_name`, `headline`, `one_liner`, every product `name`/`oneLiner`)
 * passes through `publicText()` before
 * it reaches ANY output context — HTML text, `<title>`, and attribute values
 * (og:title / og:description `content`). `publicText()` strips newlines and
 * all other control characters FIRST (nothing learner-sourced can ever break
 * out of the <head> or smuggle a header-shaped line), then HTML-escapes
 * & < > " ' — which covers text nodes AND double-quoted attribute values.
 * No learner string is ever concatenated raw. New output contexts must route
 * through `publicText()` too; there is deliberately no "trusted" bypass.
 *
 * Render-boundary caps (R6): the DB projection already clamps headline<=120,
 * one_liner<=140, first_name<=80, product name<=60 / one-liner<=140 with at
 * most 5 products, but this renderer re-clamps defensively so
 * a non-DB caller (tests, future refactors) can never break the ~390px
 * layout with an unbounded string.
 *
 * Page states (origin doc R9, docs/brainstorms/2026-08-03-real-public-site-
 * requirements.md): published (200) / not-found (404, unknown OR
 * claimed-never-published — indistinguishable by design) / offline (404 —
 * reads as gone to crawlers; the COPY, not the status, tells humans it was
 * taken down, and it must never imply the handle is claimable) / temporarily
 * unavailable (503, never any error detail). All four carry noindex (R17).
 *
 * Mobile: inline mobile-first CSS designed at ~390px. `overflow-wrap:
 * anywhere` on learner text so a 120-char no-space headline can never cause
 * horizontal scroll.
 */

import { defaultSiteHeadline } from "../../src/lib/siteCopy.js";

/** One published product card (already tolerantly parsed by
 *  `decideSiteResponse` — but this renderer still re-validates defensively,
 *  same discipline as the render-boundary caps below). */
export interface SiteProduct {
  /** 1-based original position — drives the "Product #n" eyebrow. */
  n: number;
  name: string;
  oneLiner: string;
}

export interface PublishedSite {
  firstName: string | null;
  headline: string | null;
  oneLiner: string | null;
  /** Optional so a non-DB caller can omit it; absent renders no section. */
  products?: SiteProduct[];
}

const HEADLINE_MAX = 120;
const ONE_LINER_MAX = 140;
const PRODUCT_NAME_MAX = 60;
const PRODUCT_ONE_LINER_MAX = 140;
const PRODUCTS_MAX = 5;

/**
 * The five First Profit phase colors, cycled by product position (sell,
 * build, validate, grow, scale). hsl literals copied VERBATIM from the SPA's
 * design tokens — `tailwind.config.js` `colors.{sell,build,validate,grow,
 * scale}`, the same values `src/components/LogoMark.tsx` paints its five
 * ascending steps with. Keep in sync with those sources.
 */
const PHASE_COLORS = [
  "hsl(14 78% 54%)", // sell
  "hsl(217 74% 56%)", // build
  "hsl(265 52% 58%)", // validate
  "hsl(150 52% 42%)", // grow
  "hsl(41 88% 52%)", // scale
] as const;

/* ------------------------------------------------------------- escaping */

// eslint-disable-next-line no-control-regex -- stripping control chars is the point
const CONTROL_CHARS_RE = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f]", "g");

/** Strip newlines + all control chars (collapse the leftover whitespace). */
function stripControlChars(value: string): string {
  return value.replace(CONTROL_CHARS_RE, " ").replace(/\s+/g, " ").trim();
}

/** HTML-escape for text nodes, <title>, and double-quoted attributes. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** THE one gate for learner-sourced strings: control-strip, clamp, escape. */
function publicText(value: string, maxChars: number): string {
  return escapeHtml(stripControlChars(value).slice(0, maxChars));
}

/* ----------------------------------------------------------------- shell */

const STYLE = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: ui-rounded, "Segoe UI", system-ui, -apple-system, sans-serif;
    background: #faf6f0;
    color: #3b2f25;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  main {
    flex: 1;
    width: 100%;
    max-width: 560px;
    margin: 0 auto;
    padding: 48px 24px 32px;
  }
  h1 {
    margin: 0;
    font-size: clamp(1.6rem, 6vw, 2.2rem);
    line-height: 1.2;
    overflow-wrap: anywhere;
  }
  .note {
    margin: 16px 0 0;
    font-size: 1rem;
    line-height: 1.55;
    color: #5c4b3a;
  }
  .cta {
    display: inline-block;
    margin-top: 24px;
    padding: 12px 20px;
    min-height: 44px;
    border-radius: 999px;
    background: #2f7d4f;
    color: #fff;
    text-decoration: none;
    font-weight: 700;
  }
  footer {
    width: 100%;
    max-width: 560px;
    margin: 0 auto;
    padding: 16px 24px 28px;
  }
  footer a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: #8a6f52;
    font-size: 0.9rem;
    text-decoration: none;
    border-bottom: 1px solid currentColor;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .products {
    display: grid;
    /* ONE card per row at every width (never 2-up): a product name plus its
       description needs the full measure to stay readable, and a single
       column is the same shape on a 390px phone as on a desktop. */
    grid-template-columns: 1fr;
    gap: 16px;
    margin-top: 40px;
  }
  .product-card {
    border-radius: 16px;
    border: 1px solid rgba(59, 47, 37, 0.08);
    border-left: 5px solid var(--pc);
    background: #fffcf7;
    background: color-mix(in srgb, var(--pc) 6%, #fffcf7);
    padding: 20px 22px;
    box-shadow: 0 1px 3px rgba(59, 47, 37, 0.06);
    min-width: 0;
  }
  .product-eyebrow {
    margin: 0 0 8px;
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--pc);
  }
  .product-name {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 700;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  .product-liner {
    margin: 8px 0 0;
    font-size: 0.98rem;
    line-height: 1.5;
    color: #5c4b3a;
    overflow-wrap: anywhere;
  }
${PHASE_COLORS.map((color, i) => `  .pc-${i} { --pc: ${color}; }`).join("\n")}
`;

interface Shell {
  /** Already-escaped title text. */
  title: string;
  /** Already-escaped og:title content. */
  ogTitle: string;
  /** Already-escaped og:description content. */
  ogDescription: string;
  /** Trusted body markup (learner strings inside are already escaped). */
  body: string;
}

function renderShell(page: Shell): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${page.title}</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="First Profit">
<meta property="og:title" content="${page.ogTitle}">
<meta property="og:description" content="${page.ogDescription}">
<meta name="twitter:card" content="summary">
<style>${STYLE}</style>
</head>
<body>
${page.body}
<footer><a href="/" target="_blank" rel="noopener noreferrer">Built with First Profit<span class="sr-only"> (opens in a new tab)</span></a></footer>
</body>
</html>
`;
}

/* ----------------------------------------------------------------- pages */

const DEFAULT_OG_DESCRIPTION =
  "A young founder’s first business — built with First Profit.";

/**
 * Render the product cards section, or "" when there is nothing to show.
 * Defensive re-validation at the render boundary (same discipline as the
 * text caps): clamp to PRODUCTS_MAX, drop elements with a non-positive-int
 * `n`, skip cards where BOTH name and one-liner are empty after the
 * control-strip. When name is empty the one-liner takes the primary slot.
 * EVERY learner string routes through `publicText()` — no bypass.
 */
function renderProductsSection(products: SiteProduct[]): string {
  const cards: string[] = [];
  for (const product of products.slice(0, PRODUCTS_MAX)) {
    if (!Number.isSafeInteger(product.n) || product.n < 1) continue;
    const name = publicText(product.name ?? "", PRODUCT_NAME_MAX);
    const oneLiner = publicText(product.oneLiner ?? "", PRODUCT_ONE_LINER_MAX);
    if (!name && !oneLiner) continue;
    // Brand color cycles by ARRAY POSITION (sell, build, validate, grow,
    // scale — PHASE_COLORS), not by n: a gap in n never skips a color.
    const colorClass = `pc-${cards.length % PHASE_COLORS.length}`;
    const primary = name || oneLiner;
    const secondary = name ? oneLiner : "";
    cards.push(
      [
        `<article class="product-card ${colorClass}">`,
        `<p class="product-eyebrow">Product #${product.n}</p>`,
        `<h2 class="product-name">${primary}</h2>`,
        ...(secondary ? [`<p class="product-liner">${secondary}</p>`] : []),
        "</article>",
      ].join("\n"),
    );
  }
  if (cards.length === 0) return "";
  return [`<section class="products" aria-label="Products">`, ...cards, "</section>"].join("\n");
}

/** The live page (R5, R6, R7, R10): headline, optional one-liner, products. */
export function renderPublishedPage(site: PublishedSite): string {
  const headlineRaw = stripControlChars(site.headline ?? "");
  // The composed default (shared in-game sentence, R12 parity via
  // src/lib/siteCopy.ts) obeys the SAME cap as an authored headline: the
  // interpolated name is pre-clamped so the sentence keeps its shape and the
  // whole line is re-clamped to HEADLINE_MAX (review fix 6d — no learner
  // string may exceed the render-boundary caps by any route).
  const defaultNameBudget = HEADLINE_MAX - defaultSiteHeadline("").length;
  const defaultName =
    stripControlChars(site.firstName ?? "").trim().slice(0, defaultNameBudget) || "Founder";
  const headline = headlineRaw
    ? publicText(headlineRaw, HEADLINE_MAX)
    : publicText(defaultSiteHeadline(defaultName), HEADLINE_MAX);
  const oneLiner = publicText(site.oneLiner ?? "", ONE_LINER_MAX);
  const productsSection = renderProductsSection(site.products ?? []);

  const body = [
    "<main>",
    // No first-name eyebrow: the name lives inside the default sentence only.
    `<h1>${headline}</h1>`,
    // The one-liner is NOT rendered on the page any more: the headline plus
    // the product cards carry the page, and the description under the
    // headline was the first thing pushed off a phone screen. The authored
    // one-liner still feeds og:description below, so link previews keep it.
    ...(productsSection ? [productsSection] : []),
    "</main>",
  ].join("\n");

  return renderShell({
    title: headline,
    ogTitle: headline,
    ogDescription: oneLiner || DEFAULT_OG_DESCRIPTION,
    body,
  });
}

/** R9a/R9b: unknown handle OR claimed-but-never-published (served as 404).
 *  Warm invitation, never implies anything about claims that may exist. */
export function renderNotFoundPage(): string {
  return renderShell({
    title: "No page here (yet) — First Profit",
    ogTitle: "No page here (yet)",
    ogDescription: "This First Profit page hasn’t been set up.",
    body: [
      "<main>",
      "<h1>No founder has set up a page here yet.</h1>",
      '<p class="note">First Profit founders are kids building their first real businesses — each one gets a page like this to share.</p>',
      '<a class="cta" href="/">Start your own</a>',
      "</main>",
    ].join("\n"),
  });
}

/** R9d: taken offline by a parent or operator (served as 404 so crawlers and
 *  preview caches treat it as gone; this copy tells humans it exists but is
 *  resting — and never suggests the handle is up for grabs). */
export function renderOfflinePage(): string {
  return renderShell({
    title: "This page is offline — First Profit",
    ogTitle: "This page is offline",
    ogDescription: "This founder’s page is taking a break.",
    body: [
      "<main>",
      "<h1>This page is offline right now.</h1>",
      '<p class="note">The founder’s page is taking a break. Check back another time!</p>',
      "</main>",
    ].join("\n"),
  });
}

/** R9c: the RPC failed or config is missing (served as 503, never 404 —
 *  misreporting existence is worse than being unavailable). No detail ever. */
export function renderUnavailablePage(): string {
  return renderShell({
    title: "One moment… — First Profit",
    ogTitle: "One moment…",
    ogDescription: "This page is temporarily unavailable.",
    body: [
      "<main>",
      "<h1>One moment…</h1>",
      '<p class="note">We’re having trouble loading this page right now. It’s not gone — please try again in a minute.</p>',
      "</main>",
    ].join("\n"),
  });
}
