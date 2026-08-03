/**
 * Handler-level tests for api/site.ts (Unit 3 review fix 2): the default
 * export drives mocked VercelRequest/VercelResponse objects with a vi-stubbed
 * global fetch, and the extraction/RPC support in api/_lib/handlerSupport.ts
 * is covered directly. Console.error is spied so failure-path logging (fix 3)
 * is asserted without polluting test output.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";

import handler from "../site";
import { callFpPublicSite, extractSegment } from "../_lib/handlerSupport";
import { NO_STORE, PUBLISHED_CACHE_CONTROL } from "../_lib/decideSiteResponse";

const PUBLISHED_ROW = {
  state: "published",
  first_name: "Cedric",
  headline: "Cedric's Cookie Stand",
  one_liner: "Fresh cookies for the whole block.",
};

const ENV = {
  SUPABASE_URL: "https://example-project.supabase.co",
  SUPABASE_ANON_KEY: "anon-key-value",
};

interface RecordedResponse {
  headers: Record<string, string>;
  statusCode: number | null;
  body: string | null;
  ended: boolean;
}

function makeRes(): { res: VercelResponse; recorded: RecordedResponse } {
  const recorded: RecordedResponse = { headers: {}, statusCode: null, body: null, ended: false };
  const res = {
    setHeader(name: string, value: string) {
      recorded.headers[name] = value;
      return res;
    },
    status(code: number) {
      recorded.statusCode = code;
      return res;
    },
    send(body: string) {
      recorded.body = body;
      return res;
    },
    end() {
      recorded.ended = true;
      return res;
    },
  } as unknown as VercelResponse;
  return { res, recorded };
}

function makeReq(url: string, query: Record<string, string | string[]> = {}): VercelRequest {
  return { url, query } as unknown as VercelRequest;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env.SUPABASE_URL = ENV.SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = ENV.SUPABASE_ANON_KEY;
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* ---------------------------------------------------------- extractSegment */

describe("extractSegment", () => {
  it("prefers the rewrite's query param", () => {
    expect(extractSegment({ url: "/api/site?handle=cedric", query: { handle: "cedric" } })).toBe("cedric");
  });

  it("takes the FIRST value when the query param is an array (/cedric?handle=evil)", () => {
    expect(extractSegment({ url: "/api/site", query: { handle: ["cedric", "evil"] } })).toBe("cedric");
    expect(extractSegment({ url: "/api/site", query: { handle: ["evil", "cedric"] } })).toBe("evil");
  });

  it("falls back to the single path segment for direct invocations", () => {
    expect(extractSegment({ url: "/cedric", query: {} })).toBe("cedric");
    expect(extractSegment({ url: "/cedric?x=1", query: {} })).toBe("cedric");
  });

  it("returns null for multi-segment or undecodable paths", () => {
    expect(extractSegment({ url: "/signup/verify", query: {} })).toBeNull();
    expect(extractSegment({ url: "/%zz", query: {} })).toBeNull();
    expect(extractSegment({ url: "", query: {} })).toBeNull();
    expect(extractSegment({ query: {} })).toBeNull();
  });
});

/* -------------------------------------------------------- callFpPublicSite */

describe("callFpPublicSite", () => {
  const env = { supabaseUrl: ENV.SUPABASE_URL, supabaseAnonKey: ENV.SUPABASE_ANON_KEY };

  it("POSTs the RPC with apikey + bearer and returns the parsed body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([PUBLISHED_ROW]));
    vi.stubGlobal("fetch", fetchMock);
    const result = await callFpPublicSite(env, "cedric", vi.fn());
    expect(result).toEqual({ ok: true, body: [PUBLISHED_ROW] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${ENV.SUPABASE_URL}/rest/v1/rpc/fp_public_site`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ p_handle: "cedric" }));
    expect(init.headers.apikey).toBe(ENV.SUPABASE_ANON_KEY);
    expect(init.headers.Authorization).toBe(`Bearer ${ENV.SUPABASE_ANON_KEY}`);
  });

  it("non-2xx → {ok:false} and logs status + snippet (never into the response)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("pg went away", { status: 500 })));
    const logError = vi.fn();
    const result = await callFpPublicSite(env, "cedric", logError);
    expect(result).toEqual({ ok: false, body: null });
    expect(logError).toHaveBeenCalledTimes(1);
    const message = String(logError.mock.calls[0][0]);
    expect(message).toContain("500");
    expect(message).toContain("pg went away");
  });

  it("a network throw propagates (resolveSiteResponse catches and 503s)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    await expect(callFpPublicSite(env, "cedric", vi.fn())).rejects.toThrow("ECONNRESET");
  });
});

/* ----------------------------------------------------------------- handler */

describe("handler", () => {
  it("published: 200 HTML with Content-Type, published Cache-Control, and noindex", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([PUBLISHED_ROW])));
    const { res, recorded } = makeRes();
    await handler(makeReq("/api/site?handle=cedric", { handle: "cedric" }), res);
    expect(recorded.statusCode).toBe(200);
    expect(recorded.headers["Content-Type"]).toBe("text/html; charset=utf-8");
    expect(recorded.headers["Cache-Control"]).toBe(PUBLISHED_CACHE_CONTROL);
    expect(recorded.headers["X-Robots-Tag"]).toBe("noindex");
    expect(recorded.body).toContain("Cedric&#39;s Cookie Stand");
    expect(recorded.ended).toBe(false);
  });

  it("mixed case: 308 with exact Location, headers set, and NO body", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { res, recorded } = makeRes();
    await handler(makeReq("/api/site?handle=Cedric", { handle: "Cedric" }), res);
    expect(recorded.statusCode).toBe(308);
    expect(recorded.headers.Location).toBe("/cedric");
    expect(recorded.headers["X-Robots-Tag"]).toBe("noindex");
    expect(recorded.headers["Cache-Control"]).toBe(NO_STORE);
    expect(recorded.ended).toBe(true);
    expect(recorded.body).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("zero rows: this function's 404 page, never a fall-through", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));
    const { res, recorded } = makeRes();
    await handler(makeReq("/api/site?handle=cedric", { handle: "cedric" }), res);
    expect(recorded.statusCode).toBe(404);
    expect(recorded.body).toContain("No founder has set up a page here yet");
  });

  it("RPC HTTP failure: 503, no-store, console.error called, body clean", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom detail", { status: 502 })));
    const { res, recorded } = makeRes();
    await handler(makeReq("/api/site?handle=cedric", { handle: "cedric" }), res);
    expect(recorded.statusCode).toBe(503);
    expect(recorded.headers["Cache-Control"]).toBe(NO_STORE);
    expect(recorded.body).toContain("try again");
    expect(recorded.body).not.toContain("boom detail");
    expect(errorSpy).toHaveBeenCalled();
  });

  it("network throw: 503 and the error message is logged, not served", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    const { res, recorded } = makeRes();
    await handler(makeReq("/api/site?handle=cedric", { handle: "cedric" }), res);
    expect(recorded.statusCode).toBe(503);
    expect(recorded.body).not.toContain("ECONNRESET");
    expect(errorSpy).toHaveBeenCalled();
  });

  it("malformed (non-JSON) RPC body: 503, never a false 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>not json</html>", { status: 200 })),
    );
    const { res, recorded } = makeRes();
    await handler(makeReq("/api/site?handle=cedric", { handle: "cedric" }), res);
    expect(recorded.statusCode).toBe(503);
    expect(recorded.body).toContain("try again");
  });

  it("JSON body of the wrong shape: 503", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ nope: true })));
    const { res, recorded } = makeRes();
    await handler(makeReq("/api/site?handle=cedric", { handle: "cedric" }), res);
    expect(recorded.statusCode).toBe(503);
  });

  it("missing env: 503 with clean body and no fetch", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { res, recorded } = makeRes();
    await handler(makeReq("/api/site?handle=cedric", { handle: "cedric" }), res);
    expect(recorded.statusCode).toBe(503);
    expect(recorded.body).not.toContain("SUPABASE");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("array query param resolves deterministically to the first value", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([PUBLISHED_ROW])));
    const { res, recorded } = makeRes();
    await handler(makeReq("/api/site", { handle: ["cedric", "evil"] }), res);
    expect(recorded.statusCode).toBe(200);
    expect(recorded.body).toContain("Cedric&#39;s Cookie Stand");
  });
});
