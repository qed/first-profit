// @vitest-environment jsdom
/**
 * Signup container (Slice B Unit 8) — walks the four-step sequence from local
 * state alone (no game context) and proves it calls the INJECTED submit stub
 * once, with the captured fields in the backend-contract shape. Also covers the
 * back-out `onExit` seam and the synchronous double-submit guard.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Signup, type CompleteVerificationRequest, type CompleteVerificationResult } from "../Signup";
import type { SignupSubmission } from "../signup/validation";
import {
  loadPendingSignup,
  savePendingSignup,
  type PendingSignup,
} from "../signup/pendingStore";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

/** A DOB (yyyy-mm-dd) for a child who turns `age` today, so it stays consistent
 *  with the band the test picks regardless of the calendar day the suite runs. */
function dobForAge(age: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear() - age, now.getMonth(), now.getDate());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Drive the four steps with a valid path-a founder. */
function fillParent() {
  fireEvent.change(screen.getByPlaceholderText("Sam Rivera"), { target: { value: "Sam Rivera" } });
  fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
    target: { value: "sam@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Create a password"), { target: { value: "parentpass" } });
  fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
}

/** Age 14 keeps the DOB consistent with the 13-15 band whatever day this runs. */
const AGE_DOB = dobForAge(14);

function fillAge() {
  fireEvent.click(screen.getByRole("radio", { name: /13 to 15/ }));
  fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: AGE_DOB } });
  fireEvent.change(screen.getByPlaceholderText("Country or state"), {
    target: { value: "California, US" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
}

/** Drive the single credential step: a first name + a child password. */
function fillCredential() {
  fireEvent.change(screen.getByPlaceholderText("Alex"), { target: { value: "Alex" } });
  fireEvent.change(screen.getByLabelText("Password for your child"), {
    target: { value: "kidpassword" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
}

describe("Signup container", () => {
  it("walks all four steps and submits the backend-contract shape (single path)", async () => {
    const onSubmitSignup = vi.fn(async (_s: SignupSubmission) => ({ ok: true }));
    render(<Signup onSubmitSignup={onSubmitSignup} onExit={vi.fn()} />);

    fillParent();
    fillAge();
    fillCredential();

    // Consent step: attest, then submit.
    expect(screen.getByText("Step 4 of 5 · Your consent")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Create my child's account/ }));

    await waitFor(() => expect(onSubmitSignup).toHaveBeenCalledTimes(1));
    const submission = onSubmitSignup.mock.calls[0][0] as SignupSubmission;
    expect(submission.parent.email).toBe("sam@example.com");
    // Single path (U15): no credentialChoice, no provisionAddress — just the
    // parent-set first name + password.
    expect(submission.child).toEqual({
      firstName: "Alex",
      password: "kidpassword",
      ageBand: "13_to_15",
      dob: AGE_DOB,
    });
    expect(submission.jurisdiction).toBe("California, US");
    expect(submission.consent.accepted).toBe(true);
    expect(submission.consent.policyNamespace).toBe("fp_parental_consent");
    expect(submission.consent.method).toBe("email_plus_attestation");

    // On success the container shows the email-wait screen.
    await waitFor(() => expect(screen.getByText("Check your email.")).toBeTruthy());
  });

  it("has no login-method choice or school-email option on the credential step", () => {
    render(<Signup onSubmitSignup={vi.fn(async () => ({ ok: true }))} onExit={vi.fn()} />);
    fillParent();
    fillAge();
    // The single credential step: a first name + a password, and nothing else.
    expect(screen.getByPlaceholderText("Alex")).toBeTruthy();
    expect(screen.getByLabelText("Password for your child")).toBeTruthy();
    expect(screen.queryByRole("radiogroup", { name: /Login method/i })).toBeNull();
    expect(screen.queryByRole("radio", { name: /school email/i })).toBeNull();
    expect(screen.queryByText(/the120\.school/i)).toBeNull();
  });

  it("exits to landing from step 1 back, and step 2 back returns to step 1", () => {
    const onExit = vi.fn();
    render(<Signup onSubmitSignup={vi.fn(async (_s: SignupSubmission) => ({ ok: true }))} onExit={onExit} />);
    // Step 2 back returns to step 1 (does not exit).
    fillParent();
    expect(screen.getByText("Step 2 of 5 · Your child")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(screen.getByText("Step 1 of 5 · Your grown-up account")).toBeTruthy();
    expect(onExit).not.toHaveBeenCalled();
    // Step 1 back exits to landing.
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("does not double-submit when the stub is slow (synchronous guard)", async () => {
    let resolve!: (v: { ok: boolean }) => void;
    const onSubmitSignup = vi.fn(
      () => new Promise<{ ok: boolean }>((r) => (resolve = r)),
    );
    render(<Signup onSubmitSignup={onSubmitSignup} onExit={vi.fn()} />);
    fillParent();
    fillAge();
    fillCredential();
    fireEvent.click(screen.getByRole("checkbox"));
    const cta = screen.getByRole("button", { name: /Creating account|Create my child's account/ });
    fireEvent.click(cta);
    fireEvent.click(cta); // second tap in-flight must be dropped
    expect(onSubmitSignup).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({ ok: true });
    });
  });

  it("surfaces an error and stays on consent when the submit stub fails", async () => {
    const onSubmitSignup = vi.fn(async () => ({ ok: false }));
    render(<Signup onSubmitSignup={onSubmitSignup} onExit={vi.fn()} />);
    fillParent();
    fillAge();
    fillCredential();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Create my child's account/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.queryByText("Check your email.")).toBeNull();
  });

  it("on START success persists the pending signup (attempt id + carry-forward, NO password) for the verify-return", async () => {
    const onSubmitSignup = vi.fn(async (_s: SignupSubmission) => ({ ok: true, attemptId: "attempt-9" }));
    render(<Signup onSubmitSignup={onSubmitSignup} onExit={vi.fn()} />);
    fillParent();
    fillAge();
    fillCredential();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Create my child's account/ }));

    await waitFor(() => expect(screen.getByText("Check your email.")).toBeTruthy());
    const pending = loadPendingSignup();
    expect(pending).toMatchObject({
      attemptId: "attempt-9",
      parentEmail: "sam@example.com",
      jurisdiction: "California, US",
      child: { firstName: "Alex", ageBand: "13_to_15", dob: AGE_DOB },
      consent: {
        policyVersion: "2026-08-03.1",
        method: "email_plus_attestation",
      },
    });
    expect(typeof pending?.createdAt).toBe("number");
    // FIX 2: no child password rides in the persisted blob.
    const raw = window.localStorage.getItem("fp:signup:pending") ?? "";
    expect(raw).not.toContain("kidpassword");
  });
});

// ── Verify-return (back from the email link) ──────────────────────────────────

const PENDING_A: PendingSignup = {
  attemptId: "attempt-9",
  parentEmail: "sam@example.com",
  createdAt: Date.now(),
  child: { firstName: "Alex", ageBand: "13_to_15", dob: "2011-05-04" },
  jurisdiction: "California, US",
  consent: { policyVersion: "2026-08-03.1", policyHash: "f".repeat(64), method: "email_plus_attestation" },
};

describe("Signup verify-return", () => {
  beforeEach(() => window.localStorage.clear());

  it("reprompts BOTH passwords (NOT prefilled) and completes the mint (single path -> playing)", async () => {
    savePendingSignup(PENDING_A);
    const onCompleteVerification = vi.fn(
      async (_r: CompleteVerificationRequest) => ({ ok: true, outcome: "playing" as const, username: "alex" }),
    );
    render(<Signup verifyToken="tok-123" onCompleteVerification={onCompleteVerification} onExit={vi.fn()} />);

    // After the email reload the whole-journey bar resumes at the final segment.
    expect(screen.getByRole("img", { name: "Step 5 of 5" })).toBeTruthy();

    // Neither password is carried across the reload (different tab / fresh load):
    // both fields are empty and the CTA is disabled until BOTH are entered.
    expect(screen.getByText("Confirm your password.")).toBeTruthy();
    const pw = screen.getByLabelText("Your password") as HTMLInputElement;
    const childPw = screen.getByLabelText("Alex's password") as HTMLInputElement;
    expect(pw.value).toBe("");
    expect(childPw.value).toBe("");
    const cta = screen.getByRole("button", { name: /Finish setup/ });
    expect((cta as HTMLButtonElement).disabled).toBe(true);

    // Only the parent password → still disabled (the child password is required too).
    fireEvent.change(pw, { target: { value: "parentpass" } });
    expect((cta as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(childPw, { target: { value: "kidpassword" } });
    fireEvent.click(screen.getByRole("button", { name: /Finish setup/ }));

    await waitFor(() => expect(onCompleteVerification).toHaveBeenCalledTimes(1));
    expect(onCompleteVerification.mock.calls[0][0]).toEqual({
      token: "tok-123",
      parentEmail: "sam@example.com",
      parentPassword: "parentpass",
      attemptId: "attempt-9",
      jurisdiction: "California, US",
      consent: {
        echoedVersion: "2026-08-03.1",
        echoedHash: "f".repeat(64),
        method: "email_plus_attestation",
      },
      child: {
        firstName: "Alex",
        ageBand: "13_to_15",
        dob: "2011-05-04",
        password: "kidpassword",
      },
    });
    // A playing outcome clears the pending blob (the game has taken over).
    await waitFor(() => expect(loadPendingSignup()).toBeNull());
  });

  it("a login-race confirmation reveals the generated username to the parent", async () => {
    savePendingSignup(PENDING_A);
    const onCompleteVerification = vi.fn(
      async (_r: CompleteVerificationRequest) => ({
        ok: true,
        outcome: "confirmation" as const,
        username: "alex4",
      }),
    );
    render(<Signup verifyToken="tok-c" onCompleteVerification={onCompleteVerification} onExit={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Your password"), { target: { value: "parentpass" } });
    fireEvent.change(screen.getByLabelText("Alex's password"), { target: { value: "kidpassword" } });
    fireEvent.click(screen.getByRole("button", { name: /Finish setup/ }));

    await waitFor(() => expect(screen.getByText("You are all set.")).toBeTruthy());
    // The confirmation shows the child's login username prominently, under a
    // "Username" label (exact-case, unique to the label — the body copy uses
    // lowercase "username").
    expect(screen.getByText("alex4")).toBeTruthy();
    expect(screen.getByText("Username")).toBeTruthy();
    expect(loadPendingSignup()).toBeNull();
  });

  it("a confirmation with no username degrades to a graceful fallback line (never blank)", async () => {
    savePendingSignup(PENDING_A);
    const onCompleteVerification = vi.fn(
      async (_r: CompleteVerificationRequest) => ({
        ok: true,
        outcome: "confirmation" as const,
        username: "",
      }),
    );
    render(<Signup verifyToken="tok-d" onCompleteVerification={onCompleteVerification} onExit={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Your password"), { target: { value: "parentpass" } });
    fireEvent.change(screen.getByLabelText("Alex's password"), { target: { value: "kidpassword" } });
    fireEvent.click(screen.getByRole("button", { name: /Finish setup/ }));

    await waitFor(() => expect(screen.getByText("You are all set.")).toBeTruthy());
    // Fallback copy points the parent to the emailed username; still names the child.
    expect(screen.getByText(/username you were emailed/i)).toBeTruthy();
  });

  it("the confirmation copy contains no em dash (username-present and empty variants)", async () => {
    for (const username of ["alex4", ""]) {
      window.localStorage.clear();
      savePendingSignup(PENDING_A);
      const onCompleteVerification = vi.fn(async (_r: CompleteVerificationRequest) => ({
        ok: true,
        outcome: "confirmation" as const,
        username,
      }));
      const { container } = render(
        <Signup verifyToken="tok-em" onCompleteVerification={onCompleteVerification} onExit={vi.fn()} />,
      );
      fireEvent.change(screen.getByLabelText("Your password"), { target: { value: "parentpass" } });
      fireEvent.change(screen.getByLabelText("Alex's password"), { target: { value: "kidpassword" } });
      fireEvent.click(screen.getByRole("button", { name: /Finish setup/ }));
      await waitFor(() => expect(screen.getByText("You are all set.")).toBeTruthy());
      expect(container.textContent).not.toContain("—");
      cleanup();
    }
  });

  it("associates the confirmation username value with its Username label (a11y)", async () => {
    savePendingSignup(PENDING_A);
    const onCompleteVerification = vi.fn(async (_r: CompleteVerificationRequest) => ({
      ok: true,
      outcome: "confirmation" as const,
      username: "alex4",
    }));
    render(<Signup verifyToken="tok-a11y" onCompleteVerification={onCompleteVerification} onExit={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Your password"), { target: { value: "parentpass" } });
    fireEvent.change(screen.getByLabelText("Alex's password"), { target: { value: "kidpassword" } });
    fireEvent.click(screen.getByRole("button", { name: /Finish setup/ }));
    await waitFor(() => expect(screen.getByText("You are all set.")).toBeTruthy());
    // The value's accessible name is provided by the "Username" label.
    expect(screen.getByLabelText("Username").textContent).toBe("alex4");
  });

  it("surfaces an error, clears the persisted blob, but stays on the reprompt when completion fails (FIX 2)", async () => {
    savePendingSignup(PENDING_A);
    const onCompleteVerification = vi.fn(async (_r: CompleteVerificationRequest) => ({ ok: false }));
    render(<Signup verifyToken="tok" onCompleteVerification={onCompleteVerification} onExit={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Your password"), { target: { value: "parentpass" } });
    fireEvent.change(screen.getByLabelText("Alex's password"), { target: { value: "kidpassword" } });
    fireEvent.click(screen.getByRole("button", { name: /Finish setup/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    // Still on the reprompt (the in-memory copy drives a retry) ...
    expect(screen.getByText("Confirm your password.")).toBeTruthy();
    // ... but a failed finish leaves NOTHING persisted.
    expect(loadPendingSignup()).toBeNull();
  });

  it("a stale-consent refusal shows a distinct message, then re-attesting resubmits with the NEW version and succeeds", async () => {
    savePendingSignup(PENDING_A);
    const NEW_POLICY = {
      namespace: "fp_parental_consent",
      version: "2026-09-01.1",
      hash: "b".repeat(64),
      method: "email_plus_attestation",
      title: "Parental consent to create your child's account",
      text: "The updated permission text the parent must review again.",
    };
    const onCompleteVerification = vi
      .fn<(_r: CompleteVerificationRequest) => Promise<CompleteVerificationResult>>()
      .mockResolvedValueOnce({ ok: false, staleConsent: true, policy: NEW_POLICY })
      .mockResolvedValueOnce({ ok: true, outcome: "playing", username: "alex" });
    render(<Signup verifyToken="tok-stale" onCompleteVerification={onCompleteVerification} onExit={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Your password"), { target: { value: "parentpass" } });
    fireEvent.change(screen.getByLabelText("Alex's password"), { target: { value: "kidpassword" } });
    fireEvent.click(screen.getByRole("button", { name: /Finish setup/ }));

    // The distinct stale-consent message renders (not the generic error).
    await waitFor(() =>
      expect(screen.getByText(/permission text was updated while this page was open/i)).toBeTruthy(),
    );
    expect(screen.getByText(NEW_POLICY.text)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/Something went wrong/i)).toBeNull();

    // The retry CTA stays disabled until the parent ticks the fresh attestation.
    const retryCta = screen.getByRole("button", { name: /Confirm and continue/ });
    expect((retryCta as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(retryCta);

    await waitFor(() => expect(onCompleteVerification).toHaveBeenCalledTimes(2));
    // The resubmit echoes the FRESHLY fetched version + hash, not the stale one.
    expect(onCompleteVerification.mock.calls[1][0]).toMatchObject({
      consent: { echoedVersion: "2026-09-01.1", echoedHash: "b".repeat(64), method: "email_plus_attestation" },
    });
    // The retry loop converges: it succeeds and clears the pending blob.
    await waitFor(() => expect(loadPendingSignup()).toBeNull());
  });

  it("a plain (non-stale) error on the reprompt still offers a 'Start again' escape", async () => {
    savePendingSignup(PENDING_A);
    const onCompleteVerification = vi.fn(async (_r: CompleteVerificationRequest) => ({ ok: false }));
    const onExit = vi.fn();
    render(<Signup verifyToken="tok-esc" onCompleteVerification={onCompleteVerification} onExit={onExit} />);
    fireEvent.change(screen.getByLabelText("Your password"), { target: { value: "parentpass" } });
    fireEvent.change(screen.getByLabelText("Alex's password"), { target: { value: "kidpassword" } });
    fireEvent.click(screen.getByRole("button", { name: /Finish setup/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());

    const startAgain = screen.getByRole("button", { name: "Start again" });
    fireEvent.click(startAgain);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("different device / no pending -> shows the finish-on-your-device message, never mints", () => {
    // No savePendingSignup: this device has no pending blob.
    const onCompleteVerification = vi.fn(async (_r: CompleteVerificationRequest) => ({ ok: true }));
    render(<Signup verifyToken="tok" onCompleteVerification={onCompleteVerification} onExit={vi.fn()} />);
    expect(screen.getByText("Finish on the device you started on.")).toBeTruthy();
    expect(screen.queryByLabelText("Your password")).toBeNull();
    expect(onCompleteVerification).not.toHaveBeenCalled();
  });
});

// ── Unit 10: assembled flow, the one coherent progress bar, existing-account ───

describe("Signup assembled flow + progress bar (Unit 10)", () => {
  beforeEach(() => window.localStorage.clear());

  it("the single progress bar advances across the input segments (1..4 of 5)", () => {
    render(<Signup onSubmitSignup={vi.fn(async () => ({ ok: true }))} onExit={vi.fn()} />);
    expect(screen.getByRole("img", { name: "Step 1 of 5" })).toBeTruthy();
    fillParent();
    expect(screen.getByRole("img", { name: "Step 2 of 5" })).toBeTruthy();
    fillAge();
    expect(screen.getByRole("img", { name: "Step 3 of 5" })).toBeTruthy();
    fillCredential();
    expect(screen.getByRole("img", { name: "Step 4 of 5" })).toBeTruthy();
  });

  it("submitting consent advances the bar to the fifth segment on the email-wait screen", async () => {
    render(<Signup onSubmitSignup={vi.fn(async () => ({ ok: true, attemptId: "a1" }))} onExit={vi.fn()} />);
    fillParent();
    fillAge();
    fillCredential();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Create my child's account/ }));
    await waitFor(() => expect(screen.getByText("Check your email.")).toBeTruthy());
    expect(screen.getByRole("img", { name: "Step 5 of 5" })).toBeTruthy();
  });

  it("a full walk from the form through the email return mints and enters the game (playing)", async () => {
    const start = vi.fn(async () => ({ ok: true, attemptId: "a1" }));
    const finish = vi.fn(async (_r: CompleteVerificationRequest) => ({
      ok: true,
      outcome: "playing" as const,
      username: "alex",
    }));
    const { rerender } = render(<Signup onSubmitSignup={start} onExit={vi.fn()} />);
    fillParent();
    fillAge();
    fillCredential();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Create my child's account/ }));
    await waitFor(() => expect(screen.getByText("Check your email.")).toBeTruthy());
    // The email link reloads the SPA into the verify-return (App sets verifyToken);
    // it reads the pending blob START persisted and finishes the mint.
    rerender(<Signup verifyToken="tok" onCompleteVerification={finish} onExit={vi.fn()} />);
    expect(screen.getByText("Confirm your password.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Your password"), { target: { value: "parentpass" } });
    fireEvent.change(screen.getByLabelText("Alex's password"), { target: { value: "kidpassword" } });
    fireEvent.click(screen.getByRole("button", { name: /Finish setup/ }));
    await waitFor(() => expect(finish).toHaveBeenCalledTimes(1));
    expect(finish.mock.calls[0][0].child.password).toBe("kidpassword");
    // playing = the game took over; the container cleared the pending blob.
    await waitFor(() => expect(loadPendingSignup()).toBeNull());
  });

  it("existing_account routes to the sign-in interruption (not a generic error) and fires onGoToLogin", async () => {
    const start = vi.fn(async () => ({ ok: false, existingAccount: true }));
    const onGoToLogin = vi.fn();
    render(<Signup onSubmitSignup={start} onGoToLogin={onGoToLogin} onExit={vi.fn()} />);
    fillParent();
    fillAge();
    fillCredential();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Create my child's account/ }));
    await waitFor(() => expect(screen.getByText("You may already have an account.")).toBeTruthy());
    // Non-enumerating: the returning parent gets a sign-in CTA, NOT the generic
    // "something went wrong" alert.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/Something went wrong/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Go to sign in/ }));
    expect(onGoToLogin).toHaveBeenCalledTimes(1);
  });
});
