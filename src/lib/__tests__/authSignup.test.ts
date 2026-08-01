import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Signup auth-layer contract tests (Slice B Unit 9): the four backend calls the
 * Start Building flow makes. Mocks fetch + the Supabase session methods; asserts
 * request shape, session adoption, the Bearer child-mint, the consent-policy
 * fetch, and that every failure is a flat result that never throws.
 */

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

import {
  startSignup,
  verifySignup,
  createSignupChild,
  fetchConsentPolicy,
} from "../auth";

interface FakeResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}
function jsonResponse(status: number, body: unknown): FakeResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
function fetchMock() {
  return global.fetch as unknown as ReturnType<typeof vi.fn>;
}

const START_INPUT = {
  parentName: "Sam Rivera",
  parentEmail: "sam@example.com",
  parentPassword: "parentpass",
  childFirstName: "Alex",
  childAgeBand: "13_to_15" as const,
  childDob: "2011-05-04",
  jurisdiction: "California, US",
  credentialChoice: "existing_credential" as const,
};

beforeEach(() => {
  setSession.mockReset();
  getSession.mockReset();
  global.fetch = vi.fn() as unknown as typeof fetch;
});

describe("startSignup", () => {
  it("verification_pending -> { ok, attemptId } and POSTs the backend-contract body", async () => {
    fetchMock().mockResolvedValue(
      jsonResponse(200, { ok: true, status: "verification_pending", attemptId: "attempt-1" }),
    );

    const result = await startSignup(START_INPUT);

    expect(result).toEqual({ ok: true, attemptId: "attempt-1" });
    const [url, init] = fetchMock().mock.calls[0];
    expect(url).toBe("https://api.test/api/fp/signup");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      parentName: "Sam Rivera",
      parentEmail: "sam@example.com",
      parentPassword: "parentpass",
      childFirstName: "Alex",
      childAgeBand: "13_to_15",
      jurisdiction: "California, US",
      credentialChoice: "existing_credential",
      childDob: "2011-05-04",
    });
  });

  it("omits childDob when not supplied", async () => {
    fetchMock().mockResolvedValue(
      jsonResponse(200, { ok: true, status: "verification_pending", attemptId: "a2" }),
    );
    await startSignup({ ...START_INPUT, childDob: undefined });
    const body = JSON.parse(fetchMock().mock.calls[0][1].body as string);
    expect("childDob" in body).toBe(false);
  });

  it("verification_pending with no attemptId -> { ok, attemptId: null }", async () => {
    fetchMock().mockResolvedValue(jsonResponse(200, { ok: true, status: "verification_pending" }));
    expect(await startSignup(START_INPUT)).toEqual({ ok: true, attemptId: null });
  });

  it("existing_account (200 signal) -> { ok:false, existingAccount:true }", async () => {
    fetchMock().mockResolvedValue(jsonResponse(200, { ok: false, status: "existing_account" }));
    expect(await startSignup(START_INPUT)).toEqual({ ok: false, existingAccount: true });
  });

  it("generic 401 refusal -> { ok:false, existingAccount:false }", async () => {
    fetchMock().mockResolvedValue(jsonResponse(401, { success: false, error: "nope" }));
    expect(await startSignup(START_INPUT)).toEqual({ ok: false, existingAccount: false });
  });

  it("network throw -> { ok:false, existingAccount:false } (never throws)", async () => {
    fetchMock().mockRejectedValue(new Error("network down"));
    expect(await startSignup(START_INPUT)).toEqual({ ok: false, existingAccount: false });
  });
});

describe("verifySignup", () => {
  it("200 + tokens -> adopts the session via setSession and returns { ok:true }", async () => {
    fetchMock().mockResolvedValue(
      jsonResponse(200, { ok: true, access_token: "acc", refresh_token: "ref" }),
    );
    setSession.mockResolvedValue({ data: { user: { id: "p1" } }, error: null });

    const result = await verifySignup({
      token: "tok",
      email: "sam@example.com",
      parentPassword: "parentpass",
    });

    expect(result).toEqual({ ok: true });
    expect(setSession).toHaveBeenCalledWith({ access_token: "acc", refresh_token: "ref" });
    const [url, init] = fetchMock().mock.calls[0];
    expect(url).toBe("https://api.test/api/fp/signup/verify");
    expect(JSON.parse(init.body as string)).toEqual({
      email: "sam@example.com",
      password: "parentpass",
      token: "tok",
    });
  });

  it("missing tokens -> { ok:false } and no setSession", async () => {
    fetchMock().mockResolvedValue(jsonResponse(200, { ok: true, access_token: "acc" }));
    expect(await verifySignup({ token: "t", email: "e@x.com", parentPassword: "pw" })).toEqual({
      ok: false,
    });
    expect(setSession).not.toHaveBeenCalled();
  });

  it("setSession error -> { ok:false }", async () => {
    fetchMock().mockResolvedValue(
      jsonResponse(200, { ok: true, access_token: "acc", refresh_token: "ref" }),
    );
    setSession.mockResolvedValue({ data: { user: null }, error: { message: "bad token" } });
    expect(await verifySignup({ token: "t", email: "e@x.com", parentPassword: "pw" })).toEqual({
      ok: false,
    });
  });

  it("non-200 -> { ok:false }, no setSession", async () => {
    fetchMock().mockResolvedValue(jsonResponse(401, {}));
    expect(await verifySignup({ token: "t", email: "e@x.com", parentPassword: "pw" })).toEqual({
      ok: false,
    });
    expect(setSession).not.toHaveBeenCalled();
  });
});

describe("createSignupChild", () => {
  it("sends the parent Bearer token + exact body, returns { ok, childId } (path a)", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "parent-access" } } });
    fetchMock().mockResolvedValue(jsonResponse(200, { ok: true, status: "child_created", childId: "child-1" }));

    const result = await createSignupChild({
      attemptId: "attempt-1",
      childFirstName: "Alex",
      credentialChoice: "existing_credential",
      childPassword: "kidpassword",
    });

    expect(result).toEqual({ ok: true, childId: "child-1" });
    const [url, init] = fetchMock().mock.calls[0];
    expect(url).toBe("https://api.test/api/fp/signup/child");
    expect(init.headers.Authorization).toBe("Bearer parent-access");
    expect(JSON.parse(init.body as string)).toEqual({
      attemptId: "attempt-1",
      childFirstName: "Alex",
      credentialChoice: "existing_credential",
      childPassword: "kidpassword",
    });
  });

  it("path b omits the child password", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "parent-access" } } });
    fetchMock().mockResolvedValue(jsonResponse(200, { ok: true, childId: "child-2" }));

    await createSignupChild({
      attemptId: "a",
      childFirstName: "Robin",
      credentialChoice: "provision_workspace",
      childPassword: "ignored",
    });

    const body = JSON.parse(fetchMock().mock.calls[0][1].body as string);
    expect("childPassword" in body).toBe(false);
    expect(body.credentialChoice).toBe("provision_workspace");
  });

  it("no adopted session -> { ok:false } and never fetches", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const result = await createSignupChild({
      attemptId: "a",
      childFirstName: "Alex",
      credentialChoice: "existing_credential",
      childPassword: "kidpassword",
    });
    expect(result).toEqual({ ok: false });
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("non-200 / missing childId -> { ok:false }", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "x" } } });
    fetchMock().mockResolvedValue(jsonResponse(401, { success: false }));
    expect(
      await createSignupChild({
        attemptId: "a",
        childFirstName: "Alex",
        credentialChoice: "existing_credential",
        childPassword: "kidpassword",
      }),
    ).toEqual({ ok: false });
  });

  it("network throw -> { ok:false } (never throws)", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "x" } } });
    fetchMock().mockRejectedValue(new Error("down"));
    expect(
      await createSignupChild({
        attemptId: "a",
        childFirstName: "Alex",
        credentialChoice: "existing_credential",
        childPassword: "kidpassword",
      }),
    ).toEqual({ ok: false });
  });
});

describe("fetchConsentPolicy", () => {
  it("returns the rendered policy (namespace/version/hash/method/text)", async () => {
    fetchMock().mockResolvedValue(
      jsonResponse(200, {
        namespace: "fp_parental_consent",
        version: "2026-08-01.1",
        hash: "f".repeat(64),
        method: "email_plus_attestation",
        text: "I confirm ...",
      }),
    );
    const policy = await fetchConsentPolicy();
    expect(policy).toEqual({
      namespace: "fp_parental_consent",
      version: "2026-08-01.1",
      hash: "f".repeat(64),
      method: "email_plus_attestation",
      text: "I confirm ...",
    });
    expect(fetchMock().mock.calls[0][0]).toBe("https://api.test/api/fp/signup/consent-policy");
  });

  it("a partial body (missing hash) -> null (fall back to the local default)", async () => {
    fetchMock().mockResolvedValue(
      jsonResponse(200, { namespace: "fp_parental_consent", version: "v", method: "m", text: "t" }),
    );
    expect(await fetchConsentPolicy()).toBeNull();
  });

  it("non-200 -> null; network throw -> null (never throws)", async () => {
    fetchMock().mockResolvedValue(jsonResponse(500, {}));
    expect(await fetchConsentPolicy()).toBeNull();
    fetchMock().mockRejectedValue(new Error("down"));
    expect(await fetchConsentPolicy()).toBeNull();
  });
});
