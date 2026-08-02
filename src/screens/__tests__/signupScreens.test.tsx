// @vitest-environment jsdom
/**
 * Signup screens (Slice B Unit 8; single path since U15) — proves each screen
 * renders, surfaces its validation, and navigates from PROPS / local state ALONE
 * (no game context, no real API). Covers the single credential step (first name +
 * a password, no login-method choice), the consent gate blocking continue until
 * attested, age/DOB/jurisdiction being required, and the child password
 * min-length surfaced.
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

/** A DOB (yyyy-mm-dd) for a child who turns `age` today, so it stays consistent
 *  with the band the test picks regardless of the calendar day the suite runs. */
function dobForAge(age: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear() - age, now.getMonth(), now.getDate());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

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
    expect(screen.getByText("Step 1 of 5 · Your grown-up account")).toBeTruthy();
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

    fireEvent.click(screen.getByRole("radio", { name: /Under 13/ }));
    fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: dobForAge(9) } });
    expect(cta().disabled).toBe(true); // jurisdiction still empty
    fireEvent.change(screen.getByPlaceholderText("Country or state"), {
      target: { value: "Texas, US" },
    });
    expect(cta().disabled).toBe(false);
    fireEvent.click(cta());
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});

describe("ChildCredential (screen 3) single username+password path", () => {
  it("shows a first name + password field and surfaces the min-length rule", () => {
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

  it("has no login-method choice and no school-email / provision-address option", () => {
    render(
      <Harness
        initial={{ childFirstName: "Alex" }}
        render={(data, patch) => (
          <ChildCredential data={data} onChange={patch} onNext={vi.fn()} onBack={vi.fn()} />
        )}
      />,
    );
    // The radiogroup, the "school email" radio, and the @the120.school preview are gone.
    expect(screen.queryByRole("radiogroup", { name: /Login method/i })).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByText(/school email/i)).toBeNull();
    expect(screen.queryByText(/the120\.school/i)).toBeNull();
    // The password field is always present (no path branch hides it).
    expect(screen.getByLabelText("Password for your child")).toBeTruthy();
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
    expect(screen.getByText(/v2026-08-01\.1/)).toBeTruthy();
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

describe("AgeJurisdiction DOB / band consistency", () => {
  it("blocks continue and warns when the DOB contradicts the chosen band", () => {
    render(
      <Harness
        render={(data, patch) => (
          <AgeJurisdiction data={data} onChange={patch} onNext={vi.fn()} onBack={vi.fn()} />
        )}
      />,
    );
    const cta = () => screen.getByRole("button", { name: /Continue/ }) as HTMLButtonElement;
    fireEvent.click(screen.getByRole("radio", { name: /16 or older/ }));
    // A DOB making the child 8 contradicts the 16+ band.
    fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: dobForAge(8) } });
    fireEvent.change(screen.getByPlaceholderText("Country or state"), {
      target: { value: "Texas, US" },
    });
    expect(screen.getByRole("alert").textContent).toMatch(/does not match the age band/);
    expect(cta().disabled).toBe(true);
    // Correcting the DOB to a consistent age clears the warning and enables continue.
    fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: dobForAge(17) } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(cta().disabled).toBe(false);
  });
});

describe("single-select groups expose radiogroup semantics (a11y)", () => {
  it("age band is a radiogroup of radios with a single checked option", () => {
    render(
      <Harness
        render={(data, patch) => (
          <AgeJurisdiction data={data} onChange={patch} onNext={vi.fn()} onBack={vi.fn()} />
        )}
      />,
    );
    const group = screen.getByRole("radiogroup", { name: "Age band" });
    expect(group).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBe(3);
    fireEvent.click(screen.getByRole("radio", { name: /13 to 15/ }));
    expect(
      (screen.getByRole("radio", { name: /13 to 15/ }) as HTMLElement).getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      (screen.getByRole("radio", { name: /Under 13/ }) as HTMLElement).getAttribute("aria-checked"),
    ).toBe("false");
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
