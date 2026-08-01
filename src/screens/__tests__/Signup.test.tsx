// @vitest-environment jsdom
/**
 * Signup container (Slice B Unit 8) — walks the four-step sequence from local
 * state alone (no game context) and proves it calls the INJECTED submit stub
 * once, with the captured fields in the backend-contract shape. Also covers the
 * back-out `onExit` seam and the synchronous double-submit guard.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Signup, type CompleteVerificationRequest } from "../Signup";
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

function fillCredentialPathA() {
  fireEvent.change(screen.getByPlaceholderText("Alex"), { target: { value: "Alex" } });
  fireEvent.change(screen.getByLabelText("Password for your child"), {
    target: { value: "kidpassword" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
}

describe("Signup container", () => {
  it("walks all four steps and submits the backend-contract shape (path a)", async () => {
    const onSubmitSignup = vi.fn(async (_s: SignupSubmission) => ({ ok: true }));
    render(<Signup onSubmitSignup={onSubmitSignup} onExit={vi.fn()} />);

    fillParent();
    fillAge();
    fillCredentialPathA();

    // Consent step: attest, then submit.
    expect(screen.getByText("Step 4 of 4 · Your consent")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Create my child's account/ }));

    await waitFor(() => expect(onSubmitSignup).toHaveBeenCalledTimes(1));
    const submission = onSubmitSignup.mock.calls[0][0] as SignupSubmission;
    expect(submission.parent.email).toBe("sam@example.com");
    expect(submission.child.credentialChoice).toBe("existing_credential");
    expect(submission.child.password).toBe("kidpassword");
    expect(submission.child.provisionAddress).toBeNull();
    expect(submission.child.ageBand).toBe("13_to_15");
    expect(submission.child.dob).toBe(AGE_DOB);
    expect(submission.jurisdiction).toBe("California, US");
    expect(submission.consent.accepted).toBe(true);
    expect(submission.consent.policyNamespace).toBe("fp_parental_consent");
    expect(submission.consent.method).toBe("email_plus_attestation");

    // On success the container shows the confirmation.
    await waitFor(() => expect(screen.getByText("Check your email.")).toBeTruthy());
  });

  it("submits path b with a provision address and no password", async () => {
    const onSubmitSignup = vi.fn(async (_s: SignupSubmission) => ({ ok: true }));
    render(<Signup onSubmitSignup={onSubmitSignup} onExit={vi.fn()} />);

    fillParent();
    fillAge();
    fireEvent.change(screen.getByPlaceholderText("Alex"), { target: { value: "Robin" } });
    fireEvent.click(screen.getByRole("radio", { name: /Give them a school email/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Create my child's account/ }));

    await waitFor(() => expect(onSubmitSignup).toHaveBeenCalledTimes(1));
    const submission = onSubmitSignup.mock.calls[0][0] as SignupSubmission;
    expect(submission.child.credentialChoice).toBe("provision_workspace");
    expect(submission.child.password).toBeNull();
    expect(submission.child.provisionAddress).toBe("robin@the120.school");
  });

  it("exits to landing from step 1 back, and step 2 back returns to step 1", () => {
    const onExit = vi.fn();
    render(<Signup onSubmitSignup={vi.fn(async (_s: SignupSubmission) => ({ ok: true }))} onExit={onExit} />);
    // Step 2 back returns to step 1 (does not exit).
    fillParent();
    expect(screen.getByText("Step 2 of 4 · Your child")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(screen.getByText("Step 1 of 4 · Your grown-up account")).toBeTruthy();
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
    fillCredentialPathA();
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
    fillCredentialPathA();
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
    fillCredentialPathA();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Create my child's account/ }));

    await waitFor(() => expect(screen.getByText("Check your email.")).toBeTruthy());
    const pending = loadPendingSignup();
    expect(pending).toMatchObject({
      attemptId: "attempt-9",
      parentEmail: "sam@example.com",
      jurisdiction: "California, US",
      child: { firstName: "Alex", credentialChoice: "existing_credential", ageBand: "13_to_15", dob: AGE_DOB },
      consent: {
        policyVersion: "2026-08-01.1",
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
  child: { firstName: "Alex", credentialChoice: "existing_credential", ageBand: "13_to_15", dob: "2011-05-04" },
  jurisdiction: "California, US",
  consent: { policyVersion: "2026-08-01.1", policyHash: "f".repeat(64), method: "email_plus_attestation" },
};

describe("Signup verify-return", () => {
  beforeEach(() => window.localStorage.clear());

  it("reprompts BOTH passwords (NOT prefilled) and completes the mint (path a -> playing)", async () => {
    savePendingSignup(PENDING_A);
    const onCompleteVerification = vi.fn(
      async (_r: CompleteVerificationRequest) => ({ ok: true, outcome: "playing" as const }),
    );
    render(<Signup verifyToken="tok-123" onCompleteVerification={onCompleteVerification} onExit={vi.fn()} />);

    // Neither password is carried across the reload (different tab / fresh load):
    // both fields are empty and the CTA is disabled until BOTH are entered.
    expect(screen.getByText("Confirm your password.")).toBeTruthy();
    const pw = screen.getByLabelText("Your password") as HTMLInputElement;
    const childPw = screen.getByLabelText("Alex's password") as HTMLInputElement;
    expect(pw.value).toBe("");
    expect(childPw.value).toBe("");
    const cta = screen.getByRole("button", { name: /Finish setup/ });
    expect((cta as HTMLButtonElement).disabled).toBe(true);

    // Only the parent password → still disabled (path a needs the child password).
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
        echoedVersion: "2026-08-01.1",
        echoedHash: "f".repeat(64),
        method: "email_plus_attestation",
      },
      child: {
        firstName: "Alex",
        credentialChoice: "existing_credential",
        ageBand: "13_to_15",
        dob: "2011-05-04",
        password: "kidpassword",
      },
    });
    // A playing outcome clears the pending blob (the game has taken over).
    await waitFor(() => expect(loadPendingSignup()).toBeNull());
  });

  it("path b (provision) needs only the parent password and resolves to the setup-email confirmation", async () => {
    savePendingSignup({
      attemptId: "attempt-b",
      parentEmail: "sam@example.com",
      createdAt: Date.now(),
      child: { firstName: "Robin", credentialChoice: "provision_workspace", ageBand: "16_plus" },
      jurisdiction: "California, US",
      consent: { policyVersion: "2026-08-01.1", policyHash: "f".repeat(64), method: "email_plus_attestation" },
    });
    const onCompleteVerification = vi.fn(
      async (_r: CompleteVerificationRequest) => ({ ok: true, outcome: "confirmation" as const }),
    );
    render(<Signup verifyToken="tok-b" onCompleteVerification={onCompleteVerification} onExit={vi.fn()} />);

    // Path b renders NO child-password field.
    expect(screen.queryByLabelText("Robin's password")).toBeNull();
    fireEvent.change(screen.getByLabelText("Your password"), { target: { value: "parentpass" } });
    fireEvent.click(screen.getByRole("button", { name: /Finish setup/ }));

    await waitFor(() => expect(screen.getByText("You are all set.")).toBeTruthy());
    // Path b confirmation copy references the provisioned address / setup email.
    expect(screen.getByText(/school sign-in address/i)).toBeTruthy();
    expect(onCompleteVerification.mock.calls[0][0].child.password).toBeUndefined();
    expect(loadPendingSignup()).toBeNull();
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

  it("different device / no pending -> shows the finish-on-your-device message, never mints", () => {
    // No savePendingSignup: this device has no pending blob.
    const onCompleteVerification = vi.fn(async (_r: CompleteVerificationRequest) => ({ ok: true }));
    render(<Signup verifyToken="tok" onCompleteVerification={onCompleteVerification} onExit={vi.fn()} />);
    expect(screen.getByText("Finish on the device you started on.")).toBeTruthy();
    expect(screen.queryByLabelText("Your password")).toBeNull();
    expect(onCompleteVerification).not.toHaveBeenCalled();
  });
});
