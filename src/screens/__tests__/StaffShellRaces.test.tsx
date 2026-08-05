// @vitest-environment jsdom
/**
 * Unit 3 — the staff shell's RACE windows.
 *
 * Every mutation in the shell that happens after an `await` can find the world
 * changed: the session signed out, refused, or replaced by a different sign-in.
 * These are the tests for THE EPOCH RULE (see StaffShell.tsx) plus the
 * single-flight refresh and the in-flight request sharing.
 *
 * Technique: the Watchtower tab is STUBBED with a probe tab that calls the
 * shell's `request` directly. Until Unit 5 the real Watchtower fetches nothing,
 * so this is the only way to produce a second (or concurrent) reader — and the
 * shell's guarantees are about exactly that situation.
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

/** What the stub tab should do when it mounts. Set per test. */
const probe: { paths: string[]; results: string[] } = { paths: [], results: [] };

vi.mock("../staff/StaffWatchtower", async () => {
  const react = await import("react");
  return {
    StaffWatchtower: ({ request }: { request: (p: string) => Promise<{ kind: string }> }) => {
      const started = react.useRef(false);
      react.useEffect(() => {
        if (started.current) return;
        started.current = true;
        for (const path of probe.paths) {
          void request(path).then((res) => probe.results.push(`${path}:${res.kind}`));
        }
      }, [request]);
      return react.createElement("h2", { id: "fp-staff-panel-title" }, "Probe");
    },
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
  probe.paths = [];
  probe.results = [];
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

function callsTo(needle: string): number {
  return fetchMock.mock.calls.filter(([u]) => String(u).includes(needle)).length;
}

function authHeader(call: unknown[]): string {
  return (call[1] as { headers: Record<string, string> }).headers.Authorization;
}

/** Every call the shell can make, routed by URL. */
interface Routes {
  password?: () => Response | Promise<Response>;
  refresh?: () => Response | Promise<Response>;
  suggestions?: () => Response | Promise<Response>;
  probe?: (path: string) => Response | Promise<Response>;
}

function mockRoutes(routes: Routes) {
  fetchMock.mockImplementation(async (url: unknown) => {
    const u = String(url);
    if (u.includes("grant_type=password")) return routes.password!();
    if (u.includes("grant_type=refresh_token")) return routes.refresh!();
    if (u.includes("/auth/v1/logout")) return jsonResponse(204, {});
    if (u.includes("/api/fp/suggestions")) return routes.suggestions!();
    if (u.includes("/api/fp/probe")) return routes.probe!(u);
    throw new Error(`unexpected fetch: ${u}`);
  });
}

async function click(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el);
  });
}

function tab(label: string): HTMLElement {
  return screen.getByRole("button", { name: label });
}

async function signInAs() {
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

/** A restored, already-working session; the suggestions tab loads cleanly. */
function seedRestoredSession(accessToken = "tok-1", refreshToken: string | null = "ref-1") {
  window.sessionStorage.setItem(
    STAFF_SESSION_KEY,
    JSON.stringify({ accessToken, refreshToken }),
  );
}

describe("StaffShell — concurrent reads share one refresh", () => {
  it("two CONCURRENT requests on one aged token fire EXACTLY ONE grant, and both succeed", async () => {
    seedRestoredSession();
    probe.paths = ["/api/fp/probe-a", "/api/fp/probe-b"];
    const gateA = deferred<Response>();
    const gateB = deferred<Response>();
    let probeCalls = 0;
    mockRoutes({
      suggestions: () => jsonResponse(200, { ok: true, suggestions: ROWS }),
      refresh: () => jsonResponse(200, { access_token: "tok-2", refresh_token: "ref-2" }),
      probe: (u) => {
        probeCalls += 1;
        if (probeCalls <= 2) return u.includes("probe-a") ? gateA.promise : gateB.promise;
        return jsonResponse(200, { ok: true });
      },
    });

    render(<StaffShell />);
    await screen.findByText("I need a price calculator");
    await click(tab(STAFF_COPY.watchtowerTitle));

    // BOTH first attempts 401 before either has renewed: the classic
    // concurrent-401 double-refresh window.
    await act(async () => {
      gateA.resolve(jsonResponse(401, { ok: false }));
      gateB.resolve(jsonResponse(401, { ok: false }));
      await Promise.resolve();
    });

    expect(callsTo("grant_type=refresh_token")).toBe(1);
    expect(probe.results.sort()).toEqual([
      "/api/fp/probe-a:json",
      "/api/fp/probe-b:json",
    ]);
    // Both retries used the ONE renewed token.
    const retries = fetchMock.mock.calls.filter(([u]) => String(u).includes("/api/fp/probe")).slice(2);
    expect(retries.map(authHeader)).toEqual(["Bearer tok-2", "Bearer tok-2"]);
  });

  it("a STAGGERED second 401 reuses the session the first caller already renewed", async () => {
    seedRestoredSession();
    probe.paths = ["/api/fp/probe-a", "/api/fp/probe-b"];
    const gateA = deferred<Response>();
    const gateB = deferred<Response>();
    let probeCalls = 0;
    mockRoutes({
      suggestions: () => jsonResponse(200, { ok: true, suggestions: ROWS }),
      refresh: () => jsonResponse(200, { access_token: "tok-2", refresh_token: "ref-2" }),
      probe: (u) => {
        probeCalls += 1;
        if (probeCalls <= 2) return u.includes("probe-a") ? gateA.promise : gateB.promise;
        return jsonResponse(200, { ok: true });
      },
    });

    render(<StaffShell />);
    await screen.findByText("I need a price calculator");
    await click(tab(STAFF_COPY.watchtowerTitle));

    // A finishes its whole renewal FIRST, so the single-flight slot is already
    // released by the time B's 401 lands. Only the "someone already renewed"
    // branch can stop B from spending the (now rotated) refresh token.
    await act(async () => {
      gateA.resolve(jsonResponse(401, { ok: false }));
      await gateA.promise;
      await Promise.resolve();
    });
    expect(callsTo("grant_type=refresh_token")).toBe(1);

    await act(async () => {
      gateB.resolve(jsonResponse(401, { ok: false }));
      await Promise.resolve();
    });

    expect(callsTo("grant_type=refresh_token")).toBe(1);
    expect(probe.results.sort()).toEqual([
      "/api/fp/probe-a:json",
      "/api/fp/probe-b:json",
    ]);
    expect(authHeader(fetchMock.mock.calls[fetchMock.mock.calls.length - 1])).toBe("Bearer tok-2");
  });
});

describe("StaffShell — sign-out during an in-flight request", () => {
  it("shows the SIGN-IN form, never the refusal, and leaves the session dead", async () => {
    seedRestoredSession();
    probe.paths = ["/api/fp/probe-a"];
    const gate = deferred<Response>();
    mockRoutes({
      suggestions: () => jsonResponse(200, { ok: true, suggestions: ROWS }),
      refresh: () => jsonResponse(200, { access_token: "tok-2", refresh_token: "ref-2" }),
      probe: () => gate.promise,
    });

    render(<StaffShell />);
    await screen.findByText("I need a price calculator");
    await click(tab(STAFF_COPY.watchtowerTitle));

    // Sign out while the GET is still in flight, then let it come back 401.
    await click(screen.getByText(STAFF_COPY.signOut));
    await act(async () => {
      gate.resolve(jsonResponse(401, { ok: false }));
      await Promise.resolve();
    });

    expect(screen.getByText(STAFF_COPY.signInTitle)).toBeTruthy();
    expect(screen.queryByText(STAFF_COPY.refusal)).toBeNull();
    expect(window.sessionStorage.getItem(STAFF_SESSION_KEY)).toBeNull();
  });

  it("signing out during the FIRST load after a fresh sign-in is NOT a refusal", async () => {
    // The nastiest version: the session has never been accepted by the API, so
    // an unrenewable 401 here WOULD legitimately be the refusal — except the
    // 401 belongs to a session the user already ended. A deliberate sign-out
    // must never be presented as "this page is for First Profit staff".
    probe.paths = [];
    const gate = deferred<Response>();
    mockRoutes({
      password: () => jsonResponse(200, { access_token: "tok-1", refresh_token: "ref-1" }),
      suggestions: () => gate.promise,
      refresh: () => jsonResponse(200, { access_token: "tok-2", refresh_token: "ref-2" }),
    });

    render(<StaffShell />);
    await signInAs();
    expect(screen.getByText(STAFF_COPY.suggestionsLoading)).toBeTruthy();

    await click(screen.getByText(STAFF_COPY.signOut));
    await act(async () => {
      gate.resolve(jsonResponse(401, { ok: false }));
      await Promise.resolve();
    });

    expect(screen.getByText(STAFF_COPY.signInTitle)).toBeTruthy();
    expect(screen.queryByText(STAFF_COPY.refusal)).toBeNull();
    expect(window.sessionStorage.getItem(STAFF_SESSION_KEY)).toBeNull();
    // Nothing was renewed on behalf of a session that no longer exists.
    expect(callsTo("grant_type=refresh_token")).toBe(0);
  });

  it("does not RESURRECT the session when the grant lands after the sign-out", async () => {
    seedRestoredSession();
    probe.paths = ["/api/fp/probe-a"];
    const grant = deferred<Response>();
    let probeCalls = 0;
    mockRoutes({
      suggestions: () => jsonResponse(200, { ok: true, suggestions: ROWS }),
      refresh: () => grant.promise,
      probe: () => {
        probeCalls += 1;
        return probeCalls === 1 ? jsonResponse(401, { ok: false }) : jsonResponse(200, { ok: true });
      },
    });

    render(<StaffShell />);
    await screen.findByText("I need a price calculator");
    // The probe 401s and the shell starts a refresh that never settles yet.
    await click(tab(STAFF_COPY.watchtowerTitle));
    await act(async () => {
      await Promise.resolve();
    });

    await click(screen.getByText(STAFF_COPY.signOut));
    await act(async () => {
      grant.resolve(jsonResponse(200, { access_token: "tok-2", refresh_token: "ref-2" }));
      await Promise.resolve();
    });

    // The session the user ended stays ended, and the token the grant minted
    // behind their back is revoked rather than left live server-side.
    expect(window.sessionStorage.getItem(STAFF_SESSION_KEY)).toBeNull();
    expect(screen.getByText(STAFF_COPY.signInTitle)).toBeTruthy();
    expect(screen.queryByText(STAFF_COPY.refusal)).toBeNull();
    const revoked = fetchMock.mock.calls
      .filter(([u]) => String(u).includes("/auth/v1/logout"))
      .map(authHeader);
    expect(revoked).toContain("Bearer tok-2");
    // The renewed token never got to make the follow-up read.
    expect(callsTo("/api/fp/probe")).toBe(1);
  });
});

describe("StaffShell — a tab switch during an in-flight load", () => {
  it("joins the in-flight request instead of firing a duplicate", async () => {
    seedRestoredSession();
    probe.paths = [];
    const gate = deferred<Response>();
    mockRoutes({ suggestions: () => gate.promise });

    render(<StaffShell />);
    expect(screen.getByText(STAFF_COPY.suggestionsLoading)).toBeTruthy();

    await click(tab(STAFF_COPY.watchtowerTitle));
    await click(tab(STAFF_COPY.suggestionsTitle));
    await act(async () => {
      gate.resolve(jsonResponse(200, { ok: true, suggestions: ROWS }));
    });

    expect(await screen.findByText("I need a price calculator")).toBeTruthy();
    expect(callsTo("/api/fp/suggestions")).toBe(1);
  });
});

describe("StaffShell — a refusal from any tab drops cached data", () => {
  it("drops ALREADY-CACHED suggestions rows, and the next sign-in refetches", async () => {
    seedRestoredSession();
    probe.paths = ["/api/fp/probe-a"];
    let listCalls = 0;
    let probeCalls = 0;
    mockRoutes({
      password: () => jsonResponse(200, { access_token: "tok-3", refresh_token: "ref-3" }),
      // A renewal that WORKS, so the second 401 is a genuine "not staff".
      refresh: () => jsonResponse(200, { access_token: "tok-2", refresh_token: "ref-2" }),
      suggestions: () => {
        listCalls += 1;
        return jsonResponse(200, { ok: true, suggestions: ROWS });
      },
      probe: () => {
        probeCalls += 1;
        return jsonResponse(401, { ok: false });
      },
    });

    render(<StaffShell />);
    await screen.findByText("I need a price calculator"); // rows are cached now
    expect(listCalls).toBe(1);

    await click(tab(STAFF_COPY.watchtowerTitle));
    expect(await screen.findByText(STAFF_COPY.refusal)).toBeTruthy();
    expect(probeCalls).toBe(2); // 401, renew, 401 again
    expect(window.sessionStorage.getItem(STAFF_SESSION_KEY)).toBeNull();

    // Back in as someone else: the previous credential's rows are gone, so the
    // list is fetched again rather than served from a dead session's cache.
    await click(screen.getByText(STAFF_COPY.signIn));
    fireEvent.change(screen.getByLabelText(STAFF_COPY.email), {
      target: { value: "staff@firstprofit.school" },
    });
    fireEvent.change(screen.getByLabelText(STAFF_COPY.password), {
      target: { value: "hunter22hunter22" },
    });
    await act(async () => {
      fireEvent.click(screen.getByText(STAFF_COPY.signIn));
    });
    await screen.findByText("I need a price calculator");
    expect(listCalls).toBe(2);
  });

  it("a PROVEN session that later cannot renew gets the sign-in form, not the refusal", async () => {
    probe.paths = ["/api/fp/probe-a"];
    mockRoutes({
      password: () => jsonResponse(200, { access_token: "tok-1", refresh_token: "ref-1" }),
      // The suggestions load proves this typed-in session IS staff...
      suggestions: () => jsonResponse(200, { ok: true, suggestions: ROWS }),
      // ...and then the refresh token turns out to be dead.
      refresh: () => jsonResponse(400, { error: "invalid_grant" }),
      probe: () => jsonResponse(401, { ok: false }),
    });

    // A FRESH sign-in, deliberately: a session that never proved itself would
    // be refused here, and that is the distinction under test.
    render(<StaffShell />);
    await signInAs();
    await screen.findByText("I need a price calculator");
    await click(tab(STAFF_COPY.watchtowerTitle));

    expect(await screen.findByText(STAFF_COPY.signInTitle)).toBeTruthy();
    expect(screen.queryByText(STAFF_COPY.refusal)).toBeNull();
    // An expiry is not a refusal: nothing was revoked.
    expect(callsTo("/auth/v1/logout")).toBe(0);
  });
});
