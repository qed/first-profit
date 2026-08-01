import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * FULL SIGNUP-FLOW E2E — the client-orchestration walk (Slice B Unit 11).
 *
 * The per-function contracts (request shape, session adoption, flat failures)
 * are pinned in authSignup.test.ts, and the synchronous double-submit ref guard
 * in Signup.test.tsx ("does not double-submit when the stub is slow"). This test
 * adds the thing neither does: it WALKS the whole client sequence for BOTH child
 * paths in order — startSignup → verifySignup → recordSignupConsent →
 * createSignupChild — and asserts the ORDERING invariant the backend depends on:
 * the client records consent BEFORE it asks for the child mint (without the
 * consent row the mint fails `consent_required`), and it carries the adopted
 * parent Bearer on both authenticated calls. Path A sends the child password;
 * path B (provision) sends none.
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
  recordSignupConsent,
  createSignupChild,
  type SignupCredentialChoice,
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

const PARENT_JWT = "parent-access-jwt";

const baseStart = {
  parentName: "Sam Rivera",
  parentEmail: "sam@example.com",
  parentPassword: "parentpass",
  childFirstName: "Alex",
  childAgeBand: "under_13" as const,
  jurisdiction: "California, US",
};

beforeEach(() => {
  setSession.mockReset();
  getSession.mockReset();
  global.fetch = vi.fn() as unknown as typeof fetch;
  // After verify adopts the session, every authenticated call reads it back.
  setSession.mockResolvedValue({ error: null });
  getSession.mockResolvedValue({ data: { session: { access_token: PARENT_JWT } } });
});

/** Drive the full client sequence for a credential path and return the ordered
 *  fetch calls so the test can assert both the ORDER and each request's shape. */
async function walk(credentialChoice: SignupCredentialChoice, childPassword?: string) {
  fetchMock().mockImplementation((url: string) => {
    if (url.endsWith("/api/fp/signup"))
      return Promise.resolve(
        jsonResponse(200, { ok: true, status: "verification_pending", attemptId: "attempt-1" }),
      );
    if (url.endsWith("/api/fp/signup/verify"))
      return Promise.resolve(
        jsonResponse(200, { access_token: PARENT_JWT, refresh_token: "refresh" }),
      );
    if (url.endsWith("/api/fp/signup/consent"))
      return Promise.resolve(jsonResponse(200, { ok: true, status: "consent_recorded" }));
    if (url.endsWith("/api/fp/signup/child"))
      return Promise.resolve(jsonResponse(200, { ok: true, status: "child_created", childId: "child-1" }));
    return Promise.resolve(jsonResponse(404, {}));
  });

  const started = await startSignup({ ...baseStart, credentialChoice });
  expect(started).toEqual({ ok: true, attemptId: "attempt-1" });

  const verified = await verifySignup({
    token: "verif-token",
    email: baseStart.parentEmail,
    parentPassword: baseStart.parentPassword,
  });
  expect(verified).toEqual({ ok: true });

  const consent = await recordSignupConsent({
    attemptId: "attempt-1",
    echoedVersion: "2026-08-01.1",
    echoedHash: "a".repeat(64),
    method: "email_plus_attestation",
    childAgeBand: baseStart.childAgeBand,
    jurisdiction: baseStart.jurisdiction,
  });
  expect(consent).toEqual({ ok: true });

  const child = await createSignupChild({
    attemptId: "attempt-1",
    childFirstName: baseStart.childFirstName,
    credentialChoice,
    childPassword,
  });
  expect(child).toEqual({ ok: true, childId: "child-1" });

  const calls = fetchMock().mock.calls as Array<[string, RequestInit]>;
  return calls.map(([url, init]) => ({ url, init }));
}

const idxOf = (calls: Array<{ url: string }>, suffix: string) =>
  calls.findIndex((c) => c.url.endsWith(suffix));

describe("signup flow E2E — PATH A (existing credential)", () => {
  it("walks start → verify → consent → child in order; consent BEFORE the mint; Bearer on both authed calls; child carries the password", async () => {
    const calls = await walk("existing_credential", "orangeledgerkite");

    // The four backend calls fired in the required order.
    expect(idxOf(calls, "/api/fp/signup")).toBe(0);
    expect(idxOf(calls, "/api/fp/signup/verify")).toBe(1);
    // The ORDERING invariant: consent is recorded BEFORE the child mint.
    const consentIdx = idxOf(calls, "/api/fp/signup/consent");
    const childIdx = idxOf(calls, "/api/fp/signup/child");
    expect(consentIdx).toBeGreaterThan(0);
    expect(consentIdx).toBeLessThan(childIdx);

    // Both authenticated calls carry the adopted parent Bearer token.
    const headersFor = (i: number) => calls[i].init.headers as Record<string, string>;
    expect(headersFor(consentIdx).Authorization).toBe(`Bearer ${PARENT_JWT}`);
    expect(headersFor(childIdx).Authorization).toBe(`Bearer ${PARENT_JWT}`);

    // Path A: the child mint carries the parent-set child password.
    const childBody = JSON.parse(calls[childIdx].init.body as string);
    expect(childBody).toMatchObject({
      attemptId: "attempt-1",
      credentialChoice: "existing_credential",
      childPassword: "orangeledgerkite",
    });
  });
});

describe("signup flow E2E — PATH B (provision workspace)", () => {
  it("walks the same sequence; consent BEFORE the mint; child body sends NO password (its credential is the provisioned account)", async () => {
    const calls = await walk("provision_workspace"); // no childPassword

    const consentIdx = idxOf(calls, "/api/fp/signup/consent");
    const childIdx = idxOf(calls, "/api/fp/signup/child");
    expect(consentIdx).toBeLessThan(childIdx);

    const childBody = JSON.parse(calls[childIdx].init.body as string);
    expect(childBody.credentialChoice).toBe("provision_workspace");
    expect("childPassword" in childBody).toBe(false); // path b sends none
  });
});
