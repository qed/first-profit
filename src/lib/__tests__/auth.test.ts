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
