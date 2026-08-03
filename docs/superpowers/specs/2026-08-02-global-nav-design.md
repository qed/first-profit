# Global persistent nav bar — design

Date: 2026-08-02
Status: approved (brainstorm in-session; approach A chosen by user)

## Goal

One persistent nav bar on every page of firstprofit.school — landing, login,
signup, onboarding, and the game itself. It is the constant top chrome of the
product; full-screen mobile overlays may cover it.

## Approach (A)

A single `GlobalNav` component mounted once in `App.tsx`'s `StageRouter`,
ABOVE the stage render, for every stage except `boot`. Because it sits above
the stage switch it never remounts across stage changes.

## Component: `src/components/GlobalNav.tsx`

- Left: `LogoMark` + "FIRST PROFIT" wordmark.
  - Logged out: clicking it dispatches `SET_STAGE landing` (a way home).
  - Logged in: inert (a kid cannot accidentally leave the game).
- Right:
  - Logged-out stages, except `login` itself: a "Log in" link (dispatches
    `SET_STAGE login`). On the `login` stage the right side is empty.
  - Logged-in stages (`onboard`, `app`): the child's handle (from
    `useGame().profile`) + a "Log out" button (calls `logout()`).
- Sticky `top-0 z-40`, ~52px tall, `bg-[hsl(40_30%_99%)]` with the existing
  hairline border-bottom `border-[hsl(40_14%_89%)]`; all controls
  `min-h-[44px]`; Tailwind mobile-first with `sm:` refinements.

## Mounting

`StageRouter` renders `<GlobalNav />` above the stage component for every
stage except `boot` (the loading spinner stays chrome-free).

Full-screen mobile overlays (Step Runner, Celebration, room dialogs, mock
checkout) use `fixed inset-0` at higher z-index and therefore cover the nav —
chosen behavior. Desktop floating dialogs leave it visible.

## Knock-on changes

- `Landing.tsx` drops its bespoke `<nav>` (logo + Start Building). Start
  Building remains in the hero and the bottom CTA section; the global nav
  contributes "Log in" — an affordance the landing previously lacked.
- `Hud.tsx` drops its "Log out" button — that action moves to the nav. The
  rest of the HUD (identity, save status, totals) is unchanged.
- `MobilePath` bottom padding (`pb-80`) and both floor layouts are untouched:
  the nav adds height only at the top of normal document flow.

## Testing

- New `GlobalNav` tests: logged-out shows Log in (except on `login` stage),
  logged-in shows handle + Log out wired to `logout()`, wordmark stage
  routing, 44px tap targets, no em dashes.
- Update `Hud` tests (logout gone) and `Landing` tests (inline nav gone).
- Mobile acceptance: screenshots at ~390px and desktop for landing, login,
  and the game floor.
