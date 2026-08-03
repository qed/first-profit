/**
 * Hand-kept behavior hooks for path content, keyed by STABLE TASK ID (R3).
 *
 * The generated module (`pathContent.generated.ts`) carries prose only; every
 * behavior the app attaches to a task lives HERE, so a content regeneration can
 * never silently drop it. `path.ts`'s assembly asserts that every id referenced
 * below exists in the generated content — a broken reference fails the
 * build/test, not the child.
 *
 * Editorial rule (from the plan): a copy tweak to the brief keeps the task id;
 * a meaning change or structural edit mints a new id, and any hook on the old
 * id must be moved deliberately.
 */
import type { ArtifactKey, StepField } from "./path";

/**
 * Tasks that auto-complete when an in-app artifact is built, keyed by task id.
 *
 * Carried over from the six `@artifact`-prefixed task strings the hand-written
 * path.ts encoded (the v1 wording each hook replaced is noted inline). Mapped
 * onto the brief task that the artifact fulfils; none of these criteria are
 * playable yet, so the hooks are dormant until the phase engine lands.
 */
export const ARTIFACT_HOOKS: Readonly<Record<string, ArtifactKey>> = {
  // v1: 2.1 "@website Publish it at a live URL" — the live-URL publish task.
  "2.1.5": "website",
  // v1: 3.2 "@checkout Put a working checkout live" — the brief has no
  // checkout-setup task; the live checkout is the instrument for the first
  // price-testing task, so building it ticks that task.
  "3.2.3": "checkout",
  // v1: 3.5 "@website Publish piece one" — Piece 1 goes live via the site.
  "3.5.2": "website",
  // v1: 4.1 "@checkout Take payments through your checkout" — checkout
  // payments land in the sales ledger this task builds.
  "4.1.1": "checkout",
  // v1: 4.2 "@ledger Open the P&L ledger" — the P&L template task.
  "4.2.1": "ledger",
  // v1: 5.2 "@delivery Set up the delivery system so it can be handed over".
  "5.2.1": "delivery",
};

/**
 * The task a REAL logged sale auto-completes (gameCore's ADD_LEDGER path).
 *
 * MUST be the LAST task of its criterion: gameCore addresses it as
 * `tasks.length - 1` of step "1.2", and the assembly in path.ts asserts this
 * invariant so a brief restructure cannot silently retarget the sale.
 */
export const SALE_AUTO_COMPLETE_TASK_ID = "1.2.5";

/**
 * Authored input fields shown on a criterion's FIRST task in the Step Runner,
 * keyed by criterion id. One entry → Step.field (legacy single-input shape);
 * more → Step.fields. Verbatim from the hand-written path.ts.
 */
export const FIELD_HOOKS: Readonly<Record<string, StepField[]>> = {
  "1.1": [
    {
      key: "productName",
      label: "Product name",
      placeholder: "Recess bracelets",
    },
    {
      key: "oneLiner",
      label: "Your one-liner",
      placeholder: "Custom friendship bracelets for kids who want to trade at recess.",
    },
  ],
  "2.2": [
    {
      key: "gapBrief",
      label: "The gap, in your words",
      placeholder:
        "Kids on my team lose their mouthguards every season and the store version takes two weeks...",
      long: true,
    },
  ],
};
