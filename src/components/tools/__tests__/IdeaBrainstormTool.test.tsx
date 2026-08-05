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
  fireEvent.change(screen.getByLabelText("Favorite board game"), {
    target: { value: "Chess" },
  });
  fireEvent.change(screen.getByLabelText("An animal you love"), {
    target: { value: "Dogs" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Physical goods/ }));
  fireEvent.change(screen.getByLabelText("Who might buy it?"), {
    target: { value: "fans" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Local stories" }));
}

afterEach(cleanup);

describe("IdeaBrainstormTool", () => {
  it("guides the learner through the required brainstorm inputs", () => {
    render(<ControlledTool />);

    expect(screen.getByText("Business Idea Spark Lab")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate 5 ideas" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Still needed: one thing you like/)).toBeTruthy();

    completeSetup();

    expect(screen.getByRole("button", { name: "Generate 5 ideas" }).hasAttribute("disabled")).toBe(false);
    expect(document.body.textContent).not.toMatch(/—/);
  });

  it("generates five ideas and copies a chosen idea into the real task fields", async () => {
    render(<ControlledTool />);
    completeSetup();
    fireEvent.click(screen.getByRole("button", { name: "Generate 5 ideas" }));

    expect(await screen.findByText("Five starting ideas")).toBeTruthy();
    expect(screen.getAllByText(/Idea [1-5] · Physical goods/)).toHaveLength(5);
    expect(screen.getAllByRole("button", { name: "Pick this idea" })).toHaveLength(5);

    fireEvent.click(screen.getAllByRole("button", { name: "Pick this idea" })[0]);
    expect(screen.getByLabelText("Chosen product").textContent).toContain("Chess");
    expect(screen.getByLabelText("Chosen one-liner").textContent).toContain("fans and collectors");
    expect(screen.getByText(/now your product and one-liner/)).toBeTruthy();
  });

  it("scores an idea with the five-part hobby-to-money rubric", async () => {
    render(<ControlledTool />);
    completeSetup();
    fireEvent.click(screen.getByRole("button", { name: "Generate 5 ideas" }));
    fireEvent.click((await screen.findAllByRole("button", { name: "Score it" }))[0]);

    for (const item of MONEY_IDEA_RUBRIC) {
      fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(item.label) }));
    }

    expect(screen.getAllByText("Strong money-making potential").length).toBeGreaterThan(0);
    expect(screen.getByText("5 of 5 checks")).toBeTruthy();
  });

  it("shows a loading state and labels deterministic backup ideas when AI fails", async () => {
    const ideaRequester = vi.fn().mockRejectedValue(new Error("provider down"));
    render(<ControlledTool ideaRequester={ideaRequester} />);
    completeSetup();
    fireEvent.click(screen.getByRole("button", { name: "Generate 5 ideas" }));

    expect(await screen.findByText("Five starting ideas")).toBeTruthy();
    expect(screen.getByText(/Backup ideas are shown because AI was unavailable/)).toBeTruthy();
    expect(ideaRequester).toHaveBeenCalledTimes(1);
  });

  it("locks inputs while AI is generating and labels an AI result", async () => {
    let resolveIdeas: ((ideas: StartingIdea[]) => void) | undefined;
    const ideaRequester = vi.fn(
      (inputs: BrainstormInputs, round: number) =>
        new Promise<StartingIdea[]>((resolve) => {
          resolveIdeas = () => resolve(generateStartingIdeas(inputs, round));
        }),
    );
    render(<ControlledTool ideaRequester={ideaRequester} />);
    completeSetup();
    fireEvent.click(screen.getByRole("button", { name: "Generate 5 ideas" }));

    expect(screen.getByRole("button", { name: "Mixing 5 ideas..." }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByLabelText("Favorite board game").hasAttribute("disabled")).toBe(true);
    resolveIdeas?.([]);

    expect(await screen.findByText("Five starting ideas")).toBeTruthy();
    expect(screen.getByText(/AI made these starting points/)).toBeTruthy();
  });
});
