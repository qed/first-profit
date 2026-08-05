// Client half of the handoff exchange contract (v3 Unit 6). The120 side is
// `app/api/fp/handoff/exchange/route.ts`; this pins what the browser sends and
// what the SPA is allowed to conclude from what comes back.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
  isPublicSiteEnabled: () => false,
}));

import { loginChild, redeemSignInToken, SIGNIN_TIMEOUT_MS } from "../auth";

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** The exchange's 200 is byte-shape-identical to /api/fp/login's success. */
const sessionBody = {
  access_token: "access-abc",
  refresh_token: "refresh-xyz",
  profile: { handle: "remi.newal", firstName: "Remi" },
  grade: 5,
};

/** The120's refusal body — the SAME bytes for unknown / consumed / expired. */
const refusalBody = { success: false, error: "Sign in failed. Please try again." };

function fetchMock() {
  return global.fetch as unknown as ReturnType<typeof vi.fn>;
}

describe("redeemSignInToken", () => {
  beforeEach(() => {
    setSession.mockReset();
    global.fetch = vi.fn() as unknown as typeof fetch;
  });

  it("POSTs the code to the exchange with the contracted URL, body, headers and CORS mode", async () => {
    fetchMock().mockResolvedValue(jsonResponse(200, sessionBody));
    setSession.mockResolvedValue({ data: { user: { id: "user-9" } }, error: null });

    await redeemSignInToken("one-time-code");

    expect(fetchMock()).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.test/api/fp/handoff/exchange");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ code: "one-time-code" }));
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.mode).toBe("cors");
    // No ambient credentials cross-origin: the route authenticates by Origin +
    // the one-time code, so a cookie would be pure CSRF surface.
    expect(init.credentials).toBe("omit");
  });

  it("200 adopts the session and returns the same shape as loginChild", async () => {
    fetchMock().mockResolvedValue(jsonResponse(200, sessionBody));
    setSession.mockResolvedValue({ data: { user: { id: "user-9" } }, error: null });

    const result = await redeemSignInToken("one-time-code");

    expect(setSession).toHaveBeenCalledWith({
      access_token: "access-abc",
      refresh_token: "refresh-xyz",
    });
    expect(result).toEqual({
      ok: true,
      userId: "user-9",
      profile: { handle: "remi.newal", firstName: "Remi" },
      grade: 5,
    });
  });

  it("treats 401 (unknown / consumed / expired) and 403 (origin) IDENTICALLY", async () => {
    fetchMock().mockResolvedValue(jsonResponse(401, refusalBody));
    const unauthorized = await redeemSignInToken("spent-code");

    fetchMock().mockResolvedValue(jsonResponse(403, refusalBody));
    const forbidden = await redeemSignInToken("spent-code");

    expect(unauthorized).toEqual({ ok: false });
    expect(forbidden).toEqual(unauthorized);
    // Nothing was adopted on either refusal.
    expect(setSession).not.toHaveBeenCalled();
  });

  it("never throws: a transport fault, a non-JSON body, or a failed setSession is a flat failure", async () => {
    fetchMock().mockRejectedValue(new Error("offline"));
    expect(await redeemSignInToken("c")).toEqual({ ok: false });

    fetchMock().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("not json");
      },
    });
    expect(await redeemSignInToken("c")).toEqual({ ok: false });

    fetchMock().mockResolvedValue(jsonResponse(200, sessionBody));
    setSession.mockResolvedValue({ data: { user: null }, error: { message: "bad token" } });
    expect(await redeemSignInToken("c")).toEqual({ ok: false });
  });

  it("refuses a 200 that is missing either token rather than half-adopting", async () => {
    fetchMock().mockResolvedValue(
      jsonResponse(200, { ...sessionBody, refresh_token: undefined }),
    );
    expect(await redeemSignInToken("c")).toEqual({ ok: false });
    expect(setSession).not.toHaveBeenCalled();
  });

  it("coerces a missing/malformed grade to null (older backend build)", async () => {
    fetchMock().mockResolvedValue(jsonResponse(200, { ...sessionBody, grade: "five" }));
    setSession.mockResolvedValue({ data: { user: { id: "u" } }, error: null });
    const result = await redeemSignInToken("c");
    expect(result).toMatchObject({ ok: true, grade: null });
  });
});

/* ─────────────────── The bounded transport (Unit 6 review, FIX 2) ────────────
 *
 * A bare fetch has no timeout, and on the handoff door that is not slowness —
 * it is a family parked on "Signing you in…" forever with no cancel, no
 * fallback and no instruction, because the boot is deliberately held for the
 * redeem. The requirement is that a HANG and a REFUSAL are INDISTINGUISHABLE:
 * both settle, both `{ok:false}`, both land on the recovery Login+notice.
 */

/** A fetch that never answers on its own — it only ever rejects on abort,
 *  exactly like a stalled connection the AbortController tears down. */
function hangingFetch() {
  return vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise<never>((_, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        );
      }),
  );
}

describe("sign-in doors are timeout-bounded", () => {
  beforeEach(() => {
    setSession.mockReset();
    global.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("both doors send an abort signal", async () => {
    fetchMock().mockResolvedValue(jsonResponse(401, refusalBody));
    await redeemSignInToken("c");
    await loginChild("kid", "pw");
    for (const call of fetchMock().mock.calls) {
      const init = call[1] as RequestInit;
      expect(init.signal, "every sign-in request carries an abort signal").toBeInstanceOf(
        AbortSignal,
      );
      expect(init.signal?.aborted).toBe(false);
    }
  });

  it("a HUNG exchange aborts at SIGNIN_TIMEOUT_MS and is byte-identical to a refusal", async () => {
    vi.useFakeTimers();
    global.fetch = hangingFetch() as unknown as typeof fetch;

    const pending = redeemSignInToken("one-time-code");
    // Nothing has settled yet — this is the spinner state.
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(SIGNIN_TIMEOUT_MS - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(2);
    // Same value a spent code produces — the screen cannot tell them apart,
    // which is the point: one recovery surface serves both.
    expect(await pending).toEqual({ ok: false });
    expect(setSession).not.toHaveBeenCalled();
  });

  it("a HUNG password login times out the same way (the sibling door)", async () => {
    vi.useFakeTimers();
    global.fetch = hangingFetch() as unknown as typeof fetch;

    const pending = loginChild("remi.newal", "iloveschoolrocket");
    await vi.advanceTimersByTimeAsync(SIGNIN_TIMEOUT_MS + 1);
    expect(await pending).toEqual({ ok: false });
  });

  it("a request that answers in time is NOT aborted (the timer is cleared)", async () => {
    vi.useFakeTimers();
    let captured: AbortSignal | undefined;
    global.fetch = vi.fn((_url: string, init: RequestInit) => {
      captured = init.signal ?? undefined;
      return Promise.resolve(jsonResponse(200, sessionBody));
    }) as unknown as typeof fetch;
    setSession.mockResolvedValue({ data: { user: { id: "user-9" } }, error: null });

    expect(await redeemSignInToken("c")).toMatchObject({ ok: true });
    await vi.advanceTimersByTimeAsync(SIGNIN_TIMEOUT_MS * 2);
    expect(captured?.aborted).toBe(false);
  });
});
