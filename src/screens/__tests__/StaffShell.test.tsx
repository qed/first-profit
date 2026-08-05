// @vitest-environment jsdom
/**
 * Unit 3 — /staff as a two-tab shell (Suggestions | Watchtower).
 *
 * Pins what the SHELL owns and the tabs do not: one session across both tabs,
 * a single-flight refresh, per-tab cached data that survives a tab switch but
 * never a sign-out or a refusal, what an unrenewable 401 means as the session
 * proves itself, the noindex/title stamp, and the tab controls (44px,
 * aria-pressed, no <nav>, focus moved into a named panel).
 *
 * Race windows — sign-out or a tab switch DURING an in-flight request, and two
 * concurrent requests on one aged token — live in StaffShellRaces.test.tsx,
 * which stubs the Watchtower tab to drive `request` directly.
 *
 * The suggestions list's OWN behaviour stays pinned in StaffSuggestions.test.tsx.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

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

import { StaffShell } from "../staff/StaffShell";
import { STAFF_COPY } from "../staff/staffCopy";
import { STAFF_SESSION_KEY } from "../staff/staffSession";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/staff");
});

afterEach(cleanup);

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const ROWS = [
  {
    id: "s-1",
    kind: "task",
    taskId: "1.1.4",
    username: "mira.k",
    body: "I need a price calculator",
    createdAt: "2026-08-02T10:30:00.000Z",
  },
];

const LATER_ROWS = [
  {
    id: "s-9",
    kind: "app",
    taskId: "2.3.1",
    username: "cedric7",
    body: "A robot helper for the floor",
    createdAt: "2026-08-04T09:00:00.000Z",
  },
];

interface Routes {
  password?: () => Response | Promise<Response>;
  refresh?: () => Response | Promise<Response>;
  suggestions?: () => Response | Promise<Response>;
}

/** Route the fetch mock by URL — the shell interleaves auth and API calls, and
 *  positional mocking would break the moment an ordering changes. */
function mockRoutes(routes: Routes) {
  fetchMock.mockImplementation(async (url: unknown) => {
    const u = String(url);
    if (u.includes("grant_type=password")) return routes.password!();
    if (u.includes("grant_type=refresh_token")) return routes.refresh!();
    if (u.includes("/auth/v1/logout")) return jsonResponse(204, {});
    if (u.includes("/api/fp/suggestions")) return routes.suggestions!();
    throw new Error(`unexpected fetch: ${u}`);
  });
}

function callsTo(needle: string): number {
  return fetchMock.mock.calls.filter(([u]) => String(u).includes(needle)).length;
}

function tab(label: string): HTMLElement {
  return screen.getByRole("button", { name: label });
}

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

async function click(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el);
  });
}

describe("StaffShell — one session, two tabs", () => {
  it("signs in once and switching tabs keeps the suggestions data (no refetch, no second sign-in)", async () => {
    mockRoutes({
      password: () => jsonResponse(200, { access_token: "staff-tok", refresh_token: "staff-ref" }),
      suggestions: () => jsonResponse(200, { ok: true, suggestions: ROWS }),
    });
    render(<StaffShell />);
    await signIn();
    expect(await screen.findByText("I need a price calculator")).toBeTruthy();

    await click(tab(STAFF_COPY.watchtowerTitle));
    expect(screen.getByText(STAFF_COPY.watchtowerPending)).toBeTruthy();
    expect(screen.queryByText("I need a price calculator")).toBeNull();

    await click(tab(STAFF_COPY.suggestionsTitle));
    // Same rows, served from the shell's cache: ONE suggestions GET, ONE grant.
    expect(screen.getByText("I need a price calculator")).toBeTruthy();
    expect(callsTo("/api/fp/suggestions")).toBe(1);
    expect(callsTo("grant_type=password")).toBe(1);
  });

  it("an aged token fires EXACTLY ONE refresh grant, and both tabs work afterwards", async () => {
    window.sessionStorage.setItem(
      STAFF_SESSION_KEY,
      JSON.stringify({ accessToken: "stale-tok", refreshToken: "staff-ref" }),
    );
    let listCalls = 0;
    mockRoutes({
      refresh: () => jsonResponse(200, { access_token: "fresh-tok", refresh_token: "next-ref" }),
      suggestions: () => {
        listCalls += 1;
        return listCalls === 1
          ? jsonResponse(401, { ok: false })
          : jsonResponse(200, { ok: true, suggestions: ROWS });
      },
    });

    render(<StaffShell />);
    expect(await screen.findByText("I need a price calculator")).toBeTruthy();

    await click(tab(STAFF_COPY.watchtowerTitle));
    expect(screen.getByText(STAFF_COPY.watchtowerPending)).toBeTruthy();
    await click(tab(STAFF_COPY.suggestionsTitle));
    expect(screen.getByText("I need a price calculator")).toBeTruthy();

    expect(callsTo("grant_type=refresh_token")).toBe(1);
    expect(JSON.parse(window.sessionStorage.getItem(STAFF_SESSION_KEY)!)).toEqual({
      accessToken: "fresh-tok",
      refreshToken: "next-ref",
    });
  });

  it("sign-out from the WATCHTOWER tab clears the session AND the Suggestions cache (best-effort revoke)", async () => {
    let listCalls = 0;
    mockRoutes({
      password: () => jsonResponse(200, { access_token: "staff-tok", refresh_token: "staff-ref" }),
      suggestions: () => {
        listCalls += 1;
        return jsonResponse(200, {
          ok: true,
          suggestions: listCalls === 1 ? ROWS : LATER_ROWS,
        });
      },
    });
    render(<StaffShell />);
    await signIn();
    await screen.findByText("I need a price calculator");

    await click(tab(STAFF_COPY.watchtowerTitle));
    await click(screen.getByText(STAFF_COPY.signOut));

    expect(window.sessionStorage.getItem(STAFF_SESSION_KEY)).toBeNull();
    expect(await screen.findByText(STAFF_COPY.signInTitle)).toBeTruthy();
    const logoutCall = fetchMock.mock.calls.find(([u]) =>
      String(u).includes("/auth/v1/logout"),
    ) as [string, { headers: Record<string, string> }];
    expect(logoutCall[1].headers.Authorization).toBe("Bearer staff-tok");

    // Signing back in refetches: the previous sitting's rows were dropped with
    // the session, so nothing stale can be served to whoever signs in next.
    await signIn();
    expect(await screen.findByText("A robot helper for the floor")).toBeTruthy();
    expect(screen.queryByText("I need a price calculator")).toBeNull();
    expect(callsTo("/api/fp/suggestions")).toBe(2);
  });

  it("a refusal clears sessionStorage and every tab's data; signing in again refetches", async () => {
    let listCalls = 0;
    let grants = 0;
    mockRoutes({
      password: () => {
        grants += 1;
        // A child credential first (no refresh token: nothing to renew with),
        // then a real staff one.
        return grants === 1
          ? jsonResponse(200, { access_token: "child-tok" })
          : jsonResponse(200, { access_token: "staff-tok", refresh_token: "staff-ref" });
      },
      suggestions: () => {
        listCalls += 1;
        return listCalls === 1
          ? jsonResponse(401, { ok: false })
          : jsonResponse(200, { ok: true, suggestions: LATER_ROWS });
      },
    });
    render(<StaffShell />);
    await signIn();

    expect(await screen.findByText(STAFF_COPY.refusal)).toBeTruthy();
    expect(window.sessionStorage.getItem(STAFF_SESSION_KEY)).toBeNull();
    expect(screen.queryByRole("button", { name: STAFF_COPY.watchtowerTitle })).toBeNull();

    await click(screen.getByText(STAFF_COPY.signIn));
    await signIn();
    expect(await screen.findByText("A robot helper for the floor")).toBeTruthy();
    expect(callsTo("/api/fp/suggestions")).toBe(2);
  });

  it("stamps the noindex meta and the title ONCE, and restores the title on unmount", () => {
    document.title = "First Profit";
    const { unmount } = render(<StaffShell />);
    expect(document.head.querySelectorAll('meta[name="robots"]').length).toBe(1);
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
      "noindex",
    );
    expect(document.title).toBe(STAFF_COPY.title);
    unmount();
    expect(document.head.querySelectorAll('meta[name="robots"]').length).toBe(0);
    expect(document.title).toBe("First Profit");
  });
});

describe("StaffShell — what an unrenewable 401 means", () => {
  it("a FRESH non-staff sign-in after an expired restored session is still the refusal, and is revoked", async () => {
    // The restored session expires first: that is the sign-in form, no revoke.
    window.sessionStorage.setItem(
      STAFF_SESSION_KEY,
      JSON.stringify({ accessToken: "stale-tok", refreshToken: "dead-ref" }),
    );
    let listCalls = 0;
    mockRoutes({
      password: () => jsonResponse(200, { access_token: "child-tok" }),
      refresh: () => jsonResponse(400, { error: "invalid_grant" }),
      suggestions: () => {
        listCalls += 1;
        return jsonResponse(401, { ok: false });
      },
    });
    render(<StaffShell />);
    expect(await screen.findByText(STAFF_COPY.signInTitle)).toBeTruthy();
    expect(screen.queryByText(STAFF_COPY.refusal)).toBeNull();
    expect(callsTo("/auth/v1/logout")).toBe(0);

    // Now a CHILD signs in on that same page view. It is a fresh credential,
    // never accepted by the API, so it must get the refusal AND be revoked —
    // not a silent blank form with a live child token still on the device.
    await signIn();
    expect(await screen.findByText(STAFF_COPY.refusal)).toBeTruthy();
    const logoutCall = fetchMock.mock.calls.find(([u]) =>
      String(u).includes("/auth/v1/logout"),
    ) as [string, { headers: Record<string, string> }];
    expect(logoutCall[1].headers.Authorization).toBe("Bearer child-tok");
    expect(window.sessionStorage.getItem(STAFF_SESSION_KEY)).toBeNull();
    expect(listCalls).toBe(2);
  });

  // The `proven` case — a session the API HAS accepted, later unable to renew —
  // needs a second request after a successful one, which only a fetching tab
  // can produce. It lives in StaffShellRaces.test.tsx with the stub tab.

  it("a refresh it cannot REACH is retryable, not a refusal — the session survives", async () => {
    window.sessionStorage.setItem(
      STAFF_SESSION_KEY,
      JSON.stringify({ accessToken: "staff-tok", refreshToken: "staff-ref" }),
    );
    let listCalls = 0;
    let refreshCalls = 0;
    mockRoutes({
      refresh: () => {
        refreshCalls += 1;
        if (refreshCalls === 1) throw new Error("offline");
        return jsonResponse(200, { access_token: "fresh-tok", refresh_token: "next-ref" });
      },
      suggestions: () => {
        listCalls += 1;
        return listCalls >= 3
          ? jsonResponse(200, { ok: true, suggestions: ROWS })
          : jsonResponse(401, { ok: false });
      },
    });
    render(<StaffShell />);

    // A dead spot must never read as "you are not staff".
    expect(await screen.findByText(STAFF_COPY.suggestionsLoadFailed)).toBeTruthy();
    expect(screen.queryByText(STAFF_COPY.refusal)).toBeNull();
    expect(screen.queryByText(STAFF_COPY.signInTitle)).toBeNull();
    // The session is untouched — nothing dropped, nothing revoked.
    expect(JSON.parse(window.sessionStorage.getItem(STAFF_SESSION_KEY)!).accessToken).toBe(
      "staff-tok",
    );
    expect(callsTo("/auth/v1/logout")).toBe(0);

    // Back on the network, Retry works.
    await click(screen.getByText(STAFF_COPY.retry));
    expect(await screen.findByText("I need a price calculator")).toBeTruthy();
  });
});

describe("StaffShell — the sign-in form", () => {
  it("double-submit fires exactly ONE password grant", async () => {
    mockRoutes({
      password: () => jsonResponse(200, { access_token: "staff-tok", refresh_token: "staff-ref" }),
      suggestions: () => jsonResponse(200, { ok: true, suggestions: ROWS }),
    });
    render(<StaffShell />);
    fireEvent.change(screen.getByLabelText(STAFF_COPY.email), {
      target: { value: "staff@firstprofit.school" },
    });
    fireEvent.change(screen.getByLabelText(STAFF_COPY.password), {
      target: { value: "hunter22hunter22" },
    });
    const submit = screen.getByText(STAFF_COPY.signIn);
    await act(async () => {
      fireEvent.click(submit);
      fireEvent.click(submit);
    });
    await screen.findByText("I need a price calculator");
    expect(callsTo("grant_type=password")).toBe(1);
  });

  it("clears the password (and the reveal) on a FAILED sign-in, so it is never left legible", async () => {
    mockRoutes({ password: () => jsonResponse(400, { error: "invalid_grant" }) });
    render(<StaffShell />);
    fireEvent.change(screen.getByLabelText(STAFF_COPY.email), {
      target: { value: "staff@firstprofit.school" },
    });
    fireEvent.change(screen.getByLabelText(STAFF_COPY.password), {
      target: { value: "wrong-password" },
    });
    fireEvent.click(screen.getByLabelText(STAFF_COPY.showPassword));
    await act(async () => {
      fireEvent.click(screen.getByText(STAFF_COPY.signIn));
    });

    expect(await screen.findByText(STAFF_COPY.signInFailed)).toBeTruthy();
    const field = screen.getByLabelText(STAFF_COPY.password) as HTMLInputElement;
    expect(field.value).toBe("");
    expect(field.type).toBe("password");
  });

  it("refuses an empty password locally — no grant request at all", async () => {
    mockRoutes({});
    render(<StaffShell />);
    fireEvent.change(screen.getByLabelText(STAFF_COPY.email), {
      target: { value: "staff@firstprofit.school" },
    });
    await act(async () => {
      fireEvent.click(screen.getByText(STAFF_COPY.signIn));
    });
    expect(screen.getByText(STAFF_COPY.signInIncomplete)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("StaffShell — the Suggestions tab's own view-states", () => {
  it("after sign-in the panel paints LOADING, never a flash of the empty state", async () => {
    const gate = deferred<Response>();
    mockRoutes({
      password: () => jsonResponse(200, { access_token: "staff-tok", refresh_token: "staff-ref" }),
      suggestions: () => gate.promise,
    });
    render(<StaffShell />);
    await signIn();

    expect(screen.getByText(STAFF_COPY.suggestionsLoading)).toBeTruthy();
    expect(screen.queryByText(STAFF_COPY.suggestionsEmpty)).toBeNull();
    expect(screen.queryByText(STAFF_COPY.suggestionsLoadFailed)).toBeNull();

    await act(async () => {
      gate.resolve(jsonResponse(200, { ok: true, suggestions: [] }));
    });
    expect(await screen.findByText(STAFF_COPY.suggestionsEmpty)).toBeTruthy();
    expect(screen.queryByText(STAFF_COPY.suggestionsLoading)).toBeNull();
  });

  it("a 500 shows the load error (not the empty state); Retry refetches; a later tab switch does not", async () => {
    let listCalls = 0;
    mockRoutes({
      password: () => jsonResponse(200, { access_token: "staff-tok", refresh_token: "staff-ref" }),
      suggestions: () => {
        listCalls += 1;
        return listCalls === 1
          ? jsonResponse(500, { error: "boom" })
          : jsonResponse(200, { ok: true, suggestions: ROWS });
      },
    });
    render(<StaffShell />);
    await signIn();

    expect(await screen.findByText(STAFF_COPY.suggestionsLoadFailed)).toBeTruthy();
    expect(screen.queryByText(STAFF_COPY.suggestionsEmpty)).toBeNull();
    // Same severity as the sign-in error, so it announces the same way.
    expect(screen.getByText(STAFF_COPY.suggestionsLoadFailed).getAttribute("role")).toBe("alert");

    await click(screen.getByText(STAFF_COPY.retry));
    expect(await screen.findByText("I need a price calculator")).toBeTruthy();
    expect(listCalls).toBe(2);

    await click(tab(STAFF_COPY.watchtowerTitle));
    await click(tab(STAFF_COPY.suggestionsTitle));
    expect(screen.getByText("I need a price calculator")).toBeTruthy();
    expect(listCalls).toBe(2);
  });
});

describe("StaffShell — the tab controls", () => {
  async function signedIn() {
    mockRoutes({
      password: () => jsonResponse(200, { access_token: "staff-tok", refresh_token: "staff-ref" }),
      suggestions: () => jsonResponse(200, { ok: true, suggestions: ROWS }),
    });
    render(<StaffShell />);
    await signIn();
    await screen.findByText("I need a price calculator");
  }

  it("are keyboard-reachable buttons with aria-pressed on the ACTIVE tab only, and 44px targets", async () => {
    await signedIn();
    const suggestions = tab(STAFF_COPY.suggestionsTitle);
    const watchtower = tab(STAFF_COPY.watchtowerTitle);

    for (const el of [suggestions, watchtower]) {
      expect(el.tagName).toBe("BUTTON");
      expect(el.getAttribute("type")).toBe("button");
      // Native buttons are in the tab order; nothing removes them from it.
      expect(el.getAttribute("tabindex")).toBeNull();
      expect(el.getAttribute("disabled")).toBeNull();
      expect(el.className).toContain("min-h-[44px]");
      expect(el.className).toContain("focus-visible:ring-2");
      // aria-current would claim these are pagination links to other URLs.
      expect(el.getAttribute("aria-current")).toBeNull();
    }
    expect(suggestions.getAttribute("aria-pressed")).toBe("true");
    expect(watchtower.getAttribute("aria-pressed")).toBe("false");

    await click(watchtower);
    expect(tab(STAFF_COPY.watchtowerTitle).getAttribute("aria-pressed")).toBe("true");
    expect(tab(STAFF_COPY.suggestionsTitle).getAttribute("aria-pressed")).toBe("false");
  });

  it("moves focus into the panel on a tab switch, and the panel is NAMED in every view-state", async () => {
    const gate = deferred<Response>();
    mockRoutes({
      password: () => jsonResponse(200, { access_token: "staff-tok", refresh_token: "staff-ref" }),
      suggestions: () => gate.promise,
    });
    render(<StaffShell />);
    await signIn();

    // Loading: the panel already has its heading, so it is a named region.
    const panel = screen.getByTestId("fp-staff-panel");
    const labelledBy = panel.getAttribute("aria-labelledby")!;
    expect(document.getElementById(labelledBy)!.textContent).toContain(STAFF_COPY.suggestionsTitle);
    expect(screen.getByText(STAFF_COPY.suggestionsLoading).getAttribute("role")).toBe("status");

    await click(tab(STAFF_COPY.watchtowerTitle));
    expect(document.activeElement).toBe(screen.getByTestId("fp-staff-panel"));
    expect(document.getElementById(labelledBy)!.textContent).toBe(STAFF_COPY.watchtowerTitle);

    await act(async () => {
      gate.resolve(jsonResponse(200, { ok: true, suggestions: ROWS }));
    });
    await click(tab(STAFF_COPY.suggestionsTitle));
    expect(document.activeElement).toBe(screen.getByTestId("fp-staff-panel"));
  });

  it("are NOT a <nav> — the staff page has no GlobalNav, signed in or out", async () => {
    await signedIn();
    expect(document.querySelector("nav")).toBeNull();
  });

  it("390px safety: the tab row wraps and the sign-out shares it", async () => {
    await signedIn();
    const row = screen.getByTestId("fp-staff-tabs");
    expect(row.className).toContain("flex-wrap");
    expect(row.parentElement!.className).toContain("flex-wrap");
    expect(screen.getByText(STAFF_COPY.signOut).className).toContain("min-h-[44px]");
  });

  it("keeps ONE h1 (the shell title) with the tab's own h2 beneath it", async () => {
    await signedIn();
    expect(screen.getAllByRole("heading", { level: 1 }).length).toBe(1);
    await click(tab(STAFF_COPY.watchtowerTitle));
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe(STAFF_COPY.title);
    const h2 = screen.getByRole("heading", { level: 2 });
    expect(h2.textContent).toBe(STAFF_COPY.watchtowerTitle);
    expect(h1.compareDocumentPosition(h2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
