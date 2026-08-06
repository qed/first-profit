---
title: "A visually-hidden span escaped its scroll container and broke the page layout — and the one mandated viewport was the only width that could not see it"
module: fp-staff-watchtower
date: 2026-08-05
problem_type: ui_bug
component: frontend_react
severity: medium
symptoms:
  - "At 320px the whole PAGE scrolled sideways: documentElement.scrollWidth 390 against innerWidth 320, from a 1px visually-hidden span"
  - "At the CLAUDE.md-mandated ~390px the same build measured clean, because the offending element's static position (~390px) sat almost exactly at innerWidth"
  - "Nothing looked wrong in a screenshot at any width — the escaping element is invisible by construction"
root_cause: logic_error
resolution_type: code_fix
last_updated: 2026-08-05
related_components:
  - src/screens/staff/StaffWatchtower.tsx (the NotMeasurable component and its `relative` wrapper)
  - src/screens/staff/staffCopy.ts (watchtowerNotMeasurable / watchtowerNotMeasurableSr)
  - docs/plans/2026-08-05-001-feat-watchtower-staff-progress-plan.md (the screenshot gate that decided one real table at every width)
tags:
  - accessibility
  - sr-only
  - containing-block
  - overflow
  - horizontal-scroll
  - mobile
  - viewport-gate
  - measurement
---

# A visually-hidden span escaped its scroll container, and the one mandated viewport was the only width that could not see it

## Problem

The Watchtower's median column has three distinct "no number" outcomes, and one
of them renders an em dash. A bare `—` is a bad accessible name: a screen reader
announces it as "dash" or skips it entirely, which makes it indistinguishable
from an empty cell — exactly the confusion the column's whole caveat structure
exists to prevent. So the glyph got a hidden word riding along with it, and the
copy object keeps the two together so they cannot drift:

```ts
/** The glyph AND its explanation live together, so they cannot drift apart. */
watchtowerNotMeasurable: "—",
/** A screen reader announces a bare em dash as "dash", or skips it — which is
 *  indistinguishable from an empty cell. The word rides along, hidden. */
watchtowerNotMeasurableSr: "not measurable",
```

The accessibility fix was right. The layout consequence was not: at 320px,
`documentElement.scrollWidth` measured 390 against an `innerWidth` of 320. The
entire page scrolled sideways — caused by a one-pixel element that renders no
visible ink at all.

## Why a hidden span moves the page

Tailwind's `sr-only` is not `display: none` (that would remove it from the
accessibility tree, defeating the point). It is the classic clip pattern, and
critically it is **`position: absolute`**.

An absolutely positioned element resolves against its nearest **positioned**
ancestor. The span had none — every ancestor up through the cell, the row, the
`<table>` and the `overflow-x: auto` wrapper was statically positioned. Its
containing block was therefore the **initial containing block**: the document.

Two things follow, and the second is the damage:

1. **It escapes the clip.** `overflow-x: auto` clips descendants whose
   containing block is inside the scroller. This span's containing block was the
   viewport-sized initial one, so the scroller had no authority over it.
2. **It is laid out at its static position, in DOCUMENT coordinates.** With no
   `top`/`left`, an absolutely positioned box sits where it *would* have been in
   flow — and in flow it was inside a table that is `min-w-[40rem]`, roughly
   390px along a 640px-wide table. That 390px offset became a page-level offset.

So a 1px visually-hidden element, at document x≈390, extended the document's
scroll width to 390 while the viewport was 320 wide. The board itself was
already correct — the plan's screenshot gate had verified a 640px table
scrolling cleanly inside a 354px card — and the fix that broke it touched no
layout class at all.

## Solution

Give the span a containing block **inside** the scroller. One wrapper with
`position: relative`, and the comment marking it load-bearing so nobody
"simplifies" it away:

```tsx
/** A number a screen reader should read as a number, with the em dash's hidden
 *  word for the cells that have no number to give. */
function NotMeasurable() {
  // `relative` is LOAD-BEARING, not decoration. `sr-only` is
  // `position: absolute`, and with no positioned ancestor its containing block
  // is the initial one — so it escapes the table's `overflow-x` clip and lands
  // at its static position in DOCUMENT coordinates, which is ~390px into a table
  // that is 640px wide. Measured at 320px: it pushed
  // `documentElement.scrollWidth` to 390 and scrolled the PAGE sideways, from a
  // 1px visually-hidden span. This wrapper gives it a containing block INSIDE
  // the scroller, where it is clipped like everything else.
  return (
    <span className="relative">
      <span aria-hidden="true">{STAFF_COPY.watchtowerNotMeasurable}</span>
      <span className="sr-only">{STAFF_COPY.watchtowerNotMeasurableSr}</span>
    </span>
  );
}
```

The `aria-hidden` on the glyph is the other half: without it the em dash is
still announced, and the reader hears "dash, not measurable".

## The sharpest part: the mandated width was the blind spot

CLAUDE.md makes one width a hard acceptance criterion:

> Target viewport: **~390px wide** (iPhone-class portrait). No horizontal
> scrolling, no clipped or overlapping content, tap targets at least ~44px.

At 390px this bug is **invisible to measurement**. The escaping element sits at
document x≈390 — almost exactly `innerWidth` — so `scrollWidth` and `innerWidth`
agree, or disagree by an amount inside the noise. The board passes the mandated
gate while shipping a page that scrolls sideways on every narrower phone. Only
adding a 320 column to the measurement surfaced it, and the 390 number in the
bug report is a coincidence of the table's width, not a constant: any overflow
whose offset lands near the tested viewport width vanishes at exactly that width.

A single required width is a **spot check, not a bound**. The requirement is
"the page never scrolls sideways", and one sample cannot establish it — least of
all the sample the failure happens to hide behind.

It is also invisible to the *eye* at every width. A screenshot at 320px shows a
correct-looking board; the only symptom is that the page can be dragged. The
element causing it renders nothing. Screenshot review, the normal form of the
mobile gate, could never have caught this.

## Prevention

- **`sr-only` and every visually-hidden utility is absolutely positioned.**
  Inside a scroll container, a clipped region, or anything with `overflow`
  other than `visible`, it needs a positioned ancestor — otherwise its
  containing block is the document, it escapes the clip, and it is laid out at
  its static position in *document* coordinates. Wrap it in `relative` at the
  point of use, and say in a comment that the wrapper is load-bearing.
- **Measure, do not look.** Assert `document.documentElement.scrollWidth <=
  window.innerWidth`. A screenshot cannot show an overflow caused by an element
  that draws nothing, and 3px of page drag is invisible in a thumbnail.
- **Test the NARROWEST width you support as well as the mandated one.** An
  overflow whose offset happens to sit near the viewport width disappears at
  exactly that width. Two widths (320 and 390 here) turn a coincidence into a
  contradiction; one width can be silently satisfied by the bug itself.
- **Re-run the viewport gate after ACCESSIBILITY changes, not only after layout
  changes.** `sr-only`, `aria-hidden` wrappers, skip links, live regions and
  focus outlines are all positioning or box changes wearing a semantic label. A
  diff that adds no layout classes can still move the page.
- When a hidden element must exist inside a scroller, prefer attaching the text
  to an element that is already in flow (an `aria-label`, or visible text) over
  adding a positioned box — the safest visually-hidden span is the one you did
  not need.
