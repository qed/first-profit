// @vitest-environment jsdom
/**
 * Change #9 — the staff suggestion list at /staff.
 *
 * Pins: the boot-URL router (App renders the staff screen at /staff, outside
 * the game shell — no GlobalNav); the minimal staff sign-in form; the
 * successful staff fetch rendering rows (taskId + username + body + kind badge
 * + date); the byte-identical 401 refusal (staff-only copy + the session is
 * revoked so a child credential never lingers); 390px wrap classes; and the
 * noindex robots meta while mounted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// App pulls the whole auth surface through GameProvider/StageRouter; stub the
// seams so the /staff routing test can mount the REAL App logged out.
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
import { StaffSuggestions, STAFF_COPY, STAFF_SESSION_KEY } from "../StaffSuggestions";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  window.localStorage.clear();
  window.sessionStorage.clear();
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
  fireEvent.change(screen.getByLabelText(STAFF_COPY.email), {
    target: { value: "staff@firstprofit.school" },
  });
  fireEvent.change(screen.getByLabelText(STAFF_COPY.password), {
    target: { value: "hunter22hunter22" },
  });
  await act(async () => {
    fireEvent.click(screen.getByText(STAFF_COPY.signIn));
  });
}

describe("App — /staff is a reserved boot-URL route (the verify precedent)", () => {
  it("renders the staff screen OUTSIDE the game shell at /staff (no GlobalNav, no landing)", async () => {
    window.history.replaceState(null, "", "/staff");
    render(<App />);
    // The staff sign-in renders even though the visitor is logged out.
    expect(await screen.findByText(STAFF_COPY.signInTitle)).toBeTruthy();
    // Outside the game shell: no GlobalNav chrome, no stage content.
    expect(document.querySelector("nav")).toBeNull();
  });

  it("a normal boot URL does NOT hijack into the staff screen", async () => {
    render(<App />);
    await waitFor(() => expect(screen.queryByText(STAFF_COPY.signInTitle)).toBeNull());
  });

  it("the retired /admin bookmark still lands on the staff screen AND rewrites the address bar to /staff", async () => {
    window.history.replaceState(null, "", "/admin");
    render(<App />);
    expect(await screen.findByText(STAFF_COPY.signInTitle)).toBeTruthy();
    // replaceState, not push: /admin must not sit in the back-stack.
    await waitFor(() => expect(window.location.pathname).toBe("/staff"));
  });
});

describe("StaffSuggestions — sign-in, staff fetch, refusal", () => {
  it("renders the minimal email+password form with a >=44px submit, and stamps the noindex meta while mounted", () => {
    const { unmount } = render(<StaffSuggestions />);
    expect(screen.getByLabelText(STAFF_COPY.email)).toBeTruthy();
    expect(screen.getByLabelText(STAFF_COPY.password)).toBeTruthy();
    const submit = screen.getByText(STAFF_COPY.signIn).closest("button")!;
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
    render(<StaffSuggestions />);
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
    expect(screen.getByText(STAFF_COPY.signOut)).toBeTruthy();
  });

  it("390px safety: suggestion bodies wrap (break-words) and the meta row wraps (flex-wrap)", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "staff-tok" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, suggestions: ROWS }));
    render(<StaffSuggestions />);
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
    render(<StaffSuggestions />);
    await signIn();

    expect(await screen.findByText(STAFF_COPY.refusal)).toBeTruthy();
    // The token was revoked server-side (best-effort) — never lingers here.
    const logoutCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/auth/v1/logout"),
    ) as [string, { headers: Record<string, string> }];
    expect(logoutCall).toBeTruthy();
    expect(logoutCall[1].headers.Authorization).toBe("Bearer child-tok");
    // No list is rendered.
    expect(screen.queryByText("cedric7")).toBeNull();
  });

  it("the page title is 'First Profit Staff Page' — the SAME h1 signed out and signed in, with suggestions below it", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "staff-tok" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, suggestions: ROWS }));
    render(<StaffSuggestions />);

    // Signed out.
    const signedOutTitle = screen.getByRole("heading", { level: 1 });
    expect(signedOutTitle.textContent).toBe("First Profit Staff Page");
    expect(document.title).toBe("First Profit Staff Page");

    await signIn();
    await screen.findByText("Add a robot helper to the floor");

    // Signed in: same h1, unchanged.
    const signedInTitle = screen.getByRole("heading", { level: 1 });
    expect(signedInTitle.textContent).toBe("First Profit Staff Page");

    // The suggestions sit BELOW that title in document order.
    const suggestionsHeading = screen.getByRole("heading", { level: 2 });
    expect(suggestionsHeading.textContent).toContain(STAFF_COPY.suggestionsTitle);
    expect(
      signedInTitle.compareDocumentPosition(suggestionsHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const firstRow = screen.getByText("Add a robot helper to the floor");
    expect(
      suggestionsHeading.compareDocumentPosition(firstRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("the password field has a show/hide eye toggle (same affordance as the child login)", () => {
    render(<StaffSuggestions />);
    const field = screen.getByLabelText(STAFF_COPY.password) as HTMLInputElement;
    expect(field.type).toBe("password");

    const toggle = screen.getByLabelText(STAFF_COPY.showPassword);
    expect(toggle.className).toContain("min-h-[44px]");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(toggle);
    expect((screen.getByLabelText(STAFF_COPY.password) as HTMLInputElement).type).toBe("text");
    const pressed = screen.getByLabelText(STAFF_COPY.hidePassword);
    expect(pressed.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(pressed);
    expect((screen.getByLabelText(STAFF_COPY.password) as HTMLInputElement).type).toBe("password");
  });

  it("a failed sign-in shows the form error and never calls the suggestions API", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: "invalid_grant" }));
    render(<StaffSuggestions />);
    await signIn();
    expect(await screen.findByText(STAFF_COPY.signInFailed)).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/api/fp/suggestions")),
    ).toBe(false);
  });
});

describe("StaffSuggestions — the staff session survives a refresh", () => {
  it("sign-in persists the session to sessionStorage under this page's OWN key (never localStorage)", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: "staff-tok", refresh_token: "staff-ref" }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, suggestions: ROWS }));
    render(<StaffSuggestions />);
    await signIn();
    await screen.findByText("Add a robot helper to the floor");

    expect(JSON.parse(window.sessionStorage.getItem(STAFF_SESSION_KEY)!)).toEqual({
      accessToken: "staff-tok",
      refreshToken: "staff-ref",
    });
    // The game client owns localStorage; this page never writes there.
    expect(window.localStorage.length).toBe(0);
  });

  it("a refresh with a live session goes straight to the list — no sign-in form, not even a flash", async () => {
    window.sessionStorage.setItem(
      STAFF_SESSION_KEY,
      JSON.stringify({ accessToken: "staff-tok", refreshToken: "staff-ref" }),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true, suggestions: ROWS }));

    render(<StaffSuggestions />);
    // The sign-in form is never rendered, not even on the first paint.
    expect(screen.queryByText(STAFF_COPY.signInTitle)).toBeNull();
    expect(await screen.findByText("Add a robot helper to the floor")).toBeTruthy();

    const [listUrl, listInit] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(listUrl).toBe("https://api.test/api/fp/suggestions");
    expect(listInit.headers.Authorization).toBe("Bearer staff-tok");
    // No password grant was needed.
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("grant_type=password")),
    ).toBe(false);
  });

  it("an aged-out restored token is renewed once with the refresh grant, then the list loads", async () => {
    window.sessionStorage.setItem(
      STAFF_SESSION_KEY,
      JSON.stringify({ accessToken: "stale-tok", refreshToken: "staff-ref" }),
    );
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { ok: false })) // stale token
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: "fresh-tok", refresh_token: "next-ref" }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, suggestions: ROWS }));

    render(<StaffSuggestions />);
    expect(await screen.findByText("Add a robot helper to the floor")).toBeTruthy();

    const [refreshUrl, refreshInit] = fetchMock.mock.calls[1] as [string, { body: string }];
    expect(refreshUrl).toBe("https://supabase.test/auth/v1/token?grant_type=refresh_token");
    expect(JSON.parse(refreshInit.body)).toEqual({ refresh_token: "staff-ref" });
    // The retry used the renewed token, and the renewed session was persisted.
    const [, retryInit] = fetchMock.mock.calls[2] as [string, { headers: Record<string, string> }];
    expect(retryInit.headers.Authorization).toBe("Bearer fresh-tok");
    expect(JSON.parse(window.sessionStorage.getItem(STAFF_SESSION_KEY)!)).toEqual({
      accessToken: "fresh-tok",
      refreshToken: "next-ref",
    });
  });

  it("an unrenewable restored session shows the SIGN-IN form, not the staff-only refusal (expired is not refused)", async () => {
    window.sessionStorage.setItem(
      STAFF_SESSION_KEY,
      JSON.stringify({ accessToken: "stale-tok", refreshToken: "dead-ref" }),
    );
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { ok: false }))
      .mockResolvedValueOnce(jsonResponse(400, { error: "invalid_grant" }));

    render(<StaffSuggestions />);
    expect(await screen.findByText(STAFF_COPY.signInTitle)).toBeTruthy();
    expect(screen.queryByText(STAFF_COPY.refusal)).toBeNull();
    // The dead session is gone from storage.
    expect(window.sessionStorage.getItem(STAFF_SESSION_KEY)).toBeNull();
  });

  it("a renewed token that STILL 401s is the real refusal — staff-only copy, revoked, storage cleared", async () => {
    window.sessionStorage.setItem(
      STAFF_SESSION_KEY,
      JSON.stringify({ accessToken: "child-tok", refreshToken: "child-ref" }),
    );
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { ok: false }))
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: "fresh-child-tok", refresh_token: "next-ref" }),
      )
      .mockResolvedValueOnce(jsonResponse(401, { ok: false }))
      .mockResolvedValueOnce(jsonResponse(204, {})); // the logout revoke

    render(<StaffSuggestions />);
    expect(await screen.findByText(STAFF_COPY.refusal)).toBeTruthy();

    const logoutCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/auth/v1/logout"),
    ) as [string, { headers: Record<string, string> }];
    expect(logoutCall[1].headers.Authorization).toBe("Bearer fresh-child-tok");
    expect(window.sessionStorage.getItem(STAFF_SESSION_KEY)).toBeNull();
  });

  it("sign-out clears the persisted session, so the next refresh asks for the password again", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: "staff-tok", refresh_token: "staff-ref" }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, suggestions: ROWS }))
      .mockResolvedValueOnce(jsonResponse(204, {})); // the logout revoke
    render(<StaffSuggestions />);
    await signIn();
    await screen.findByText("Add a robot helper to the floor");

    await act(async () => {
      fireEvent.click(screen.getByText(STAFF_COPY.signOut));
    });
    expect(window.sessionStorage.getItem(STAFF_SESSION_KEY)).toBeNull();
    expect(await screen.findByText(STAFF_COPY.signInTitle)).toBeTruthy();
  });

  it("a corrupt stored session is treated as signed-out, never a crash", () => {
    window.sessionStorage.setItem(STAFF_SESSION_KEY, "{not json");
    render(<StaffSuggestions />);
    expect(screen.getByText(STAFF_COPY.signInTitle)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
