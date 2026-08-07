// @vitest-environment jsdom
/**
 * THE COMIC COVER ON THE `lg`+ DESKTOP FLOOR (new-user-flow-v3, Unit 7; R12).
 *
 * ── WHY THIS FILE EXISTS ──
 * `FactoryFloor` renders the 2D desktop floor at `lg` (1024px) and DELEGATES to
 * `MobilePath` below it. Two components, one avatar, one child. The cover was
 * threaded through both for exactly that reason — and `MobilePath` had a test
 * while `FactoryFloor` had none at all, so "the two agree across the
 * breakpoint" was an intention rather than a fact.
 *
 * The failure that gap allows is specific and invisible to every other test:
 * `MobilePath` shows the kid their own face, and then a laptop, a rotated
 * tablet, or a resized window crosses 1024px and hands them a generic sprite —
 * with no error, no warning, and a passing suite. That is the breakpoint-
 * crossing class this repo already has a documented solution for
 * (docs/solutions/ui-bugs/breakpoint-crossing-drops-navigation), applied to
 * identity instead of navigation.
 *
 * So this mirrors the MobilePath assertion at the OTHER side of the same query,
 * and then asserts the two together: same child, same picture, either width.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { COVER_DATA_URL_PREFIX } from "../../lib/cover";

const COVER = `${COVER_DATA_URL_PREFIX}PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=`;

/** Drive the ONE media query FactoryFloor switches on. `lg` is 1024px. */
function setViewport(isDesktop: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: isDesktop && query.includes("1024px"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }),
  });
}

const profile = {
  firstName: "Remi",
  handle: "remi",
  coverUrl: COVER as string | null,
  coverStatus: "final" as string | null,
};

beforeEach(() => {
  vi.resetModules();
  profile.coverUrl = COVER;
  profile.coverStatus = "final";
  // The floor's children are irrelevant here; only the avatar is under test.
  vi.doMock("../../state/GameContext", () => ({ useGame: () => ({ profile }) }));
  vi.doMock("../PhasesFloor", () => ({ PhasesFloor: () => <div /> }));
  vi.doMock("../CriterionFloor", () => ({ CriterionFloor: () => <div /> }));
});

afterEach(() => {
  cleanup();
  vi.doUnmock("../../state/GameContext");
  vi.doUnmock("../PhasesFloor");
  vi.doUnmock("../CriterionFloor");
});

async function renderFloor() {
  const { FactoryFloor } = await import("../FactoryFloor");
  return render(
    <FactoryFloor
      walkTo={null}
      onArrived={vi.fn()}
      onWalk={vi.fn()}
      floorView="phases"
      onBack={vi.fn()}
    />,
  );
}

describe("FactoryFloor — the desktop floor's walking avatar", () => {
  it("hands the profile's cover to the sprite at lg+ (the MobilePath assertion's twin)", async () => {
    setViewport(true);
    await renderFloor();
    const img = screen.getByRole("img", { name: /Remi's comic cover/i }) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(COVER);
  });

  it("falls back to the procedural sprite at lg+ when the child has no cover", async () => {
    profile.coverUrl = null;
    profile.coverStatus = null;
    setViewport(true);
    const { container } = await renderFloor();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

describe("FactoryFloor — the two floors agree ACROSS the 1024px breakpoint", () => {
  it("shows the same child the same picture at both widths", async () => {
    // Below lg: FactoryFloor delegates to MobilePath.
    setViewport(false);
    const mobile = await renderFloor();
    const onMobile = screen.getByRole("img", { name: /Remi's comic cover/i }) as HTMLImageElement;
    const mobileSrc = onMobile.getAttribute("src");
    mobile.unmount();

    // At/above lg: FactoryFloor renders the desktop floor itself. This is the
    // same remount a real resize produces — the variant is swapped, not styled.
    setViewport(true);
    await renderFloor();
    const onDesktop = screen.getByRole("img", { name: /Remi's comic cover/i }) as HTMLImageElement;

    expect(mobileSrc).toBe(COVER);
    expect(onDesktop.getAttribute("src")).toBe(mobileSrc);
  });

  it("and the same ABSENCE at both widths — no cover means the sprite either side", async () => {
    profile.coverUrl = null;
    profile.coverStatus = null;

    setViewport(false);
    const mobile = await renderFloor();
    expect(mobile.container.querySelector("img")).toBeNull();
    expect(mobile.container.querySelector("svg")).not.toBeNull();
    mobile.unmount();

    setViewport(true);
    const desktop = await renderFloor();
    expect(desktop.container.querySelector("img")).toBeNull();
    expect(desktop.container.querySelector("svg")).not.toBeNull();
  });
});
