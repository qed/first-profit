// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  MONEY_IDEA_RUBRIC,
  generateStartingIdeas,
  type BrainstormInputs,
  type StartingIdea,
} from "../../../lib/ideaBrainstorm";
import { IdeaBrainstormTool } from "../IdeaBrainstormTool";

type IdeaRequester = (inputs: BrainstormInputs, round: number) => Promise<StartingIdea[]>;

function ControlledTool({
  ideaRequester = async (inputs, round) => generateStartingIdeas(inputs, round),
}: {
  ideaRequester?: IdeaRequester;
}) {
  const [fields, setFields] = React.useState<Record<string, string>>({});
  return (
    <>
      <IdeaBrainstormTool
        fields={fields}
        onFieldChange={(key, value) => setFields((current) => ({ ...current, [key]: value }))}
        ideaRequester={ideaRequester}
      />
      <output aria-label="Chosen product">{fields.productName ?? ""}</output>
      <output aria-label="Chosen one-liner">{fields.oneLiner ?? ""}</output>
    </>
  );
}

function completeSetup() {
  fireEvent.change(screen.getByLabelText("Favorite board game"), { target: { value: "Chess" } });
  fireEvent.change(screen.getByLabelText("An animal you love"), { target: { value: "Dogs" } });
  fireEvent.click(screen.getByRole("button", { name: "Choose a business shape" }));
  fireEvent.click(screen.getByRole("button", { name: /Physical goods/ }));
  fireEvent.click(screen.getByRole("button", { name: "Name the buyer" }));
  fireEvent.change(screen.getByLabelText("Who might buy it?"), { target: { value: "fans" } });
  fireEvent.click(screen.getByRole("button", { name: "Local stories" }));
}

afterEach(cleanup);

describe("IdeaBrainstormTool", () => {
  it("reveals one decision at a time and requires only one personal spark", () => {
    render(<ControlledTool />);

    expect(screen.getByText("Business Idea Spark Lab")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose a business shape" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("One spark is enough to continue.")).toBeTruthy();

    completeSetup();

    expect(screen.getByRole("button", { name: "Generate 5 ideas" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByText("Step 3 of 5 · Buyer + twist")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/â€”/);
  });

  it("generates a five-idea carousel and copies the chosen idea into task fields", async () => {
    render(<ControlledTool />);
    completeSetup();
    fireEvent.click(screen.getByRole("button", { name: "Generate 5 ideas" }));

    expect(await screen.findByText("Meet your five starting ideas")).toBeTruthy();
    expect(screen.getByText("Idea 1 of 5")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show idea 5" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Use this idea" }));
    expect(screen.getByLabelText("Chosen product").textContent).toContain("Chess");
    expect(screen.getByLabelText("Chosen one-liner").textContent).toContain("fans and collectors");
    expect(screen.getByText(/now your product and one-liner/)).toBeTruthy();
  });

  it("scores an idea with the five-part hobby-to-money rubric", async () => {
    render(<ControlledTool />);
    completeSetup();
    fireEvent.click(screen.getByRole("button", { name: "Generate 5 ideas" }));
    fireEvent.click(await screen.findByRole("button", { name: "Test this idea" }));

    for (const item of MONEY_IDEA_RUBRIC) {
      fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(item.label) }));
    }

    expect(screen.getByText("Strong money-making potential")).toBeTruthy();
    expect(screen.getByText("5 of 5 checks")).toBeTruthy();
  });

  it("shows a loading state and labels deterministic backup ideas when AI fails", async () => {
    const ideaRequester = vi.fn().mockRejectedValue(new Error("provider down"));
    render(<ControlledTool ideaRequester={ideaRequester} />);
    completeSetup();
    fireEvent.click(screen.getByRole("button", { name: "Generate 5 ideas" }));

    expect(await screen.findByText("Meet your five starting ideas")).toBeTruthy();
    expect(screen.getByText(/backup ideas work without AI/i)).toBeTruthy();
    expect(ideaRequester).toHaveBeenCalledTimes(1);
  });

  it("locks the active inputs while AI is generating and labels an AI result", async () => {
    let resolveIdeas: ((ideas: StartingIdea[]) => void) | undefined;
    const ideaRequester = vi.fn(
      (inputs: BrainstormInputs, round: number) => new Promise<StartingIdea[]>((resolve) => {
        resolveIdeas = () => resolve(generateStartingIdeas(inputs, round));
      }),
    );
    render(<ControlledTool ideaRequester={ideaRequester} />);
    completeSetup();
    fireEvent.click(screen.getByRole("button", { name: "Generate 5 ideas" }));

    expect(screen.getByRole("button", { name: "Mixing 5 ideas..." }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByLabelText("Who might buy it?").hasAttribute("disabled")).toBe(true);
    resolveIdeas?.([]);

    expect(await screen.findByText("Meet your five starting ideas")).toBeTruthy();
    expect(screen.getByText(/AI made these starting points/)).toBeTruthy();
  });
});
