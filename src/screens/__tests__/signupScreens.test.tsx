// @vitest-environment jsdom
/**
 * Signup screens (Slice B Unit 8) — proves each screen renders, surfaces its
 * validation, and navigates from PROPS / local state ALONE (no game context, no
 * real API). Covers the path a/b toggle swapping inputs, the consent gate
 * blocking continue until attested, age/DOB/jurisdiction being required, and the
 * child password min-length surfaced.
 */
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  AgeJurisdiction,
  ChildCredential,
  ConsentScreen,
  SignupIntro,
} from "../signup/screens";
import { emptySignupData, type SignupData } from "../signup/validation";

afterEach(cleanup);

/** Stateful harness so the controlled screens behave like they do in the app. */
function Harness({
  render: renderScreen,
  initial,
}: {
  render: (data: SignupData, patch: (p: Partial<SignupData>) => void) => React.ReactNode;
  initial?: Partial<SignupData>;
}) {
  const [data, setData] = useState<SignupData>({ ...emptySignupData(), ...initial });
  return <>{renderScreen(data, (p) => setData((d) => ({ ...d, ...p })))}</>;
}

describe("SignupIntro (screen 1)", () => {
  it("renders the parent-account value prop and gates continue until valid", () => {
    const onNext = vi.fn();
    render(
      <Harness
        render={(data, patch) => (
          <SignupIntro data={data} onChange={patch} onNext={onNext} onBack={vi.fn()} />
        )}
      />,
    );
    expect(screen.getByText("Step 1 of 4 · Your grown-up account")).toBeTruthy();
    const cta = screen.getByRole("button", { name: /Continue/ }) as HTMLButtonElement;
    expect(cta.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText("Sam Rivera"), { target: { value: "Sam" } });
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "sam@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Create a password"), {
      target: { value: "longenough" },
    });
    expect((screen.getByRole("button", { name: /Continue/ }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("toggles password visibility with show/hide", () => {
    render(
      <Harness
        render={(data, patch) => (
          <SignupIntro data={data} onChange={patch} onNext={vi.fn()} onBack={vi.fn()} />
        )}
      />,
    );
    const pw = screen.getByLabelText("Create a password") as HTMLInputElement;
    expect(pw.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(pw.type).toBe("text");
  });
});

describe("AgeJurisdiction (screen 2)", () => {
  it("requires an age band, DOB, and jurisdiction before continuing", () => {
    const onNext = vi.fn();
    render(
      <Harness
        render={(data, patch) => (
          <AgeJurisdiction data={data} onChange={patch} onNext={onNext} onBack={vi.fn()} />
        )}
      />,
    );
    const cta = () => screen.getByRole("button", { name: /Continue/ }) as HTMLButtonElement;
    expect(cta().disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Under 13/ }));
    fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "2014-03-02" } });
    expect(cta().disabled).toBe(true); // jurisdiction still empty
    fireEvent.change(screen.getByPlaceholderText("Country or state"), {
      target: { value: "Texas, US" },
    });
    expect(cta().disabled).toBe(false);
    fireEvent.click(cta());
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});

describe("ChildCredential (screen 3) path a/b toggle", () => {
  it("path a shows a password field and surfaces the min-length rule", () => {
    render(
      <Harness
        initial={{ childFirstName: "Alex" }}
        render={(data, patch) => (
          <ChildCredential data={data} onChange={patch} onNext={vi.fn()} onBack={vi.fn()} />
        )}
      />,
    );
    expect(screen.getByText(/At least 10 characters/)).toBeTruthy();
    expect(screen.getByLabelText("Password for your child")).toBeTruthy();
    const cta = () => screen.getByRole("button", { name: /Continue/ }) as HTMLButtonElement;
    expect(cta().disabled).toBe(true);
    // Too-short password stays gated and shows the correction hint.
    fireEvent.change(screen.getByLabelText("Password for your child"), {
      target: { value: "short" },
    });
    expect(cta().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Password for your child"), {
      target: { value: "tenletters" },
    });
    expect(cta().disabled).toBe(false);
  });

  it("path b hides the password and previews the derived @the120.school address", () => {
    render(
      <Harness
        initial={{ childFirstName: "Alex" }}
        render={(data, patch) => (
          <ChildCredential data={data} onChange={patch} onNext={vi.fn()} onBack={vi.fn()} />
        )}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Give them a school email/ }));
    expect(screen.queryByLabelText("Password for your child")).toBeNull();
    expect(screen.getByText("alex@the120.school")).toBeTruthy();
    // No password needed on path b, so continue is enabled with just a name.
    expect((screen.getByRole("button", { name: /Continue/ }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});

describe("ConsentScreen (screen 4) gate + versioned policy", () => {
  it("renders the versioned policy and blocks submit until attested", () => {
    const onSubmit = vi.fn();
    render(
      <Harness
        render={(data, patch) => (
          <ConsentScreen
            data={data}
            onChange={patch}
            onSubmit={onSubmit}
            onBack={vi.fn()}
            submitting={false}
          />
        )}
      />,
    );
    expect(screen.getByText(/v2026-08-01\.v1/)).toBeTruthy();
    const cta = () => screen.getByRole("button", { name: /Create my child's account/ }) as HTMLButtonElement;
    expect(cta().disabled).toBe(true);
    fireEvent.click(cta());
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(cta().disabled).toBe(false);
    fireEvent.click(cta());
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("shows the COPPA emphasis only for the under-13 band", () => {
    const { rerender } = render(
      <ConsentScreen
        data={{ ...emptySignupData(), ageBand: "under_13" }}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
        submitting={false}
      />,
    );
    expect(screen.getByText(/COPPA/)).toBeTruthy();
    rerender(
      <ConsentScreen
        data={{ ...emptySignupData(), ageBand: "16_plus" }}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
        submitting={false}
      />,
    );
    expect(screen.queryByText(/COPPA/)).toBeNull();
  });

  it("disables submit while submitting (double-submit guard surface)", () => {
    render(
      <ConsentScreen
        data={{ ...emptySignupData(), consentAccepted: true }}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
        submitting={true}
      />,
    );
    const cta = screen.getByRole("button", { name: /Creating account/ }) as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
  });
});

describe("no em dashes across the signup screens", () => {
  it("renders no em dash in any signup screen", () => {
    const data = emptySignupData();
    const nodes = [
      <SignupIntro key="1" data={data} onChange={vi.fn()} onNext={vi.fn()} onBack={vi.fn()} />,
      <AgeJurisdiction key="2" data={data} onChange={vi.fn()} onNext={vi.fn()} onBack={vi.fn()} />,
      <ChildCredential key="3" data={data} onChange={vi.fn()} onNext={vi.fn()} onBack={vi.fn()} />,
      <ConsentScreen
        key="4"
        data={{ ...data, ageBand: "under_13" }}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
        submitting={false}
      />,
    ];
    for (const node of nodes) {
      const { container } = render(node);
      expect(container.textContent).not.toContain("—");
      cleanup();
    }
  });
});
