// @vitest-environment jsdom
//
// The one-time handoff code must be read into memory and REMOVED from the URL
// before anything else can observe it (v3 Unit 6). These tests pin both halves:
// the parse (path-scoped, decoded, malformed-tolerant) and the strip (via
// replaceState, so Back cannot restore the tokened URL).
import { describe, it, expect, beforeEach } from "vitest";

import {
  consumeEnterLink,
  consumeEnterLinkFrom,
  isEnterPath,
  peekEnterLink,
  readEnterCode,
  resetEnterLinkForTests,
} from "../enterLink";

const ORIGIN = "https://firstprofit.school";

function loc(pathname: string, hash: string, search = "") {
  return { pathname, search, hash };
}

describe("isEnterPath", () => {
  it("matches /auth/enter with and without a trailing slash, nothing else", () => {
    expect(isEnterPath("/auth/enter")).toBe(true);
    expect(isEnterPath("/auth/enter/")).toBe(true);
    expect(isEnterPath("/auth/enter/extra")).toBe(false);
    expect(isEnterPath("/auth")).toBe(false);
    expect(isEnterPath("/")).toBe(false);
  });
});

describe("readEnterCode", () => {
  it("reads the code from the fragment", () => {
    expect(readEnterCode(loc("/auth/enter", "#code=abc123"))).toBe("abc123");
  });

  it("URL-DECODES the code (the120 encodes it into the fragment)", () => {
    // A code containing bytes that must be encoded: the raw value round-trips.
    const raw = "a+b/c=d?e&f";
    const hash = `#code=${encodeURIComponent(raw)}`;
    expect(readEnterCode(loc("/auth/enter", hash))).toBe(raw);
  });

  it("does NOT decode `+` as a space (the URLSearchParams trap)", () => {
    // A literal + in the fragment is a plus, not a space: URLSearchParams would
    // silently corrupt it, so the parser is hand-rolled.
    expect(readEnterCode(loc("/auth/enter", "#code=aa+bb"))).toBe("aa+bb");
  });

  it("finds `code` among other fragment params, in any position", () => {
    expect(readEnterCode(loc("/auth/enter", "#kid=1&code=zz9&x=2"))).toBe("zz9");
  });

  it("is path-scoped: a stray #code= elsewhere never hijacks the boot", () => {
    expect(readEnterCode(loc("/", "#code=abc123"))).toBeNull();
    expect(readEnterCode(loc("/signup/verify", "#code=abc123"))).toBeNull();
  });

  it("returns null with no fragment at all", () => {
    expect(readEnterCode(loc("/auth/enter", ""))).toBeNull();
    expect(readEnterCode(loc("/auth/enter", "#"))).toBeNull();
  });

  it("returns null for a malformed fragment rather than throwing", () => {
    // No `code` key.
    expect(readEnterCode(loc("/auth/enter", "#token=abc"))).toBeNull();
    // Key with no `=`.
    expect(readEnterCode(loc("/auth/enter", "#code"))).toBeNull();
    // Empty value.
    expect(readEnterCode(loc("/auth/enter", "#code="))).toBeNull();
    // Whitespace-only value.
    expect(readEnterCode(loc("/auth/enter", "#code=%20%20"))).toBeNull();
    // Broken percent-encoding: decodeURIComponent throws — we must not.
    expect(readEnterCode(loc("/auth/enter", "#code=%E0%A4%A"))).toBeNull();
    expect(readEnterCode(loc("/auth/enter", "#code=%zz"))).toBeNull();
  });

  it("returns null for a null location (SSR / no window)", () => {
    expect(readEnterCode(null)).toBeNull();
  });
});

describe("consumeEnterLinkFrom (strip)", () => {
  it("rewrites the CURRENT history entry to the bare origin", () => {
    const calls: unknown[][] = [];
    const hist = { replaceState: (...a: unknown[]) => calls.push(a) };
    const result = consumeEnterLinkFrom(
      loc("/auth/enter", "#code=abc123"),
      hist as never,
      ORIGIN,
    );
    expect(result).toEqual({ code: "abc123", fromEnterRoute: true });
    expect(calls).toHaveLength(1);
    // The replacement URL carries neither the code nor the one-shot path.
    const url = String(calls[0][2]);
    expect(url).toBe(`${ORIGIN}/`);
    expect(url).not.toContain("abc123");
    expect(url).not.toContain("/auth/enter");
  });

  it("strips even when there is no code, so a refresh cannot retry-loop", () => {
    const calls: unknown[][] = [];
    const hist = { replaceState: (...a: unknown[]) => calls.push(a) };
    const result = consumeEnterLinkFrom(loc("/auth/enter", ""), hist as never, ORIGIN);
    expect(result).toEqual({ code: null, fromEnterRoute: true });
    expect(calls).toHaveLength(1);
  });

  it("touches nothing on an unrelated path", () => {
    const calls: unknown[][] = [];
    const hist = { replaceState: (...a: unknown[]) => calls.push(a) };
    const result = consumeEnterLinkFrom(loc("/", "#code=abc"), hist as never, ORIGIN);
    expect(result).toEqual({ code: null, fromEnterRoute: false });
    expect(calls).toHaveLength(0);
  });

  it("survives a history that throws (the code is already in memory)", () => {
    const hist = {
      replaceState: () => {
        throw new Error("SecurityError");
      },
    };
    expect(consumeEnterLinkFrom(loc("/auth/enter", "#code=abc"), hist as never, ORIGIN)).toEqual({
      code: "abc",
      fromEnterRoute: true,
    });
  });
});

describe("consumeEnterLink against a real history stack", () => {
  beforeEach(() => {
    resetEnterLinkForTests();
    window.history.replaceState(null, "", "/");
  });

  it("removes the code from the URL and BACK cannot restore it", () => {
    // Two real entries: a prior page, then the tokened handoff landing pushed
    // on top of it — exactly what a fresh tab opened at the link looks like
    // once anything has navigated within it.
    window.history.replaceState(null, "", "/");
    window.history.pushState(null, "", "/auth/enter#code=secret-code-123");
    expect(window.location.href).toContain("secret-code-123");
    const lengthWithToken = window.history.length;

    const result = consumeEnterLink();
    expect(result).toEqual({ code: "secret-code-123", fromEnterRoute: true });

    // The address bar no longer holds the code or the one-shot route.
    expect(window.location.href).not.toContain("secret-code-123");
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/");

    // And it is not one Back press away. The proof is that NO NEW ENTRY was
    // created: the tokened entry was OVERWRITTEN in place, so there is nothing
    // behind us holding it. (`location.hash = ""` would have PUSHED instead,
    // leaving the tokened URL live one Back press away — and re-triggering a
    // redeem against an already-burned code on that Back.)
    expect(window.history.length).toBe(lengthWithToken);

    // Memoized: later readers see the same result without re-reading the URL.
    expect(peekEnterLink()).toEqual({ code: "secret-code-123", fromEnterRoute: true });
  });

  it("peekEnterLink reports no handoff until the boot consumes one", () => {
    expect(peekEnterLink()).toEqual({ code: null, fromEnterRoute: false });
  });

  it("reports fromEnterRoute with no code on a post-strip refresh", () => {
    window.history.replaceState(null, "", "/auth/enter");
    expect(consumeEnterLink()).toEqual({ code: null, fromEnterRoute: true });
  });

  it("reports nothing on an ordinary boot", () => {
    window.history.replaceState(null, "", "/");
    expect(consumeEnterLink()).toEqual({ code: null, fromEnterRoute: false });
  });
});
