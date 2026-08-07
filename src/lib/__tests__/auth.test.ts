import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mock spies so the vi.mock factory can reference them safely.
const { setSession, getSession } = vi.hoisted(() => ({
  setSession: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("../supabase", () => ({
  getSupabase: () => ({ auth: { setSession, getSession } }),
}));

vi.mock("../../config", () => ({
  getConfig: () => ({
    supabaseUrl: "https://supabase.test",
    supabaseAnonKey: "anon",
    t120ApiUrl: "https://api.test",
  }),
}));

import { loginChild, submitBirthYear } from "../auth";
import { COVER_DATA_URL_PREFIX, COVER_URL_MAX_BYTES } from "../cover";

interface FakeResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

function jsonResponse(status: number, body: unknown): FakeResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const validBody = {
  access_token: "access-abc",
  refresh_token: "refresh-xyz",
  profile: { handle: "ada", firstName: "Ada" },
};

describe("loginChild", () => {
  beforeEach(() => {
    setSession.mockReset();
    global.fetch = vi.fn() as unknown as typeof fetch;
  });

  it("200 + valid tokens + setSession success -> { ok, userId, profile }", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(200, validBody));
    setSession.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });

    const result = await loginChild("ada", "supersecret10");

    expect(result).toEqual({
      ok: true,
      userId: "user-1",
      profile: { handle: "ada", firstName: "Ada" },
      // No grade field in the body (older backend build) -> null, still ok.
      grade: null,
      // Nor any cover field (v3 Unit 7). THE TWO-REPO DEPLOY GAP IS THE POINT:
      // The120 ships its half first, but this repo can deploy in either order
      // and every account predating v3 has no cover at all — an OLD body must
      // adopt with no branch, no version check, and no error.
      coverUrl: null,
      coverStatus: null,
    });
    expect(setSession).toHaveBeenCalledWith({
      access_token: "access-abc",
      refresh_token: "refresh-xyz",
    });
    // Route path is composed correctly (no double slash).
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.test/api/fp/login",
      expect.objectContaining({ method: "POST" }),
    );
  });

  /* ─────────────────── the comic cover (v3 Unit 7; R12) ─────────────────── */

  it("adopts a base64 SVG data-URL cover and the status beside it", async () => {
    const cover = `${COVER_DATA_URL_PREFIX}PHN2Zz48L3N2Zz4=`;
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(200, { ...validBody, coverUrl: cover, coverStatus: "final" }),
    );
    setSession.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });

    const result = await loginChild("ada", "supersecret10");

    expect(result).toMatchObject({ ok: true, coverUrl: cover, coverStatus: "final" });
  });

  it("REFUSES any cover url that is not a base64 SVG data URL", async () => {
    // The gate is a whitelist: whatever reaches an <img src> must be the one
    // sandboxed, self-contained form The120 sends. Everything else is null and
    // the surfaces fall back to the procedural sprite.
    for (const hostile of [
      "https://evil.example/cover.svg",
      "javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "data:image/svg+xml;utf8,<svg/>",
      COVER_DATA_URL_PREFIX, // prefix with no payload
      "",
      42,
      null,
      // OVER THE SIZE CEILING (Unit 7 review, FIX E). Rejected outright, never
      // truncated: `coverUrl` is written to localStorage by the profile cache,
      // whose per-origin budget also holds every unsent Step Runner draft and
      // the sync outbox — so an unbounded decoration can evict a child's
      // unsaved work, or make the very write that preserves it throw
      // QuotaExceededError. A half-written data URL would fail to decode
      // anyway and land on the same sprite fallback, having already paid the
      // storage cost.
      `${COVER_DATA_URL_PREFIX}${"A".repeat(COVER_URL_MAX_BYTES)}`,
    ]) {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        jsonResponse(200, { ...validBody, coverUrl: hostile, coverStatus: "final" }),
      );
      setSession.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
      const result = await loginChild("ada", "supersecret10");
      expect(result).toMatchObject({ ok: true, coverUrl: null });
    }
  });

  it("accepts a cover exactly AT the ceiling and refuses the very next character", async () => {
    // The boundary itself, so the bound is a decision rather than a direction.
    const pad = (n: number) => `${COVER_DATA_URL_PREFIX}${"A".repeat(n)}`;
    const atLimit = pad(COVER_URL_MAX_BYTES - COVER_DATA_URL_PREFIX.length);
    const overLimit = `${atLimit}A`;
    expect(atLimit.length).toBe(COVER_URL_MAX_BYTES);

    for (const [url, expected] of [
      [atLimit, atLimit],
      [overLimit, null],
    ] as const) {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        jsonResponse(200, { ...validBody, coverUrl: url, coverStatus: "final" }),
      );
      setSession.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
      const result = await loginChild("ada", "supersecret10");
      expect(result).toMatchObject({ ok: true, coverUrl: expected });
    }
  });

  it("ADMITS a well-formed-but-undecodable payload — the <img> is what judges the bytes", async () => {
    // A MALFORMED cover: right scheme, right encoding marker, garbage inside.
    // The gate deliberately does not decode base64; it governs the rendering
    // CONTEXT (sandboxed image, self-contained) and the RESOURCE COST, and
    // leaves "is this actually a picture?" to the image decoder, which reports
    // through `onError`. `src/components/__tests__/Avatar.cover.test.tsx`
    // proves that channel lands on the procedural sprite, so the kid's
    // experience of a corrupt cover is identical to having none.
    const malformed = `${COVER_DATA_URL_PREFIX}!!!not-base64!!!`;
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(200, { ...validBody, coverUrl: malformed, coverStatus: "final" }),
    );
    setSession.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });

    const result = await loginChild("ada", "supersecret10");

    expect(result).toMatchObject({ ok: true, coverUrl: malformed });
  });

  it("carries a 'final' status with NO url — and that is not a pending state", async () => {
    // A cover this door cannot produce (a future blob-backed one). The status
    // is honest; there is no picture; nothing anywhere renders "being drawn".
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(200, { ...validBody, coverStatus: "final" }),
    );
    setSession.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });

    const result = await loginChild("ada", "supersecret10");

    expect(result).toMatchObject({ ok: true, coverStatus: "final", coverUrl: null });
  });

  it("200 but missing / non-string tokens -> { ok: false }, no setSession call", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(200, { access_token: "only-access", profile: { handle: "ada" } }),
    );

    const result = await loginChild("ada", "supersecret10");

    expect(result).toEqual({ ok: false });
    expect(setSession).not.toHaveBeenCalled();
  });

  it("non-200 response -> { ok: false }", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(401, {}));

    const result = await loginChild("ada", "wrong");

    expect(result).toEqual({ ok: false });
    expect(setSession).not.toHaveBeenCalled();
  });

  it("thrown / network error -> { ok: false }", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));

    const result = await loginChild("ada", "supersecret10");

    expect(result).toEqual({ ok: false });
  });

  it("setSession returning an error -> { ok: false }", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(200, validBody));
    setSession.mockResolvedValue({ data: { user: null }, error: { message: "bad token" } });

    const result = await loginChild("ada", "supersecret10");

    expect(result).toEqual({ ok: false });
  });

  it("grade in the 200 body: an integer is carried; anything else coerces to null", async () => {
    setSession.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    const cases: Array<[unknown, number | null]> = [
      [4, 4], // roster-derived grade
      [12, 12],
      [null, null], // roster does not know
      ["4", null], // string is NOT a grade (number-or-null coercion only)
      [4.5, null], // non-integer
      [Number.NaN, null],
      [undefined, null], // field absent (older backend)
    ];
    for (const [raw, expected] of cases) {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        jsonResponse(200, { ...validBody, grade: raw }),
      );
      const result = await loginChild("ada", "supersecret10");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.grade).toBe(expected);
    }
  });
});

describe("submitBirthYear (ask-once write-back)", () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch; // fresh spy per test
    getSession.mockReset();
    getSession.mockResolvedValue({ data: { session: { access_token: "child-access" } } });
  });

  it("200 {ok:true, grade} -> { ok, grade }; POSTs {birthYear} with the session Bearer token", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(200, { ok: true, grade: 6 }),
    );

    const result = await submitBirthYear(2015);

    expect(result).toEqual({ ok: true, grade: 6 });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.test/api/fp/grade",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer child-access" }),
        body: JSON.stringify({ birthYear: 2015 }),
      }),
    );
    // Exactly ONE attempt per call (the route is rate limited).
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("no live session -> { ok: false } WITHOUT any network attempt", async () => {
    getSession.mockResolvedValue({ data: { session: null } });

    const result = await submitBirthYear(2015);

    expect(result).toEqual({ ok: false });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("generic 401 refusal -> flat { ok: false }", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(401, {}));
    expect(await submitBirthYear(2015)).toEqual({ ok: false });
  });

  it("200 with a malformed body (no integer grade) -> { ok: false }", async () => {
    for (const body of [{ ok: true }, { ok: true, grade: "6" }, { ok: false, grade: 6 }, {}]) {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(200, body));
      expect(await submitBirthYear(2015)).toEqual({ ok: false });
    }
  });

  it("thrown / network error -> { ok: false }", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));
    expect(await submitBirthYear(2015)).toEqual({ ok: false });
  });
});
