/**
 * The promotion screen (Unit 8 Tier C2; origin R7 "smallest honest version").
 *
 * Shown when the child taps the coach's "Make it your business" CTA or the
 * Grow card's promotion affordance — i.e. when an idea has completed Validate
 * (3.5) and no active business exists. It lists ONLY eligible ideas
 * (Validate-complete, with a stable id), so the reducer's refusal states are
 * unreachable by construction; `promoteIdea`'s refusal boolean is still
 * handled gracefully (re-render from live state, never an error at the kid —
 * a concurrent tab may have promoted first).
 *
 * Overlay conventions (CLAUDE.md two-breakpoint rule): full-screen below sm,
 * floating dialog from sm up; aria-modal, Escape-to-close, focus trap.
 * OPEN-STATE lives in screens/Factory (useState beside walkTo/floorView),
 * NOT the gameCore reducer: it is pure UI intent — no reducer action ever
 * needs to open or close it (unlike the runner/celebration, which the
 * reducer itself opens) — and Factory sits above the breakpoint conditional
 * mount, so the state survives the lg swap exactly like walkTo does.
 *
 * After a successful promotion the screen turns into a celebrate-lite
 * confirmation; closing it lands on the floor where the coach now targets 4.1.
 */
import { useEffect, useRef, useState } from "react";
import { useGame } from "../state/GameContext";
import { activeBusiness, activeBusinessExists, isPhaseComplete } from "../state/gameCore";
import { phaseById } from "../data/path";
import { ideaSummaryName } from "../state/floorSelectors";
import { useFocusTrap } from "../lib/useFocusTrap";

export function PromoteBusiness({ open, onClose }: { open: boolean; onClose: () => void }) {
  const game = useGame();
  const { ideas, promoteIdea, dispatch } = game;
  const panelRef = useRef<HTMLDivElement>(null);
  // What the one allowed confirm of this open session did: "promoted" shows
  // the celebrate-lite confirmation; "refused" re-renders the list from live
  // state (nothing errors at the kid). The promoted idea's NAME is derived at
  // render time from the POST-dispatch truth (activeBusiness), never from an
  // optimistic index (unit review FIX 6).
  const [fired, setFired] = useState<"idle" | "promoted" | "refused">("idle");
  // Synchronous double-confirm guard (unit review FIX 6): flips BEFORE
  // promoteIdea runs, so a rapid double-tap (same row or cross-row) in one
  // event-loop burst can dispatch at most ONE promotion. Re-armed only on the
  // open transition — once fired, every confirm stays dead for this session.
  const confirmingRef = useRef(false);

  // Reset + focus ONLY on the open transition. Deliberately keyed on `open`
  // alone: the parent recreates `onClose` every render, and depending on it
  // here would re-run this effect after the promotion dispatch re-renders
  // Factory, wiping the celebrate-lite state back to the list.
  useEffect(() => {
    if (!open) return;
    confirmingRef.current = false;
    setFired("idle");
    panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useFocusTrap(panelRef, open);

  if (!open) return null;

  const grow = phaseById("grow");
  const eligible = activeBusinessExists(game)
    ? []
    : ideas
        .map((_, i) => i)
        .filter((i) => Boolean(ideas[i].id) && isPhaseComplete(game, i, "validate"));

  // The RETURNED truth (unit review FIX 6): the celebrate-lite heading names
  // the idea the ACTIVE business was actually promoted from — read from live
  // post-dispatch state, so a raced/refused second confirm can never put the
  // wrong idea's name on the confirmation.
  const promotedBusiness = fired === "promoted" ? activeBusiness(game) : null;
  const promotedIdeaIndex = promotedBusiness
    ? ideas.findIndex((i) => i.id === promotedBusiness.ideaId)
    : -1;

  const confirm = (ideaIndex: number) => {
    // Synchronous guard BEFORE the dispatch: a second tap in the same burst
    // (React state hasn't re-rendered the disabled buttons yet) no-ops here.
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    if (promoteIdea(ideaIndex)) {
      setFired("promoted");
      // Make the new business the working context so the floor, coach, and
      // runner all point at 4.1 for it the moment this screen closes.
      dispatch({ type: "SET_ACTIVE_IDEA", ideaIndex });
    } else {
      // Refused (e.g. another tab promoted first): re-render from live state
      // (the eligible list re-derives; nothing errors at the kid). The guard
      // stays down — refusals are state-deterministic, not transient, and the
      // list below now reflects why.
      setFired("refused");
    }
  };

  return (
    <div className="fixed inset-0 z-[55] flex bg-[hsl(25_34%_20%/0.55)] sm:items-center sm:justify-center sm:p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Make it your business"
        tabIndex={-1}
        className="fp-rise flex h-full w-full flex-col overflow-y-auto bg-[hsl(40_55%_97%)] outline-none sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-full sm:max-w-[560px] sm:rounded-3xl sm:border-2 sm:border-[hsl(25_34%_20%/0.15)] sm:shadow-[0_8px_0_rgba(120,80,40,.1)]"
        style={{ animation: "fp-rise .3s cubic-bezier(.22,1,.36,1) both" }}
      >
        {promotedBusiness && promotedIdeaIndex >= 0 ? (
          // ── Celebrate-lite confirmation ─────────────────────────────────
          <div className="flex flex-1 flex-col justify-center px-6 py-9 text-center sm:flex-none">
            <span
              className="fp-stamp mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl"
              style={{
                background: grow.wash,
                border: `2px solid ${grow.accent}`,
                animation: "fp-stamp .6s cubic-bezier(.34,1.56,.64,1) both",
              }}
              aria-hidden
            >
              🏢
            </span>
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.25em]" style={{ color: grow.text }}>
              It is official
            </p>
            <h2 className="mt-2 font-display text-[26px] font-black leading-[1.15] text-[hsl(25_34%_20%)]">
              {ideaSummaryName(game, promotedIdeaIndex)} is now your business
            </h2>
            <p className="mt-2 text-[14px] leading-[1.6] text-[hsl(25_20%_38%)]">
              Phase 4 · Grow is open. First stop: your first $1,000 in sales.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 inline-flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-verified px-5 font-display text-base font-bold text-white shadow-[0_5px_0_hsl(150_52%_26%)]"
            >
              Let&apos;s grow it →
            </button>
          </div>
        ) : (
          // ── Eligible-idea list + explicit confirm ───────────────────────
          <>
            <header className="flex items-start justify-between gap-4 border-b-2 border-[hsl(25_34%_20%/0.1)] px-5 py-4 sm:px-6" style={{ background: grow.wash }}>
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: grow.text }}>
                  Phase 4 · Grow
                </p>
                <h2 className="mt-1 font-display text-xl font-black leading-tight text-[hsl(25_34%_20%)]">
                  Make it your business
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Back to the floor"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_55%_97%)] text-sm text-[hsl(25_34%_20%)] hover:border-[hsl(25_34%_20%/0.4)]"
              >
                ✕
              </button>
            </header>
            <div className="px-5 pb-7 pt-5 sm:px-6">
              <p className="text-[14px] leading-[1.6] text-[hsl(25_20%_38%)]">
                You proved this idea works. Pick the one you want to grow for real. Your other
                ideas stay right where they are, and you can keep playing them through Sell,
                Build and Validate any time.
              </p>
              {eligible.length === 0 ? (
                <p className="mt-4 rounded-2xl border-2 border-dashed border-[hsl(25_34%_20%/0.15)] bg-[hsl(25_34%_20%/0.02)] px-4 py-4 text-[13px] text-[hsl(25_20%_38%)]">
                  Finish Validate with one of your ideas first. Then it can become your business.
                </p>
              ) : (
                <div className="mt-4 flex flex-col gap-2.5">
                  {eligible.map((n) => (
                    <div
                      key={ideas[n].id ?? n}
                      className="flex flex-col gap-2.5 rounded-2xl border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-4 py-3.5"
                    >
                      <div>
                        <span className="font-mono text-[11px] font-bold" style={{ color: grow.text }}>
                          Idea #{n + 1}
                        </span>
                        <span className="mt-0.5 block text-[13.5px] leading-[1.4] text-[hsl(25_34%_20%)]">
                          {ideaSummaryName(game, n)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => confirm(n)}
                        // Dead after the one allowed confirm of this open
                        // session (unit review FIX 6) — the sync guard above
                        // covers the same-burst race this render lags behind.
                        disabled={fired !== "idle"}
                        className="inline-flex min-h-[48px] items-center justify-center rounded-xl px-4 font-display text-[15px] font-bold text-white transition hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
                        style={{ background: grow.ctaFill, boxShadow: `0 4px 0 ${grow.ctaShadow}` }}
                      >
                        Make this my business
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={onClose}
                className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl border-2 border-[hsl(25_34%_20%/0.2)] px-5 font-display text-sm font-bold text-[hsl(25_34%_20%)] hover:border-[hsl(25_34%_20%/0.5)]"
              >
                Not yet
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
