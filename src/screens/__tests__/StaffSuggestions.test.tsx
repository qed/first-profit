// @vitest-environment jsdom
/**
 * Change #9 — the staff suggestion list at /admin.
 *
 * Pins: the boot-URL router (App renders the admin screen at /admin, outside
 * the game shell — no GlobalNav); the minimal staff sign-in form; the
 * successful staff fetch rendering rows (taskId + username + body + kind badge
 * + date); the byte-identical 401 refusal (staff-only copy + the session is
 * revoked so a child credential never lingers); 390px wrap classes; and the
 * noindex robots meta while mounted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// App pulls the whole auth surface through GameProvider/StageRouter; stub the
// seams so the /admin routing test can mount the REAL App logged out.
vi.mock("../../lib/auth", () => ({
  loginChild: vi.fn(),
  logout: vi.fn().mockResolvedValue("explicit"),
  getCurrentUserId: vi.fn().mockResolvedValue(null),
  submitBirthYear: vi.fn(),
  fetchSiteStatus: vi.fn().mockResolvedValue({ ok: false }),
  claimHandle: vi.fn().mockResolvedValue({ ok: false, reason: "outage" }),
  publishSite: vi.fn().mockResolvedValue({ ok: false, reason: "outage" }),
  fetchConsentPolicy: vi.fn().mockResolvedValue(null),
  recordSignupConsent: vi.fn(),
  startSignup: vi.fn(),
  verifySignup: vi.fn(),
  createSignupChild: vi.fn(),
}));

vi.mock("../../config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../config")>();
  return {
    ...actual,
    getConfig: () => ({
      supabaseUrl: "https://supabase.test",
      supabaseAnonKey: "anon-key",
      t120ApiUrl: "https://api.test",
    }),
  };
});

import { App } from "../../App";
import { AdminSuggestions, ADMIN_COPY } from "../AdminSuggestions";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

afterEach(cleanup);

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const ROWS = [
  {
    id: "s-2",
    kind: "app",
    taskId: "2.3.1",
    username: "cedric7",
    body: "Add a robot helper to the floor",
    createdAt: "2026-08-03T14:00:00.000Z",
  },
  {
    id: "s-1",
    kind: "task",
    taskId: "1.1.4",
    username: "mira.k",
    body: "I need a price calculator",
    createdAt: "2026-08-02T10:30:00.000Z",
  },
];

async function signIn() {
  fireEvent.change(screen.getByLabelText(ADMIN_COPY.email), {
    target: { value: "staff@firstprofit.school" },
  });
  fireEvent.change(screen.getByLabelText(ADMIN_COPY.password), {
    target: { value: "hunter22hunter22" },
  });
  await act(async () => {
    fireEvent.click(screen.getByText(ADMIN_COPY.signIn));
  });
}

describe("App — /admin is a reserved boot-URL route (the verify precedent)", () => {
  it("renders the admin screen OUTSIDE the game shell at /admin (no GlobalNav, no landing)", async () => {
    window.history.replaceState(null, "", "/admin");
    render(<App />);
    // The staff sign-in renders even though the visitor is logged out.
    expect(await screen.findByText(ADMIN_COPY.signInTitle)).toBeTruthy();
    // Outside the game shell: no GlobalNav chrome, no stage content.
    expect(document.querySelector("nav")).toBeNull();
  });

  it("a normal boot URL does NOT hijack into the admin screen", async () => {
    render(<App />);
    await waitFor(() => expect(screen.queryByText(ADMIN_COPY.signInTitle)).toBeNull());
  });
});

describe("AdminSuggestions — sign-in, staff fetch, refusal", () => {
  it("renders the minimal email+password form with a >=44px submit, and stamps the noindex meta while mounted", () => {
    const { unmount } = render(<AdminSuggestions />);
    expect(screen.getByLabelText(ADMIN_COPY.email)).toBeTruthy();
    expect(screen.getByLabelText(ADMIN_COPY.password)).toBeTruthy();
    const submit = screen.getByText(ADMIN_COPY.signIn).closest("button")!;
    expect(submit.className).toContain("min-h-[44px]");
    const meta = document.head.querySelector('meta[name="robots"]');
    expect(meta?.getAttribute("content")).toBe("noindex");
    unmount();
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  it("staff path: signs in, GETs /api/fp/suggestions with the Bearer token, renders taskId + username + body + kind badge", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "staff-tok" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, suggestions: ROWS }));
    render(<AdminSuggestions />);
    await signIn();

    // The auth call went to the shared Supabase project's password grant.
    const [authUrl] = fetchMock.mock.calls[0];
    expect(authUrl).toBe("https://supabase.test/auth/v1/token?grant_type=password");
    // The list call carried the staff Bearer token.
    const [listUrl, listInit] = fetchMock.mock.calls[1] as [string, { headers: Record<string, string> }];
    expect(listUrl).toBe("https://api.test/api/fp/suggestions");
    expect(listInit.headers.Authorization).toBe("Bearer staff-tok");

    expect(await screen.findByText("Add a robot helper to the floor")).toBeTruthy();
    expect(screen.getByText("I need a price calculator")).toBeTruthy();
    expect(screen.getByText("task 2.3.1")).toBeTruthy();
    expect(screen.getByText("task 1.1.4")).toBeTruthy();
    expect(screen.getByText("cedric7")).toBeTruthy();
    expect(screen.getByText("mira.k")).toBeTruthy();
    // Kind badges, one per lane.
    expect(screen.getByText("app")).toBeTruthy();
    expect(screen.getByText("task")).toBeTruthy();
    // A sign-out link exists.
    expect(screen.getByText(ADMIN_COPY.signOut)).toBeTruthy();
  });

  it("390px safety: suggestion bodies wrap (break-words) and the meta row wraps (flex-wrap)", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "staff-tok" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, suggestions: ROWS }));
    render(<AdminSuggestions />);
    await signIn();
    const body = await screen.findByText("Add a robot helper to the floor");
    expect(body.className).toContain("break-words");
    const metaRow = screen.getByText("task 2.3.1").parentElement!;
    expect(metaRow.className).toContain("flex-wrap");
  });

  it("byte-identical 401 (any non-staff, incl. a child token): staff-only refusal AND the session is revoked + dropped", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "child-tok" }))
      .mockResolvedValueOnce(jsonResponse(401, { ok: false }))
      .mockResolvedValueOnce(jsonResponse(204, {})); // the logout revoke
    render(<AdminSuggestions />);
    await signIn();

    expect(await screen.findByText(ADMIN_COPY.refusal)).toBeTruthy();
    // The token was revoked server-side (best-effort) — never lingers here.
    const logoutCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/auth/v1/logout"),
    ) as [string, { headers: Record<string, string> }];
    expect(logoutCall).toBeTruthy();
    expect(logoutCall[1].headers.Authorization).toBe("Bearer child-tok");
    // No list is rendered.
    expect(screen.queryByText("cedric7")).toBeNull();
  });

  it("a failed sign-in shows the form error and never calls the suggestions API", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: "invalid_grant" }));
    render(<AdminSuggestions />);
    await signIn();
    expect(await screen.findByText(ADMIN_COPY.signInFailed)).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/api/fp/suggestions")),
    ).toBe(false);
  });
});
