/**
 * CONTRACT-PINNING tests for the public-site API client (real-public-site plan,
 * Unit 4) — written FIRST, per the institutional lesson "a cross-unit contract
 * survives only as a failing test": every fixture below is the EXACT serialized
 * response vocabulary the the120 routes promise the FP client, copied from the
 * contract blocks in those route headers. If the120 renames a field or a reason
 * string, these tests fail HERE, on the consumer side, before any UI breaks.
 *
 * Fixture sources (the120 repo — the "Contract for the FP client (Unit 4)"
 * comment in each header):
 *   app/api/fp/site/route.ts               — self-read GET
 *   app/api/fp/site/availability/route.ts  — availability POST
 *   app/api/fp/site/claim/route.ts         — claim POST
 *   app/api/fp/site/publish/route.ts       — publish POST
 *   app/api/fp/site/site-rules.ts          — the one generic 401 refusal
 *     (byte-identical body, same copy as the login surface: shapeSiteRefusal /
 *     SIGN_IN_FAILED_MESSAGE in app/fp/lib/provision-rules.ts)
 *
 * Posture pinned here:
 *  - DESIGNED BRANCHES (taken / yours / invalid / already-claimed / locked /
 *    outage) ride HTTP 200 with a structured body — the client surfaces them.
 *  - Every auth/gate/rate refusal is the ONE generic 401; the client collapses
 *    it (and network faults / malformed bodies) to its flat failure without
 *    ever distinguishing reasons.
 *  - A DB outage is the STRUCTURED 200 `{ok:false, reason:"outage"}`.
 *  - Flag off (VITE_ENABLE_PUBLIC_SITE) -> flat failure with NO network call.
 *  - House auth.ts discipline: flat {ok:false}-style results, never throws.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks so the vi.mock factories can reference them safely.
const { getSession, publicSiteFlag } = vi.hoisted(() => ({
  getSession: vi.fn(),
  publicSiteFlag: { enabled: true },
}));

vi.mock("../supabase", () => ({
  getSupabase: () => ({ auth: { getSession } }),
}));

vi.mock("../../config", () => ({
  getConfig: () => ({
    supabaseUrl: "https://supabase.test",
    supabaseAnonKey: "anon",
    t120ApiUrl: "https://api.test",
  }),
  isPublicSiteEnabled: () => publicSiteFlag.enabled,
}));

import {
  fetchSiteStatus,
  checkHandleAvailability,
  claimHandle,
  publishSite,
} from "../auth";

// ── Serialized fixtures (copied from the the120 route headers) ───────────────

// app/api/fp/site/route.ts: 200 {ok:true, handle: string|null, status} |
// 200 {ok:false, reason:"outage"}; status is none|claimed|published|offline.
const SITE_READ_PUBLISHED = '{"ok":true,"handle":"cedric","status":"published"}';
const SITE_READ_NONE = '{"ok":true,"handle":null,"status":"none"}';
const SITE_READ_CLAIMED = '{"ok":true,"handle":"cedric","status":"claimed"}';
const SITE_READ_OFFLINE = '{"ok":true,"handle":"cedric","status":"offline"}';

// app/api/fp/site/availability/route.ts: 200 {ok:true, verdict, suggestions:
// string[]}; verdict is available|taken|yours|invalid.
const AVAILABILITY_AVAILABLE = '{"ok":true,"verdict":"available","suggestions":[]}';
const AVAILABILITY_TAKEN =
  '{"ok":true,"verdict":"taken","suggestions":["cedric2","cedric3","cedric-co"]}';
const AVAILABILITY_YOURS = '{"ok":true,"verdict":"yours","suggestions":[]}';
const AVAILABILITY_INVALID = '{"ok":true,"verdict":"invalid","suggestions":[]}';

// app/api/fp/site/claim/route.ts: all 200 —
//   {ok:true,  handle, status: "claimed"|"published"|"offline"}
//   {ok:false, reason:"invalid"}
//   {ok:false, reason:"taken", suggestions: string[]}
//   {ok:false, reason:"already-claimed", handle}
//   {ok:false, reason:"outage"}
const CLAIM_OK = '{"ok":true,"handle":"cedric","status":"claimed"}';
const CLAIM_INVALID = '{"ok":false,"reason":"invalid"}';
const CLAIM_TAKEN = '{"ok":false,"reason":"taken","suggestions":["cedric2","cedric-co"]}';
const CLAIM_ALREADY = '{"ok":false,"reason":"already-claimed","handle":"cedric"}';

// app/api/fp/site/publish/route.ts: all 200 —
//   {ok:true,  status:"published", firstPublish: boolean, parentNotified: boolean}
//   {ok:false, reason:"no-site"}
//   {ok:false, reason:"locked", status:"offline"}
//   {ok:false, reason:"outage"}
const PUBLISH_OK = '{"ok":true,"status":"published","firstPublish":true,"parentNotified":true}';
const PUBLISH_OK_REPEAT =
  '{"ok":true,"status":"published","firstPublish":false,"parentNotified":false}';
const PUBLISH_NO_SITE = '{"ok":false,"reason":"no-site"}';
const PUBLISH_LOCKED = '{"ok":false,"reason":"locked","status":"offline"}';

// Shared by all four endpoints: a DB outage rides the STRUCTURED 200 shape.
const OUTAGE = '{"ok":false,"reason":"outage"}';

// site-rules.ts shapeSiteRefusal: every auth/gate/rate refusal is this ONE
// byte-identical 401 body (REFUSAL_BODY = {success:false, error:
// SIGN_IN_FAILED_MESSAGE from app/fp/lib/provision-rules.ts}) — same copy as
// the login surface, serialized once at module load.
const REFUSAL_401_BODY = `{"success":false,"error":"That name and password don't match. Check both and try again — or ask a parent to reset it."}`;

// ── Fake fetch plumbing (the auth.test.ts idiom) ─────────────────────────────

interface FakeResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

/** Build a response whose body is the EXACT serialized fixture string. */
function serializedResponse(status: number, body: string): FakeResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(body) as unknown,
  };
}

function mockFetch(response: FakeResponse): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue(response);
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

beforeEach(() => {
  publicSiteFlag.enabled = true;
  getSession.mockReset();
  getSession.mockResolvedValue({ data: { session: { access_token: "tok-child" } } });
  global.fetch = vi.fn() as unknown as typeof fetch;
});

// ── Feature-flag short-circuit (all four) ────────────────────────────────────

describe("VITE_ENABLE_PUBLIC_SITE off → flat failure, NO network, NO session read", () => {
  it("short-circuits every function without touching fetch or the session", async () => {
    publicSiteFlag.enabled = false;
    const fetchSpy = global.fetch as ReturnType<typeof vi.fn>;

    expect(await fetchSiteStatus()).toEqual({ ok: false });
    expect(await checkHandleAvailability("cedric")).toEqual({ ok: false });
    // claim/publish keep the wire `reason` vocabulary; `cause` is the
    // CLIENT-LOCAL diagnostic (never on the wire, never pinned against the120).
    expect(await claimHandle("cedric")).toEqual({
      ok: false,
      reason: "outage",
      cause: "flag-off",
    });
    expect(await publishSite()).toEqual({ ok: false, reason: "outage", cause: "flag-off" });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
  });
});

// ── Self-read GET /api/fp/site ───────────────────────────────────────────────

describe("fetchSiteStatus (self-read contract)", () => {
  it("GETs /api/fp/site with the session Bearer token", async () => {
    const fetchSpy = mockFetch(serializedResponse(200, SITE_READ_NONE));
    await fetchSiteStatus();
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.test/api/fp/site",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer tok-child" }),
      }),
    );
  });

  it("pins the full status vocabulary: none / claimed / published / offline", async () => {
    const cases: Array<[string, { handle: string | null; status: string }]> = [
      [SITE_READ_NONE, { handle: null, status: "none" }],
      [SITE_READ_CLAIMED, { handle: "cedric", status: "claimed" }],
      [SITE_READ_PUBLISHED, { handle: "cedric", status: "published" }],
      [SITE_READ_OFFLINE, { handle: "cedric", status: "offline" }],
    ];
    for (const [body, expected] of cases) {
      mockFetch(serializedResponse(200, body));
      expect(await fetchSiteStatus()).toEqual({ ok: true, ...expected });
    }
  });

  it("outage rides 200 structured → flat {ok:false}", async () => {
    mockFetch(serializedResponse(200, OUTAGE));
    expect(await fetchSiteStatus()).toEqual({ ok: false });
  });

  it("the one generic 401 refusal → flat {ok:false} (never distinguished)", async () => {
    mockFetch(serializedResponse(401, REFUSAL_401_BODY));
    expect(await fetchSiteStatus()).toEqual({ ok: false });
  });

  it("an unknown status value is refused (never a fake status into the slice)", async () => {
    mockFetch(serializedResponse(200, '{"ok":true,"handle":"cedric","status":"weird"}'));
    expect(await fetchSiteStatus()).toEqual({ ok: false });
  });

  it("a claimed/published status WITHOUT a handle is refused (never a fake handle)", async () => {
    mockFetch(serializedResponse(200, '{"ok":true,"handle":null,"status":"published"}'));
    expect(await fetchSiteStatus()).toEqual({ ok: false });
  });

  it("no session token → flat {ok:false} without a network call", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const fetchSpy = global.fetch as ReturnType<typeof vi.fn>;
    expect(await fetchSiteStatus()).toEqual({ ok: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("network fault / malformed body → flat {ok:false}, never throws", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("offline"));
    expect(await fetchSiteStatus()).toEqual({ ok: false });
    mockFetch({ ok: true, status: 200, json: async () => "not-an-object" });
    expect(await fetchSiteStatus()).toEqual({ ok: false });
  });
});

// ── POST /api/fp/site/availability ───────────────────────────────────────────

describe("checkHandleAvailability (availability contract)", () => {
  it("POSTs {handle} with the Bearer token", async () => {
    const fetchSpy = mockFetch(serializedResponse(200, AVAILABILITY_AVAILABLE));
    await checkHandleAvailability("Cedric");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.test/api/fp/site/availability",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer tok-child" }),
        body: JSON.stringify({ handle: "Cedric" }),
      }),
    );
  });

  it("pins the full verdict vocabulary: available / taken / yours / invalid", async () => {
    const cases: Array<[string, { verdict: string; suggestions: string[] }]> = [
      [AVAILABILITY_AVAILABLE, { verdict: "available", suggestions: [] }],
      [AVAILABILITY_TAKEN, { verdict: "taken", suggestions: ["cedric2", "cedric3", "cedric-co"] }],
      [AVAILABILITY_YOURS, { verdict: "yours", suggestions: [] }],
      [AVAILABILITY_INVALID, { verdict: "invalid", suggestions: [] }],
    ];
    for (const [body, expected] of cases) {
      mockFetch(serializedResponse(200, body));
      expect(await checkHandleAvailability("cedric")).toEqual({ ok: true, ...expected });
    }
  });

  it("non-string suggestion entries are dropped, never surfaced to the UI", async () => {
    mockFetch(
      serializedResponse(200, '{"ok":true,"verdict":"taken","suggestions":["ok-one",42,null]}'),
    );
    expect(await checkHandleAvailability("cedric")).toEqual({
      ok: true,
      verdict: "taken",
      suggestions: ["ok-one"],
    });
  });

  it("outage (200 structured) and the generic 401 both collapse to flat {ok:false}", async () => {
    mockFetch(serializedResponse(200, OUTAGE));
    expect(await checkHandleAvailability("cedric")).toEqual({ ok: false });
    mockFetch(serializedResponse(401, REFUSAL_401_BODY));
    expect(await checkHandleAvailability("cedric")).toEqual({ ok: false });
  });

  it("an unknown verdict is refused; a network fault never throws", async () => {
    mockFetch(serializedResponse(200, '{"ok":true,"verdict":"maybe","suggestions":[]}'));
    expect(await checkHandleAvailability("cedric")).toEqual({ ok: false });
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("offline"));
    expect(await checkHandleAvailability("cedric")).toEqual({ ok: false });
  });
});

// ── POST /api/fp/site/claim ──────────────────────────────────────────────────

describe("claimHandle (claim contract)", () => {
  it("POSTs {handle}; success carries the canonical handle + status", async () => {
    const fetchSpy = mockFetch(serializedResponse(200, CLAIM_OK));
    const result = await claimHandle("Cedric");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.test/api/fp/site/claim",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer tok-child" }),
        body: JSON.stringify({ handle: "Cedric" }),
      }),
    );
    expect(result).toEqual({ ok: true, handle: "cedric", status: "claimed" });
  });

  it("pins every designed refusal branch: invalid / taken(+suggestions) / already-claimed(+handle) / outage", async () => {
    mockFetch(serializedResponse(200, CLAIM_INVALID));
    expect(await claimHandle("x")).toEqual({ ok: false, reason: "invalid" });

    mockFetch(serializedResponse(200, CLAIM_TAKEN));
    expect(await claimHandle("cedric")).toEqual({
      ok: false,
      reason: "taken",
      suggestions: ["cedric2", "cedric-co"],
    });

    mockFetch(serializedResponse(200, CLAIM_ALREADY));
    expect(await claimHandle("other")).toEqual({
      ok: false,
      reason: "already-claimed",
      handle: "cedric",
    });

    mockFetch(serializedResponse(200, OUTAGE));
    expect(await claimHandle("cedric")).toEqual({
      ok: false,
      reason: "outage",
      cause: "server",
    });
  });

  it("the generic 401 refusal collapses to outage/server — never a distinguishable auth branch", async () => {
    mockFetch(serializedResponse(401, REFUSAL_401_BODY));
    expect(await claimHandle("cedric")).toEqual({
      ok: false,
      reason: "outage",
      cause: "server",
    });
  });

  it("network fault / malformed body / unknown reason → outage with the honest client-local cause, never throws", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("offline"));
    expect(await claimHandle("cedric")).toEqual({
      ok: false,
      reason: "outage",
      cause: "transport",
    });
    mockFetch(serializedResponse(200, '{"ok":false,"reason":"brand-new-reason"}'));
    expect(await claimHandle("cedric")).toEqual({
      ok: false,
      reason: "outage",
      cause: "server",
    });
    // ok:true but a malformed payload must never mint a fake success.
    mockFetch(serializedResponse(200, '{"ok":true,"handle":null,"status":"claimed"}'));
    expect(await claimHandle("cedric")).toEqual({
      ok: false,
      reason: "outage",
      cause: "server",
    });
  });

  it("no session token → outage/no-session without a network call", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const fetchSpy = global.fetch as ReturnType<typeof vi.fn>;
    expect(await claimHandle("cedric")).toEqual({
      ok: false,
      reason: "outage",
      cause: "no-session",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ── POST /api/fp/site/publish ────────────────────────────────────────────────

describe("publishSite (publish contract)", () => {
  it("POSTs with no body; success surfaces firstPublish + parentNotified", async () => {
    const fetchSpy = mockFetch(serializedResponse(200, PUBLISH_OK));
    const result = await publishSite();
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.test/api/fp/site/publish",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer tok-child" }),
      }),
    );
    expect(result).toEqual({
      ok: true,
      status: "published",
      firstPublish: true,
      parentNotified: true,
    });
  });

  it("an idempotent re-publish surfaces firstPublish:false / parentNotified:false", async () => {
    mockFetch(serializedResponse(200, PUBLISH_OK_REPEAT));
    expect(await publishSite()).toEqual({
      ok: true,
      status: "published",
      firstPublish: false,
      parentNotified: false,
    });
  });

  it("pins the designed refusals: no-site / locked / outage", async () => {
    mockFetch(serializedResponse(200, PUBLISH_NO_SITE));
    expect(await publishSite()).toEqual({ ok: false, reason: "no-site" });

    mockFetch(serializedResponse(200, PUBLISH_LOCKED));
    expect(await publishSite()).toEqual({ ok: false, reason: "locked" });

    mockFetch(serializedResponse(200, OUTAGE));
    expect(await publishSite()).toEqual({ ok: false, reason: "outage", cause: "server" });
  });

  it("the generic 401 / network fault / malformed body all collapse to outage with the honest cause, never throw", async () => {
    mockFetch(serializedResponse(401, REFUSAL_401_BODY));
    expect(await publishSite()).toEqual({ ok: false, reason: "outage", cause: "server" });
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("offline"));
    expect(await publishSite()).toEqual({ ok: false, reason: "outage", cause: "transport" });
    mockFetch(serializedResponse(200, '{"ok":true,"status":"draft"}'));
    expect(await publishSite()).toEqual({ ok: false, reason: "outage", cause: "server" });
  });

  it("no session token → outage/no-session without a network call", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const fetchSpy = global.fetch as ReturnType<typeof vi.fn>;
    expect(await publishSite()).toEqual({ ok: false, reason: "outage", cause: "no-session" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
