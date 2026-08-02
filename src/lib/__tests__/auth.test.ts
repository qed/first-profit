import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mock spy so the vi.mock factory can reference it safely.
const { setSession } = vi.hoisted(() => ({ setSession: vi.fn() }));

vi.mock("../supabase", () => ({
  getSupabase: () => ({ auth: { setSession } }),
}));

vi.mock("../../config", () => ({
  getConfig: () => ({
    supabaseUrl: "https://supabase.test",
    supabaseAnonKey: "anon",
    t120ApiUrl: "https://api.test",
  }),
}));

import { loginChild } from "../auth";

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
});
