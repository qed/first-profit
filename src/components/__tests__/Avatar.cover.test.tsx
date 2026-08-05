// @vitest-environment jsdom
/**
 * THE COMIC COVER ON THE JOURNEY SURFACES (new-user-flow-v3, Unit 7; R12).
 *
 * The cover is the FIRST <img> in this codebase, and an image is the first
 * thing here that can fail at runtime — so these tests are mostly about the
 * absence and the failure, not the happy path:
 *
 *   - a child WITH a cover sees the picture;
 *   - a child WITHOUT one sees the procedural sprite that has always been there;
 *   - an image that fails to load falls back to that same sprite, never a
 *     broken-image glyph and never an empty hole;
 *   - a `final` status with no picture available renders the sprite and NO
 *     pending copy. There is no "your cover is being drawn" anywhere in this
 *     product, because nothing in it queues a redraw for such a line to be
 *     about (docs: a status that names queued work is a promise).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { AvatarSprite } from "../Avatar";
import { COVER_DATA_URL_PREFIX } from "../../lib/cover";

const COVER = `${COVER_DATA_URL_PREFIX}PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=`;

/** Framer Motion renders real DOM in jsdom, but the bobbing animation is noise
 *  here; nothing below depends on it. */
afterEach(() => cleanup());

/** Copy that must never appear on any surface, in any state. */
const PENDING_COPY = /being drawn|drawing your cover|almost ready|generating/i;

function sprite(container: HTMLElement): SVGElement | null {
  return container.querySelector("svg");
}

describe("AvatarSprite — cover present", () => {
  it("renders the cover as an <img> with explicit dimensions and object-fit", () => {
    const { container } = render(<AvatarSprite name="Remi" coverUrl={COVER} />);

    const img = screen.getByRole("img", { name: /Remi's comic cover/i }) as HTMLImageElement;
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toBe(COVER);
    // Explicit width/height attributes reserve the box before decode — no
    // reflow on the 390px path where the avatar sits above every card.
    expect(img.getAttribute("width")).toBe("44");
    expect(img.getAttribute("height")).toBe("55"); // 44 / (4/5), the 4:5 frame
    expect(img.className).toContain("object-cover");
    // The procedural figure is replaced, not stacked behind it.
    expect(sprite(container)).toBeNull();
    expect(container.textContent ?? "").not.toMatch(PENDING_COPY);
  });

  it("still shows the child's name beside the picture", () => {
    render(<AvatarSprite name="Remi" coverUrl={COVER} />);
    expect(screen.getByText("Remi")).toBeTruthy();
  });
});

describe("AvatarSprite — no cover", () => {
  it("renders the procedural SVG sprite and no <img> at all", () => {
    const { container } = render(<AvatarSprite name="Remi" coverUrl={null} />);
    expect(sprite(container)).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent ?? "").not.toMatch(PENDING_COPY);
  });

  it("renders the sprite when the prop is simply absent (every pre-v3 account)", () => {
    const { container } = render(<AvatarSprite name="Remi" />);
    expect(sprite(container)).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows NO pending copy for a 'final' status whose picture is unavailable", () => {
    // The kid's roster says `final`, but this door handed over no url (a
    // blob-backed cover the session body cannot produce). What renders is
    // decided by the PICTURE, never by the word: the ordinary sprite, and
    // nothing that promises a redraw nobody is performing.
    const { container } = render(<AvatarSprite name="Remi" coverUrl={null} />);
    expect(sprite(container)).not.toBeNull();
    expect(container.textContent ?? "").not.toMatch(PENDING_COPY);
  });
});

describe("AvatarSprite — the image fails to load", () => {
  it("falls back to the sprite on error, with no broken image left behind", () => {
    const { container } = render(<AvatarSprite name="Remi" coverUrl={COVER} />);
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img).not.toBeNull();

    // jsdom never loads a data URL, so the error is fired explicitly — the
    // same event a truncated cache entry or an undecodable payload produces.
    fireEvent.error(img);

    expect(container.querySelector("img")).toBeNull();
    expect(sprite(container)).not.toBeNull();
    expect(screen.getByText("Remi")).toBeTruthy();
    expect(container.textContent ?? "").not.toMatch(PENDING_COPY);
  });

  it("gives a NEW cover a fresh attempt after a previous one failed", () => {
    const { container, rerender } = render(<AvatarSprite name="Remi" coverUrl={COVER} />);
    fireEvent.error(container.querySelector("img") as HTMLImageElement);
    expect(container.querySelector("img")).toBeNull();

    const next = `${COVER_DATA_URL_PREFIX}PHN2Zy8+`;
    rerender(<AvatarSprite name="Remi" coverUrl={next} />);

    expect(container.querySelector("img")?.getAttribute("src")).toBe(next);
  });
});

describe("MobilePath's top-of-journey avatar", () => {
  it("hands the profile's cover to the sprite", async () => {
    vi.resetModules();
    const profile = {
      firstName: "Remi",
      handle: "remi",
      coverUrl: COVER,
      coverStatus: "final",
    };
    vi.doMock("../../state/GameContext", () => ({ useGame: () => ({ profile }) }));
    vi.doMock("../PhasesFloor", () => ({ PhasesFloor: () => <div /> }));
    vi.doMock("../CriterionFloor", () => ({ CriterionFloor: () => <div /> }));

    const { MobilePath } = await import("../MobilePath");
    render(
      <MobilePath
        walkTo={null}
        onArrived={vi.fn()}
        onWalk={vi.fn()}
        floorView="phases"
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByRole("img", { name: /Remi's comic cover/i })).toBeTruthy();
    vi.doUnmock("../../state/GameContext");
    vi.doUnmock("../PhasesFloor");
    vi.doUnmock("../CriterionFloor");
  });
});
