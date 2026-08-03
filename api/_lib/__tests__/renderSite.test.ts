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
  it("renders first name, headline, og tags, noindex, and the footer link", () => {
    const html = renderPublishedPage({
      firstName: "Cedric",
      headline: "Cedric's Cookie Stand",
      oneLiner: "Fresh cookies for the whole block.",
    });
    expect(html).toContain("Cedric");
    expect(html).toContain("Cedric&#39;s Cookie Stand");
    expect(html).toContain('<meta property="og:title" content="Cedric&#39;s Cookie Stand">');
    expect(html).toContain(
      '<meta property="og:description" content="Fresh cookies for the whole block.">',
    );
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain('<a href="/">Built with First Profit</a>');
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
  });

  it("omits the one-liner section entirely when there is none, with default og:description", () => {
    const html = renderPublishedPage({
      firstName: "Cedric",
      headline: "My Stand",
      oneLiner: null,
    });
    // The section (not the stylesheet rule) is what must be absent.
    expect(html).not.toContain('class="one-liner"');
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
