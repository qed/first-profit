// @vitest-environment jsdom
//
// The /auth/enter landing (v3 Unit 6). The load-bearing assertion is the
// FAILURE state: because the exchange never un-burns a code, this screen is the
// only thing a stranded family is looking at, so it must name the way back
// rather than say "something went wrong" (Unit 5 review, FIX 1).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

const redeemHandoff = vi.fn();
const login = vi.fn();
vi.mock("../../../state/GameContext", () => ({
  useGame: () => ({ redeemHandoff, login }),
}));

import { Enter } from "../Enter";

function renderEnter(code: string | null) {
  return render(React.createElement(Enter, { code }));
}

beforeEach(() => {
  redeemHandoff.mockReset();
  login.mockReset().mockResolvedValue(false);
});

afterEach(() => cleanup());

describe("Enter — redeeming", () => {
  it("shows a spinner while the exchange is in flight and redeems the code once", async () => {
    let resolve: ((ok: boolean) => void) | undefined;
    redeemHandoff.mockReturnValue(
      new Promise<boolean>((r) => {
        resolve = r;
      }),
    );

    renderEnter("one-time-code");

    expect(screen.getByRole("status").textContent ?? "").toMatch(/signing you in/i);
    expect(redeemHandoff).toHaveBeenCalledTimes(1);
    expect(redeemHandoff).toHaveBeenCalledWith("one-time-code");
    // Nothing about failure is on screen yet.
    expect(screen.queryByRole("alert")).toBeNull();

    resolve?.(true);
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeNull());
  });

  // ── The single-fire guard vs. the unmount guard (review FIX 3) ─────────────
  //
  // The OLD test here passed a same-props `rerender`, which React's dependency
  // array already prevents from re-running the effect — it would have passed
  // with `attempted` deleted, so it pinned nothing. What actually needs pinning
  // is a MOUNT -> CLEANUP -> MOUNT double-invoke, because that is where the two
  // guarantees ("do not POST twice" and "we are still on screen") used to be
  // conflated into one closure flag and stranded the spinner: invocation #1
  // fired the only real request and captured `cancelled`, the synthetic cleanup
  // set THAT closure's flag, invocation #2 was stopped by `attempted`, and when
  // the sole in-flight redeem answered `ok:false` nobody was listening.
  //
  // <React.StrictMode> is the cheapest faithful reproduction of that sequence.
  // NOTE: the app does NOT render under StrictMode (src/index.tsx mounts <App/>
  // bare) — it is used HERE purely as a double-invoke harness.

  it("a mount -> cleanup -> mount double-invoke still POSTs exactly once", async () => {
    redeemHandoff.mockResolvedValue(false);
    render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(Enter, { code: "one-time-code" }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeNull());
    expect(redeemHandoff).toHaveBeenCalledTimes(1);
    expect(redeemHandoff).toHaveBeenCalledWith("one-time-code");
  });

  it("REGRESSION: after a double-invoke, a late refusal STILL reaches the screen", async () => {
    // The failure this pins: the answer arrives AFTER the synthetic cleanup.
    // With the old per-invocation `cancelled` closure the setState was
    // swallowed and "Signing you in…" stayed up forever.
    let resolve: ((ok: boolean) => void) | undefined;
    redeemHandoff.mockReturnValue(
      new Promise<boolean>((r) => {
        resolve = r;
      }),
    );

    render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(Enter, { code: "one-time-code" }),
      ),
    );
    expect(redeemHandoff).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();

    resolve?.(false);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent ?? "").toMatch(/used up/i);
    // The spinner is gone: the state is non-terminal, as a timed-out hang
    // (which arrives on this exact path) also requires.
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not redeem again on a same-props re-render either", async () => {
    redeemHandoff.mockResolvedValue(false);
    const { rerender } = renderEnter("one-time-code");
    rerender(React.createElement(Enter, { code: "one-time-code" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeNull());
    expect(redeemHandoff).toHaveBeenCalledTimes(1);
  });
});

describe("Enter — the required failure state", () => {
  it("names the way back and offers real recovery, not a bare error", async () => {
    redeemHandoff.mockResolvedValue(false);
    renderEnter("spent-code");

    const alert = await screen.findByRole("alert");
    const text = alert.textContent ?? "";

    // 1. It says the code is spent and cannot be retried.
    expect(text).toMatch(/used up/i);
    expect(text).toMatch(/one time only/i);
    expect(text).toMatch(/cannot be used again/i);
    // 2. It points at the OTHER tab, which still holds the credentials.
    expect(text).toMatch(/other tab/i);
    expect(text).toMatch(/username and password/i);
    // 3. It is NOT a bare "something went wrong".
    expect(text).not.toMatch(/something went wrong/i);

    // 4. The plain sign-in form is right here (no navigation required).
    expect(screen.getByLabelText(/username/i)).not.toBeNull();
    expect(screen.getByLabelText(/^password$/i)).not.toBeNull();
    expect(screen.getByRole("button", { name: /log in/i })).not.toBeNull();

    // 5. And a human address for a family whose other tab is already gone.
    const support = screen.getByRole("link", { name: /admissions@the120\.school/i });
    expect(support.getAttribute("href")).toBe("mailto:admissions@the120.school");
  });

  it("goes straight to recovery with no code (a refresh after the strip) and never redeems", async () => {
    renderEnter(null);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent ?? "").toMatch(/used up/i);
    expect(screen.getByRole("button", { name: /log in/i })).not.toBeNull();
    // No spinner that can never resolve, and no pointless exchange call.
    expect(screen.queryByRole("status")).toBeNull();
    expect(redeemHandoff).not.toHaveBeenCalled();
  });
});
