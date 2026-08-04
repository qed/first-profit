/**
 * Unit 3 test suite: the pure public-page renderer + the pure serving
 * decisions (`decideSiteRequest` / `decideRpcOutcome` / `resolveSiteResponse`)
 * — everything `api/site.ts` does except the literal fetch and header writes
 * (those are covered by `api/__tests__/site.test.ts`). The XSS block is
 * enforcement of the renderSite escaping rule: every learner-sourced string
 * must be inert in body, <title>, and both OG content attributes, and
 * newlines must never reach the head.
 */
import { describe, expect, it, vi } from "vitest";

import {
  renderNotFoundPage,
  renderOfflinePage,
  renderPublishedPage,
  renderUnavailablePage,
} from "../renderSite";
import {
  NO_STORE,
  PUBLISHED_CACHE_CONTROL,
  decideRpcOutcome,
  decideSiteRequest,
  resolveSiteResponse,
  type SiteEnv,
  type SiteResponse,
} from "../decideSiteResponse";

const GOOD_ENV: SiteEnv = {
  supabaseUrl: "https://example-project.supabase.co",
  supabaseAnonKey: "anon-key-value",
};

const PUBLISHED_ROW = {
  state: "published",
  first_name: "Cedric",
  headline: "Cedric's Cookie Stand",
  one_liner: "Fresh cookies for the whole block.",
};

/** Narrow to the HTML branch of the discriminated union (throws on 308). */
function htmlOf(response: SiteResponse): string {
  if (response.status === 308) throw new Error("expected an HTML response, got a redirect");
  return response.html;
}

/** Narrow to the redirect branch of the discriminated union. */
function locationOf(response: SiteResponse): string {
  if (response.status !== 308) throw new Error("expected a redirect response");
  return response.location;
}

/* ------------------------------------------------------------ happy path */

describe("renderPublishedPage", () => {
  it("renders the headline, og tags, noindex, and the footer link", () => {
    const html = renderPublishedPage({
      firstName: "Cedric",
      headline: "Cedric's Cookie Stand",
      oneLiner: "Fresh cookies for the whole block.",
    });
    expect(html).toContain("Cedric&#39;s Cookie Stand");
    expect(html).toContain('<meta property="og:title" content="Cedric&#39;s Cookie Stand">');
    expect(html).toContain(
      '<meta property="og:description" content="Fresh cookies for the whole block.">',
    );
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain("Built with First Profit");
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
  });

  it("no longer renders the first-name eyebrow above the headline", () => {
    const html = renderPublishedPage({
      firstName: "Cedric",
      headline: "Cedric's Cookie Stand",
      oneLiner: null,
    });
    // The old element and its class are both gone; the name may still appear
    // only inside the default-headline sentence (not here — headline authored).
    expect(html).not.toContain('class="founder"');
    expect(html).not.toContain("<p>Cedric</p>");
    expect(html).not.toMatch(/<p[^>]*>Cedric<\/p>/);
  });

  it("footer link opens in a new tab safely with an accessible name", () => {
    const html = renderPublishedPage({ firstName: "Cedric", headline: "x", oneLiner: null });
    expect(html).toContain(
      '<a href="/" target="_blank" rel="noopener noreferrer">Built with First Profit<span class="sr-only"> (opens in a new tab)</span></a>',
    );
  });

  it("never renders the description under the headline, even when one is authored", () => {
    const html = renderPublishedPage({
      firstName: "Cedric",
      headline: "My Stand",
      oneLiner: "Fresh cookies for the whole block.",
    });
    // Neither the element nor the stylesheet rule survives.
    expect(html).not.toContain('class="one-liner"');
    expect(html).not.toMatch(/\.one-liner\s*{/);
    // ...and the authored text appears ONLY in og:description, never in <body>.
    const body = html.slice(html.indexOf("<body>"));
    expect(body).not.toContain("Fresh cookies for the whole block.");
    expect(html).toContain(
      '<meta property="og:description" content="Fresh cookies for the whole block.">',
    );
  });

  it("falls back to the default og:description when there is no one-liner", () => {
    const html = renderPublishedPage({
      firstName: "Cedric",
      headline: "My Stand",
      oneLiner: null,
    });
    expect(html).toContain('<meta property="og:description" content="A young founder’s first business — built with First Profit.">');
  });

  it("renders the kid-friendly default headline (in-game parity) when headline is empty", () => {
    for (const headline of [null, "", "   "]) {
      const html = renderPublishedPage({ firstName: "Maya", headline, oneLiner: null });
      expect(html).toContain("Hi, I&#39;m Maya. This is the future site of my first $1,000 profit company.");
    }
  });

  it("falls back to Founder when first_name is missing", () => {
    const html = renderPublishedPage({ firstName: null, headline: null, oneLiner: null });
    expect(html).toContain("Founder");
    expect(html).toContain("Hi, I&#39;m Founder.");
  });

  it("renders a 120-char headline inert, clamped, with no raw injection", () => {
    const headline = "b".repeat(120);
    const html = renderPublishedPage({ firstName: "Cedric", headline, oneLiner: null });
    expect(html).toContain(`<h1>${headline}</h1>`);
    // Over-cap defensive clamp at the render boundary (R6).
    const over = "c".repeat(500);
    const clamped = renderPublishedPage({ firstName: "Cedric", headline: over, oneLiner: null });
    expect(clamped).toContain(`<h1>${"c".repeat(120)}</h1>`);
    expect(clamped).not.toContain("c".repeat(121));
  });

  it("clamps the composed default headline to the 120-char cap for very long names (fix 6d)", () => {
    const longName = "N".repeat(80); // DB first_name cap
    const html = renderPublishedPage({ firstName: longName, headline: null, oneLiner: null });
    const h1 = /<h1>([^<]*)<\/h1>/.exec(html);
    expect(h1).not.toBeNull();
    // Un-escape entities before counting characters (name has none here).
    const text = (h1 as RegExpExecArray)[1].replace(/&#39;/g, "'");
    expect(text.length).toBeLessThanOrEqual(120);
    expect(text.startsWith("Hi, I'm N")).toBe(true);
  });
});

/* ---------------------------------------------------------- product cards */

describe("renderPublishedPage products", () => {
  const SITE = { firstName: "Cedric", headline: "My Stand", oneLiner: null };

  // The five phase colors, in cycle order (tailwind.config.js sell → scale;
  // same values LogoMark.tsx paints). The renderer must carry these literals.
  const PHASE_HSL = [
    "hsl(14 78% 54%)", // sell
    "hsl(217 74% 56%)", // build
    "hsl(265 52% 58%)", // validate
    "hsl(150 52% 42%)", // grow
    "hsl(41 88% 52%)", // scale
  ];

  it("renders one card per product with eyebrow, name, and one-liner", () => {
    const html = renderPublishedPage({
      ...SITE,
      products: [
        { n: 1, name: "Neighborhood Histories", oneLiner: "Create a history of your street." },
        { n: 2, name: "After School Collectibles", oneLiner: "Sports cards for kids." },
      ],
    });
    expect(html).toContain('<section class="products"');
    expect(html).toContain('<p class="product-eyebrow">Product #1</p>');
    expect(html).toContain('<p class="product-eyebrow">Product #2</p>');
    expect(html).toContain('<h2 class="product-name">Neighborhood Histories</h2>');
    expect(html).toContain('<h2 class="product-name">After School Collectibles</h2>');
    expect(html).toContain('<p class="product-liner">Create a history of your street.</p>');
    expect(html).toContain('<p class="product-liner">Sports cards for kids.</p>');
  });

  it("cycles the five brand colors by array position and ships the exact hsl literals", () => {
    const products = Array.from({ length: 5 }, (_, i) => ({
      n: i + 1,
      name: `P${i + 1}`,
      oneLiner: "",
    }));
    const html = renderPublishedPage({ ...SITE, products });
    for (const hsl of PHASE_HSL) expect(html).toContain(hsl);
    // Card i carries class pc-(i % 5), in order.
    const classes = [...html.matchAll(/product-card (pc-\d)/g)].map((m) => m[1]);
    expect(classes).toEqual(["pc-0", "pc-1", "pc-2", "pc-3", "pc-4"]);
    // Each class binds its phase color in the stylesheet.
    PHASE_HSL.forEach((hsl, i) => {
      expect(html).toContain(`.pc-${i} { --pc: ${hsl}; }`);
    });
  });

  it("empty name → the one-liner takes the primary slot (no empty heading)", () => {
    const html = renderPublishedPage({
      ...SITE,
      products: [{ n: 3, name: "", oneLiner: "Dog walking after school." }],
    });
    expect(html).toContain('<h2 class="product-name">Dog walking after school.</h2>');
    expect(html).not.toContain('<h2 class="product-name"></h2>');
    expect(html).not.toContain('class="product-liner"');
    expect(html).toContain("Product #3");
  });

  it("skips a card whose name AND one-liner are both empty (whitespace counts as empty)", () => {
    const html = renderPublishedPage({
      ...SITE,
      products: [
        { n: 1, name: "", oneLiner: "   " },
        { n: 2, name: "Real", oneLiner: "Stuff" },
      ],
    });
    expect(html).not.toContain("Product #1");
    expect(html).toContain("Product #2");
    // The skipped card must not consume a color: the first rendered card is pc-0.
    expect(html).toContain('product-card pc-0');
  });

  it("clamps to 5 cards even if more arrive (trust but clamp)", () => {
    const products = Array.from({ length: 8 }, (_, i) => ({
      n: i + 1,
      name: `P${i + 1}`,
      oneLiner: "x",
    }));
    const html = renderPublishedPage({ ...SITE, products });
    expect(html).toContain("Product #5");
    expect(html).not.toContain("Product #6");
    expect((html.match(/product-card/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect([...html.matchAll(/<article class="product-card/g)].length).toBe(5);
  });

  it("drops a card with a non-positive or non-integer n at the render boundary too", () => {
    const html = renderPublishedPage({
      ...SITE,
      products: [
        { n: 0, name: "Zero", oneLiner: "" },
        { n: 1.5, name: "Frac", oneLiner: "" },
        { n: 2, name: "Good", oneLiner: "" },
      ],
    });
    expect(html).not.toContain("Zero");
    expect(html).not.toContain("Frac");
    expect(html).toContain("Good");
  });

  it("no products / empty products → no section at all, page otherwise unchanged shape", () => {
    for (const products of [undefined, []]) {
      const html = renderPublishedPage({ ...SITE, products });
      expect(html).not.toContain('<section class="products"');
      expect(html).not.toContain('<article class="product-card');
      expect(html).toContain("<h1>My Stand</h1>");
    }
  });

  it("card text uses overflow-wrap so long words can never cause horizontal scroll at 390px", () => {
    const html = renderPublishedPage({
      ...SITE,
      products: [{ n: 1, name: "Supercalifragilisticexpialidocious".repeat(2), oneLiner: "y" }],
    });
    // The stylesheet must break long words in both card text slots.
    expect(html).toMatch(/\.product-name\s*{[^}]*overflow-wrap:\s*anywhere/);
    expect(html).toMatch(/\.product-liner\s*{[^}]*overflow-wrap:\s*anywhere/);
    // And cards must be allowed to shrink inside the grid track.
    expect(html).toMatch(/\.product-card\s*{[^}]*min-width:\s*0/);
  });

  it("gives every product its OWN ROW at every width (single column, never 2-up)", () => {
    const html = renderPublishedPage({
      ...SITE,
      products: [
        { n: 1, name: "One", oneLiner: "a" },
        { n: 2, name: "Two", oneLiner: "b" },
      ],
    });
    expect(html).toMatch(/\.products\s*{[^}]*grid-template-columns:\s*1fr\s*;/);
    // The old responsive 2-up track is gone for good.
    expect(html).not.toContain("auto-fit");
    expect(html).not.toContain("minmax(");
  });

  it("clamps product name to 60 and one-liner to 140 chars defensively", () => {
    const html = renderPublishedPage({
      ...SITE,
      products: [{ n: 1, name: "n".repeat(200), oneLiner: "o".repeat(300) }],
    });
    expect(html).toContain("n".repeat(60));
    expect(html).not.toContain("n".repeat(61));
    expect(html).toContain("o".repeat(140));
    expect(html).not.toContain("o".repeat(141));
  });
});

/* -------------------------------------------------------- XSS adversarial */

describe("escaping (enforcement, not garnish)", () => {
  const PAYLOAD = '"><script>alert(1)</script>';

  it("renders a script-injection headline inert in body, title, and both OG content attrs", () => {
    const html = renderPublishedPage({
      firstName: "Cedric",
      headline: PAYLOAD,
      oneLiner: PAYLOAD,
    });
    expect(html.toLowerCase()).not.toContain("<script");
    expect(html).not.toContain('alert(1)</script>');
    // The escaped form appears in all four contexts: h1, <title>, og:title, og:description.
    const escaped = "&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;";
    expect(html).toContain(`<h1>${escaped}</h1>`);
    expect(html).toContain(`<title>${escaped}</title>`);
    expect(html).toContain(`<meta property="og:title" content="${escaped}">`);
    expect(html).toContain(`<meta property="og:description" content="${escaped}">`);
  });

  it("keeps stray quotes inside attribute values inert", () => {
    const html = renderPublishedPage({
      firstName: "Cedric",
      headline: 'say "hi" and \'bye\'',
      oneLiner: null,
    });
    expect(html).toContain('<meta property="og:title" content="say &quot;hi&quot; and &#39;bye&#39;">');
    expect(html).not.toContain('content="say "hi"');
  });

  it("escapes markup in first_name everywhere it appears", () => {
    const html = renderPublishedPage({
      firstName: "<img src=x onerror=alert(1)>",
      headline: null,
      oneLiner: null,
    });
    expect(html.toLowerCase()).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    // The default headline embeds first_name — it must be escaped there too.
    expect(html).toContain("Hi, I&#39;m &lt;img src=x onerror=alert(1)&gt;.");
  });

  it("renders script/quote-breakout product name and one-liner inert", () => {
    const html = renderPublishedPage({
      firstName: "Cedric",
      headline: "My Stand",
      oneLiner: null,
      products: [
        { n: 1, name: PAYLOAD, oneLiner: '"><img src=x onerror=alert(2)>' },
        { n: 2, name: "'\nquote\"break", oneLiner: PAYLOAD },
      ],
    });
    expect(html.toLowerCase()).not.toContain("<script");
    expect(html.toLowerCase()).not.toContain("<img");
    expect(html).not.toContain("alert(1)</script>");
    const escaped = "&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;";
    expect(html).toContain(`<h2 class="product-name">${escaped}</h2>`);
    expect(html).toContain(
      '<p class="product-liner">&quot;&gt;&lt;img src=x onerror=alert(2)&gt;</p>',
    );
    // Newlines in product strings never survive (control-strip runs first).
    expect(html).toContain("&#39; quote&quot;break");
  });

  it("never lets newlines or control chars from learner strings reach the head", () => {
    const html = renderPublishedPage({
      firstName: "Cedric",
      headline: "line one\r\nline two\u0000\u001fend",
      oneLiner: "a\nb",
    });
    expect(html).toContain("<title>line one line two end</title>");
    expect(html).toContain('content="line one line two end"');
    expect(html).toContain('content="a b"');
    expect(html).not.toContain("line one\r");
    expect(html).not.toContain("a\nb");
    expect(html).not.toContain("\u0000");
  });
});

/* -------------------------------------------------- request normalization */

describe("decideSiteRequest", () => {
  it("passes a canonical lowercase handle straight to lookup", () => {
    expect(decideSiteRequest("cedric")).toEqual({ kind: "lookup", handle: "cedric" });
    expect(decideSiteRequest("abc-123")).toEqual({ kind: "lookup", handle: "abc-123" });
  });

  it("308-redirects mixed case to exactly /<handle>, with no body", () => {
    const decision = decideSiteRequest("CeDric");
    expect(decision.kind).toBe("respond");
    if (decision.kind !== "respond") return;
    expect(decision.response.status).toBe(308);
    expect(locationOf(decision.response)).toBe("/cedric");
    expect("html" in decision.response).toBe(false);
  });

  it("canonicalizes a stray trailing slash via redirect", () => {
    const decision = decideSiteRequest("cedric/");
    expect(decision.kind).toBe("respond");
    if (decision.kind !== "respond") return;
    expect(decision.response.status).toBe(308);
    expect(locationOf(decision.response)).toBe("/cedric");
  });

  it("404s 21-char and bad-charset segments without any RPC shape (kind respond)", () => {
    for (const bad of [
      "a".repeat(21),
      "ab", // below min length
      "cedric!",
      "ced_ric",
      "cé-dric",
      "",
      null,
      undefined,
      42,
    ]) {
      const decision = decideSiteRequest(bad);
      expect(decision.kind).toBe("respond");
      if (decision.kind !== "respond") continue;
      expect(decision.response.status).toBe(404);
      expect(decision.response.cacheControl).toBe(NO_STORE);
    }
  });

  it("never produces a redirect for hostile segments", () => {
    for (const hostile of [
      "../ETC",
      "A\r\nSet-Cookie:x",
      "//EVIL.com",
      "HTTPS://evil.com",
      "%2F..%2FA",
      "A".repeat(21),
      "JAVASCRIPT:alert(1)",
    ]) {
      const decision = decideSiteRequest(hostile);
      expect(decision.kind).toBe("respond");
      if (decision.kind !== "respond") continue;
      expect(decision.response.status).toBe(404);
      expect("location" in decision.response).toBe(false);
    }
  });

  it("refuses reserved handles before any RPC (defense-in-depth, fix 6b)", () => {
    for (const reserved of ["signup", "login", "api", "first-profit", "the120"]) {
      const decision = decideSiteRequest(reserved);
      expect(decision.kind).toBe("respond");
      if (decision.kind !== "respond") continue;
      expect(decision.response.status).toBe(404);
      expect(htmlOf(decision.response)).toBe(renderNotFoundPage());
    }
  });

  it("uppercase reserved round-trips via 308 (intentional, fix 6c): SIGNUP → /signup", () => {
    // The vercel.json exclusions are case-sensitive, so /SIGNUP reaches the
    // function; redirecting to lowercase lands it on the SPA catchall next
    // request. Loop-free: the target is lowercase and lowercase reserved
    // never redirects (it 404s here, but on the platform the rewrite already
    // excludes it).
    const decision = decideSiteRequest("SIGNUP");
    expect(decision.kind).toBe("respond");
    if (decision.kind !== "respond") return;
    expect(decision.response.status).toBe(308);
    expect(locationOf(decision.response)).toBe("/signup");
  });
});

/* ------------------------------------------------------------ RPC outcome */

describe("decideRpcOutcome", () => {
  it("renders the published page with the published cache policy", () => {
    const response = decideRpcOutcome([PUBLISHED_ROW]);
    expect(response.status).toBe(200);
    expect(response.cacheControl).toBe(PUBLISHED_CACHE_CONTROL);
    expect(htmlOf(response)).toContain("Cedric&#39;s Cookie Stand");
  });

  it("zero rows → the not-found page (unknown OR never-published, by design)", () => {
    const response = decideRpcOutcome([]);
    expect(response.status).toBe(404);
    expect(response.cacheControl).toBe(NO_STORE);
    expect(htmlOf(response)).toBe(renderNotFoundPage());
  });

  it("offline row → 404 with the R9d taken-down copy, not the not-found copy", () => {
    const response = decideRpcOutcome([
      { state: "offline", first_name: null, headline: null, one_liner: null },
    ]);
    expect(response.status).toBe(404);
    expect(response.cacheControl).toBe(NO_STORE);
    expect(htmlOf(response)).toBe(renderOfflinePage());
    expect(htmlOf(response)).toContain("offline right now");
    expect(htmlOf(response)).not.toContain("No founder has set up a page here yet");
  });

  it("passes products through to the renderer (live cedric shape)", () => {
    const response = decideRpcOutcome([
      {
        ...PUBLISHED_ROW,
        products: [
          { n: 1, name: "Neighborhoood Histories", oneLiner: "Create a history..." },
          { n: 2, name: "After School Collectibles", oneLiner: "Sports Cards..." },
        ],
      },
    ]);
    expect(response.status).toBe(200);
    const html = htmlOf(response);
    expect(html).toContain("Product #1");
    expect(html).toContain("Neighborhoood Histories");
    expect(html).toContain("After School Collectibles");
    expect(html).toContain("Sports Cards...");
  });

  it("tolerates a missing/null/garbage products field — the page still renders, no section, never 503", () => {
    for (const products of [undefined, null, "garbage", 42, { n: 1 }]) {
      const row = { ...PUBLISHED_ROW, ...(products === undefined ? {} : { products }) };
      const response = decideRpcOutcome([row]);
      expect(response.status).toBe(200);
      expect(response.cacheControl).toBe(PUBLISHED_CACHE_CONTROL);
      const html = htmlOf(response);
      expect(html).toContain("Cedric&#39;s Cookie Stand");
      expect(html).not.toContain('<section class="products"');
    }
  });

  it("defensively validates each product element: bad n drops the element, non-string text becomes empty", () => {
    const response = decideRpcOutcome([
      {
        ...PUBLISHED_ROW,
        products: [
          null, // non-object → dropped
          "junk", // non-object → dropped
          { n: "not-a-number", name: "Dropped", oneLiner: "x" }, // n uncoercible → dropped
          { n: -3, name: "Negative", oneLiner: "x" }, // n < 1 → dropped
          { n: "2", name: "Coerced", oneLiner: "numeric-string n survives" },
          { n: 3, name: 42, oneLiner: { evil: true } }, // both non-string → "" → card skipped
          { n: 4, name: "Kept", oneLiner: 7 }, // one-liner non-string → ""
        ],
      },
    ]);
    expect(response.status).toBe(200);
    const html = htmlOf(response);
    expect(html).not.toContain("Dropped");
    expect(html).not.toContain("Negative");
    expect(html).toContain("Coerced");
    expect(html).toContain("Product #2");
    expect(html).not.toContain("Product #3"); // both-empty card skipped
    expect(html).toContain("Kept");
    expect(html).toContain("Product #4");
    expect(html).not.toContain("[object Object]");
  });

  it("more than one row is a contract anomaly → 503, never a page (fix 6a)", () => {
    const response = decideRpcOutcome([PUBLISHED_ROW, PUBLISHED_ROW]);
    expect(response.status).toBe(503);
    expect(response.cacheControl).toBe(NO_STORE);
    expect(htmlOf(response)).toBe(renderUnavailablePage());
  });

  it("unexpected shapes are 503 unavailable, never a false 404", () => {
    for (const weird of [null, "oops", { state: "published" }, [null], ["x"], [{ state: "???" }]]) {
      const response = decideRpcOutcome(weird);
      expect(response.status).toBe(503);
      expect(response.cacheControl).toBe(NO_STORE);
      expect(htmlOf(response)).toBe(renderUnavailablePage());
    }
  });
});

/* ------------------------------------------------------------ orchestrator */

describe("resolveSiteResponse", () => {
  it("published happy path end to end (no error logged)", async () => {
    const rpc = vi.fn().mockResolvedValue({ ok: true, body: [PUBLISHED_ROW] });
    const logError = vi.fn();
    const response = await resolveSiteResponse("cedric", GOOD_ENV, rpc, logError);
    expect(rpc).toHaveBeenCalledWith("cedric");
    expect(response.status).toBe(200);
    expect(response.cacheControl).toBe(PUBLISHED_CACHE_CONTROL);
    expect(logError).not.toHaveBeenCalled();
  });

  it("invalid segments never trigger an RPC call", async () => {
    const rpc = vi.fn();
    for (const bad of ["a".repeat(21), "not valid!", "", null]) {
      const response = await resolveSiteResponse(bad, GOOD_ENV, rpc, vi.fn());
      expect(response.status).toBe(404);
    }
    const redirect = await resolveSiteResponse("Cedric", GOOD_ENV, rpc, vi.fn());
    expect(redirect.status).toBe(308);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("RPC failure → 503 unavailable with no cache; a throw is logged, body stays clean (fix 3)", async () => {
    const failing = vi.fn().mockResolvedValue({ ok: false, body: null });
    const throwing = vi.fn().mockRejectedValue(new Error("boom"));
    for (const rpc of [failing, throwing]) {
      const logError = vi.fn();
      const response = await resolveSiteResponse("cedric", GOOD_ENV, rpc, logError);
      expect(response.status).toBe(503);
      expect(response.cacheControl).toBe(NO_STORE);
      expect(htmlOf(response)).toContain("try again");
      expect(htmlOf(response)).not.toContain("boom");
      if (rpc === throwing) {
        expect(logError).toHaveBeenCalledTimes(1);
        expect(String(logError.mock.calls[0][0])).toContain("boom");
      }
    }
  });

  it("missing env → the same 503, no RPC call, logged, no env values in the body", async () => {
    const rpc = vi.fn();
    const partial: SiteEnv = { supabaseUrl: "https://secret-ref.supabase.co", supabaseAnonKey: undefined };
    for (const env of [{ supabaseUrl: undefined, supabaseAnonKey: undefined }, partial]) {
      const logError = vi.fn();
      const response = await resolveSiteResponse("cedric", env, rpc, logError);
      expect(response.status).toBe(503);
      expect(response.cacheControl).toBe(NO_STORE);
      expect(htmlOf(response)).toBe(renderUnavailablePage());
      expect(htmlOf(response)).not.toContain("supabase");
      expect(htmlOf(response)).not.toContain("secret-ref");
      expect(htmlOf(response)).not.toContain("SUPABASE");
      expect(logError).toHaveBeenCalledTimes(1);
      // The log line names the missing config but never carries values.
      expect(String(logError.mock.calls[0][0])).not.toContain("secret-ref");
    }
    expect(rpc).not.toHaveBeenCalled();
  });
});

/* ---------------------------------------------------- non-published pages */

describe("state pages", () => {
  it("all carry noindex and the footer", () => {
    for (const html of [renderNotFoundPage(), renderOfflinePage(), renderUnavailablePage()]) {
      expect(html).toContain('<meta name="robots" content="noindex">');
      expect(html).toContain("Built with First Profit");
    }
  });

  it("not-found invites starting your own; unavailable never says gone", () => {
    expect(renderNotFoundPage()).toContain("Start your own");
    expect(renderUnavailablePage()).toContain("not gone");
  });
});
