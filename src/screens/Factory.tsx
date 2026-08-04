/**
 * The top-level `app` surface (handoff §H). This screen OWNS the pieces of
 * UI intent that must outlive the desktop/mobile variant swap at lg:
 *
 *   - `walkTo`  : the WalkIntent a card tap wants to run once the avatar arrives.
 *   - `floorView`: phases | a phase id (which sub-floor is showing).
 *   - `promoteOpen` / `switcherOpen`: the TWO Factory-owned overlays — the
 *     PromoteBusiness screen and the idea SwitcherDialog. Their open-state is
 *     pure UI intent no reducer action ever needs to drive, so it lives in
 *     useState HERE rather than gameCore. That placement is swap-safe because
 *     Factory itself NEVER unmounts across the lg breakpoint — only
 *     FactoryFloor's two variants below it swap — so this state (like walkTo)
 *     survives a mid-interaction viewport crossing.
 *
 * All of it lives above <FactoryFloor/>'s matchMedia conditional mount, per
 * docs/solutions/ui-bugs/breakpoint-crossing-drops-navigation (BINDING). Card
 * taps flow: card → onWalk(intent) → setWalkTo → the mounted variant animates and
 * calls onArrived(intent) → we run the action and clear walkTo (at-least-once).
 * Crossing lg mid-walk cancels the old variant's timer but not the intent, so the
 * new variant's effect resumes it. Arrival is RACE-PROOF (unit review FIX 1):
 * the variants call arrival through a ref-backed stable wrapper, so the action
 * always computes against LIVE state (never the closure captured when the walk
 * started), onBack and an idea switch both CANCEL an in-flight walk
 * (walkTo → null; the variants' effect cleanup clears their timer), and the
 * kid's explicit switch always wins over a pending arrival.
 *
 * Dialog / runner / picker / celebration open-state lives in the gameCore reducer
 * (in the provider, above everything), so those already survive the swap; we just
 * render them here. While ANY overlay is open (reducer overlays + the two
 * Factory-owned ones) the floor container is `inert` and the floating helpers
 * (coach, GradeAsk) hide, so nothing behind a modal scrim can catch taps or
 * tab focus. Idea identity lives in the GlobalNav's chip (App-level), not here.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { useGame } from "../state/GameContext";
import { TOMBSTONE_CAP } from "../state/gameCore";
import { isPublicSiteEnabled } from "../config";
import { firstIncompleteTaskIndex, ideaOneLiner, ideaProgressLabel, ideaSummaryName, NAMING_STEP_ID, nextCoachTarget, roomEntryFor } from "../state/floorSelectors";
import { stepById, type RoomId } from "../data/path";
import { FIELD_HOOKS } from "../data/pathHooks";
import { SITE_ONE_LINER_MAX_CHARS } from "../lib/siteCopy";
import { FactoryFloor, type FloorView, type WalkIntent } from "../components/FactoryFloor";
import { StepRunner } from "../components/StepRunner";
import { Celebration } from "../components/Celebration";
import { GradeAsk } from "../components/GradeAsk";
import { PromoteBusiness } from "../components/PromoteBusiness";
import { ImproveAppModal } from "../components/ImproveAppModal";
import { useFocusTrap } from "../lib/useFocusTrap";
import { YourSite } from "../components/rooms/YourSite";
import { CheckoutBooth } from "../components/rooms/CheckoutBooth";
import { SalesRoom } from "../components/rooms/SalesRoom";
import { IdeaRoom } from "../components/rooms/IdeaRoom";

/** Room-id → dialog chrome (sign / name / tagline) + body. Only these four fpv2
 *  rooms have real surfaces in Slice A; any other RoomId is inert (no dialog). */
const ROOM_META: Partial<Record<RoomId, { sign: string; name: string; tagline: string; Body: () => React.JSX.Element }>> = {
  website: { sign: "🌐", name: "Your Site", tagline: "Your real page on the internet.", Body: YourSite },
  checkout: { sign: "💳", name: "The Checkout Booth", tagline: "Your checkout page opens when you have a product and a price.", Body: CheckoutBooth },
  market: { sign: "🛒", name: "The Sales Room", tagline: "Strangers, asks, yeses and nos.", Body: SalesRoom },
  idea: { sign: "💡", name: "The Idea Room", tagline: "Pick one thing to sell. Say it in a sentence.", Body: IdeaRoom },
};

function Modal({ children, onClose, label }: { children: React.ReactNode; onClose?: () => void; label: string }) {
  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-[hsl(25_34%_20%/0.55)] p-4"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
    >
      <div
        className="fp-rise w-full max-w-[560px] overflow-hidden rounded-[24px] border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_55%_97%)] shadow-[0_8px_0_rgba(120,80,40,.1)]"
        style={{ animation: "fp-rise .3s cubic-bezier(.22,1,.36,1) both" }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The room dialog (handoff §Rooms): Your Site / Checkout Booth / Sales Room / Idea
 * Room. One shared shell (full-screen below sm, floating from sm — the overlay
 * breakpoint, matching StepRunner/RoomShell), aria-modal, Escape-to-close, focus
 * on open; the body is the room-specific component. Reduced-motion zeroes fp-rise
 * in src/index.css.
 */
function RoomDialog() {
  const { room, dispatch } = useGame();
  const panelRef = useRef<HTMLDivElement>(null);
  const open = Boolean(room && ROOM_META[room]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "CLOSE_ROOM" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dispatch]);

  useFocusTrap(panelRef, open);

  if (!room) return null;
  const meta = ROOM_META[room];
  if (!meta) return null;
  const { sign, name, Body } = meta;
  // Truthful chrome (Unit 6, R19; flag-independent since the room-link change):
  // the website room's tagline is state-neutral in EVERY build because the room
  // body now reflects the real registry state (live / going live / offline /
  // unclaimed) regardless of the flag. The old mock tagline is gone entirely.
  const tagline = meta.tagline;
  const close = () => dispatch({ type: "CLOSE_ROOM" });

  return (
    <div className="fixed inset-0 z-[55] flex bg-[hsl(25_34%_20%/0.55)] sm:items-center sm:justify-center sm:p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={name}
        tabIndex={-1}
        className="fp-rise flex h-full w-full flex-col overflow-y-auto bg-[hsl(40_55%_97%)] outline-none sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-full sm:max-w-[620px] sm:rounded-3xl sm:border-2 sm:border-[hsl(25_34%_20%/0.15)] sm:shadow-[0_8px_0_rgba(120,80,40,.1)]"
        style={{ animation: "fp-rise .3s cubic-bezier(.22,1,.36,1) both" }}
      >
        <header className="flex items-center justify-between gap-4 border-b-2 border-[hsl(25_34%_20%/0.1)] px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="text-[22px]" aria-hidden>
              {sign}
            </span>
            <div className="min-w-0">
              <h2 className="truncate font-display text-[19px] font-black text-[hsl(25_34%_20%)]">{name}</h2>
              <p className="truncate text-xs text-[hsl(25_20%_38%)]">{tagline}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Back to the floor"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_55%_97%)] text-sm text-[hsl(25_34%_20%)] hover:border-[hsl(25_34%_20%/0.4)]"
          >
            ✕
          </button>
        </header>
        <div className="px-5 pb-7 pt-5 sm:px-6">
          <Body />
        </div>
      </div>
    </div>
  );
}

/** "Which idea?" picker (handoff Multi-idea model). Small but fully functional. */
function PickerDialog() {
  const game = useGame();
  const { pickFor, ideasEligibleFor, dispatch } = game;
  if (!pickFor) return null;
  const eligible = ideasEligibleFor(pickFor);
  const close = () => dispatch({ type: "SET_PICK_FOR", pickFor: null });
  const choose = (ideaIndex: number) => {
    dispatch({ type: "SET_ACTIVE_IDEA", ideaIndex });
    dispatch({ type: "OPEN_RUNNER", stepId: pickFor, index: firstIncompleteTaskIndex(game, ideaIndex, pickFor) ?? 0 });
    close();
  };
  return (
    <Modal label="Which idea?" onClose={close}>
      <div className="px-6 py-7">
        <h2 className="font-display text-xl font-black text-[hsl(25_34%_20%)]">Which idea?</h2>
        <p className="mt-1 text-[13px] text-[hsl(25_20%_38%)]">Pick the product you are working on for {pickFor}.</p>
        <div className="mt-4 flex flex-col gap-2">
          {eligible.map((n) => {
            // Product name first and foremost (ideaSummaryName prefers it); the
            // one-liner drops to a secondary line when a name exists.
            const name = ideaSummaryName(game, n);
            const oneLiner = ideaOneLiner(game, n);
            const showLiner = oneLiner.length > 0 && oneLiner !== name;
            return (
              <button
                key={n}
                type="button"
                onClick={() => choose(n)}
                className="flex min-h-[48px] flex-col rounded-2xl border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-4 py-3 text-left hover:border-sell"
              >
                <span className="font-mono text-[11px] font-bold text-[hsl(14_78%_44%)]">Idea #{n + 1}</span>
                <span className="text-[13px] font-bold text-[hsl(25_34%_20%)]">{name}</span>
                {showLiner && <span className="text-[12px] text-[hsl(25_20%_38%)]">{oneLiner}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

/**
 * The bottom-docked Next Step coach: one green button that walks the founder to
 * whatever comes next (first idea → the Idea Room; the room of the next
 * incomplete criterion — any phase, for the active idea or the promoted
 * business; or the promotion screen when an idea finished Validate and no
 * business exists). Routes through onWalk so the walk animation and the
 * breakpoint-swap survival contract apply exactly as for a card tap. Hidden
 * while any overlay is open (it would sit behind the scrim but still catch tab
 * focus) and once the whole path is done.
 *
 * Exported for the component test suite; only Factory mounts it.
 */
export function NextStepCoach({
  onWalk,
  overlayOpen,
}: {
  onWalk: (intent: WalkIntent) => void;
  /** Factory's lifted anyOverlayOpen (unit review FIX 5): includes the two
   *  Factory-owned overlays (promote/switcher) the reducer knows nothing of. */
  overlayOpen?: boolean;
}) {
  const game = useGame();
  // ── One-shot claim hint (real-public-site plan, Unit 6; R13/R16). With the
  // public site enabled, a HANDLE-LESS established account (status "none" from
  // the registry read-back, and at least one idea — a brand-new account's
  // first-task guidance is never preempted) is pointed at the Your Site room
  // ONCE: the coach button targets the room through the same onWalk intent
  // channel as every other coach action (no new interstitial machinery). The
  // hint is CONSUMED the moment the room opens by ANY route (this button, a
  // pod tap), then the coach reverts to normal next-step guidance for the
  // session — claiming stays an invitation, never a gate. In-memory only (the
  // gradeAskDone precedent): it reappears next session while the account
  // remains handle-less. `unknown` (failed read) deliberately shows NO hint —
  // never nudge a claim on state we could not confirm.
  const [siteHintUsed, setSiteHintUsed] = useState(false);
  const roomOpen = game.room;
  useEffect(() => {
    if (roomOpen === "website") setSiteHintUsed(true);
  }, [roomOpen]);
  if (overlayOpen || game.runnerOpen || game.room || game.celebrate || game.pickFor) return null;

  // "none" → invite the claim; "claimed" → the go-live never landed (a parked
  // completion flush, Unit 7 review P2: without a nudge back to the room —
  // whose open retries flush→publish — a stuck-'claimed' account had no route
  // to live, ever). Same one-shot mechanics, different copy per state.
  const siteHintStatus = game.site?.status;
  const siteHint =
    isPublicSiteEnabled() &&
    !siteHintUsed &&
    (siteHintStatus === "none" || siteHintStatus === "claimed") &&
    game.ideas.length > 0;
  if (siteHint) {
    const roomName = ROOM_META.website?.name ?? "Your Site";
    return (
      <CoachButton
        label={
          siteHintStatus === "claimed"
            ? `Finish making your page live in ${roomName}`
            : `Claim your page in ${roomName}`
        }
        onClick={() => onWalk({ kind: "openRoom", room: "website" })}
      />
    );
  }

  const target = nextCoachTarget(game);
  if (!target) return null;

  // The promotion seam (Unit 8 Tier C2): the CTA opens the PromoteBusiness
  // screen via the same walk/intent channel as every other coach action.
  const label =
    target.kind === "promote"
      ? "Make it your business!"
      : target.kind === "create"
        ? `Take me to ${ROOM_META.idea?.name ?? "The Idea Room"}`
        : `Take me to ${stepById(target.stepId)?.roomName ?? "your next room"}`;
  const intent: WalkIntent =
    target.kind === "promote"
      ? { kind: "openPromote" }
      : target.kind === "create"
        ? { kind: "createIdea" }
        : { kind: "enterCriterion", stepId: target.stepId };

  return <CoachButton label={label} onClick={() => onWalk(intent)} />;
}

/** The coach's docked green button chrome, shared by the normal next-step
 *  target and the Unit 6 one-shot claim hint (identical markup either way).
 *  Positioning note (Change #9): the button no longer carries its own absolute
 *  dock — Factory owns ONE bottom-right dock (see CoachDock) that stacks the
 *  blue Improve First Profit CTA above this green button, so the pair can
 *  never overlap and both stay tappable at every viewport. */
function CoachButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pointer-events-auto flex min-h-[52px] items-center gap-3 rounded-2xl bg-verified px-5 py-3 text-left text-white shadow-[0_6px_0_hsl(150_52%_26%)] transition hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[0_3px_0_hsl(150_52%_26%)] focus:outline-none focus-visible:ring-4 focus-visible:ring-verified/40"
    >
      <span>
        <span className="block font-display text-lg font-black leading-none">Next Step</span>
        <span className="mt-1 block font-mono text-[10px] uppercase tracking-wider text-white/85">
          {label}
        </span>
      </span>
      <span aria-hidden className="text-xl">
        →
      </span>
    </button>
  );
}

/**
 * The compact blue "Improve First Profit" CTA (Change #9): the secondary,
 * always-available suggestion entry point on EVERY floor view (phases overview
 * and each criterion floor, mobile and desktop). Rendered inside Factory's
 * shared bottom-right dock directly ABOVE the green coach; hidden while any
 * overlay is open, exactly like the coach. Blue = the house `build` token
 * (hsl(217 74% 56%)), white text, >= 44px target.
 */
function ImproveFpCta({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      data-testid="fp-improve-cta"
      onClick={onOpen}
      className="pointer-events-auto inline-flex min-h-[44px] items-center rounded-xl bg-build px-4 font-display text-sm font-bold text-white shadow-[0_4px_0_hsl(217_74%_36%)] transition hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[0_2px_0_hsl(217_74%_36%)] focus:outline-none focus-visible:ring-4 focus-visible:ring-build/40"
    >
      Improve First Profit
    </button>
  );
}

/**
 * The idea-switcher dialog (Unit 8; origin IA decision): the Path shows the
 * ACTIVE idea, and this dialog is the one-tap route to any other. It reuses
 * the existing picker pattern (Modal + idea rows) but lists EVERY idea — a
 * switch is SET_ACTIVE_IDEA only; entry into a criterion stays with the
 * floor cards/coach, which now target any built phase for the newly active
 * idea. Exported for the component test suite; only Factory mounts it.
 */
export function SwitcherDialog({
  open,
  onClose,
  onSwitched,
}: {
  open: boolean;
  onClose: () => void;
  /** Fired on an explicit idea choice (unit review FIX 1c): Factory cancels
   *  any in-flight walk here — the kid's switch wins over a pending arrival. */
  onSwitched?: () => void;
}) {
  const game = useGame();
  const { ideas, activeIdea, dispatch } = game;
  if (!open) return null;
  const choose = (ideaIndex: number) => {
    onSwitched?.();
    dispatch({ type: "SET_ACTIVE_IDEA", ideaIndex });
    onClose();
  };
  return (
    <Modal label="Switch idea" onClose={onClose}>
      <div className="px-6 py-7">
        <h2 className="font-display text-xl font-black text-[hsl(25_34%_20%)]">Switch idea</h2>
        <p className="mt-1 text-[13px] text-[hsl(25_20%_38%)]">
          The Path shows one idea at a time. Which one are you working on?
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {ideas.map((_, n) => (
            <button
              key={n}
              type="button"
              onClick={() => choose(n)}
              className="flex min-h-[48px] flex-col rounded-2xl border-2 bg-white px-4 py-3 text-left hover:border-sell"
              style={{ borderColor: n === activeIdea ? "hsl(14 78% 54%)" : "hsl(25 34% 20% / .15)" }}
            >
              <span className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-bold text-[hsl(14_78%_44%)]">Idea #{n + 1}</span>
                {n === activeIdea ? (
                  <span className="rounded-full bg-[hsl(14_78%_54%/0.12)] px-2 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[0.06em] text-[hsl(14_78%_44%)]">
                    current
                  </span>
                ) : null}
              </span>
              <span className="text-[13px] text-[hsl(25_34%_20%)]">{ideaSummaryName(game, n)}</span>
              <span className="font-mono text-[9px] text-[hsl(25_20%_38%)]">{ideaProgressLabel(game, n)}</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/**
 * Cap for the product name input in the idea summary dialog below. The
 * productName field has no dedicated cap constant anywhere else (the runner
 * uses its generic 2000-char input cap), so the dialog's cap lives HERE,
 * right beside the field it governs. 60 keeps the name comfortably inside
 * every summary surface (cards truncate at 42 for display).
 */
export const IDEA_NAME_MAX_CHARS = 60;

/**
 * The idea summary dialog (2026-08-03 rule 2; edit-in-place rework same day):
 * tapping a FILLED slot in the Sell floor's "Your Ideas" row opens THIS
 * summary instead of path entry.
 *
 * READ MODE by default: the name and the one-liner render as fully-wrapping
 * text bubbles (never truncated here — cards elsewhere truncate for handoff),
 * with muted kid-friendly placeholders when empty. Each section has a pencil
 * icon button (lucide, the Login.tsx eye-toggle convention) that flips JUST
 * that section into an input. NOTHING writes until the learner presses Save:
 * the Save CTA exists only while a draft differs from the stored value,
 * docked bottom-right. Save commits the changed field(s) via SET_FIELD with
 * the EXPLICIT ideaIndex (never assumed active) plus ONE flushNow (the Step
 * Runner's public-page freshness discipline — both strings reach the live
 * public page through the projection), then returns to read mode. The X (and
 * Escape, same semantics) always closes and simply discards unsaved drafts —
 * they are local state, and the dialog remounts fresh per open. Naming here
 * also moves the coach off 1.1.1 (floorSelectors.ideaNeedsNaming re-derives).
 *
 * Shell matches the other overlays: full-screen below sm, floating dialog
 * from sm up. Open-state lives in Factory's useState (above the breakpoint
 * conditional, like promoteOpen/switcherOpen). Exported for the test suite;
 * only Factory mounts it.
 */
export function IdeaSummaryDialog({
  ideaIndex,
  onClose,
}: {
  ideaIndex: number;
  onClose: () => void;
}) {
  const game = useGame();
  const { dispatch } = game;
  const panelRef = useRef<HTMLDivElement>(null);
  const idea = game.ideas[ideaIndex];
  const storedName = idea?.fields.productName ?? "";
  const storedLiner = idea?.fields.oneLiner ?? "";
  const [name, setName] = useState(storedName);
  const [liner, setLiner] = useState(storedLiner);
  const [editingName, setEditingName] = useState(false);
  const [editingLiner, setEditingLiner] = useState(false);
  // Delete flow (Change #7): idle → inline confirm → type-to-confirm. All
  // local state; closing the dialog (X or Escape) cancels the whole flow.
  const [deleteStage, setDeleteStage] = useState<"idle" | "confirm" | "type">("idle");
  const [deleteText, setDeleteText] = useState("");
  const [deleteRefused, setDeleteRefused] = useState<"business" | "cap" | null>(null);

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useFocusTrap(panelRef, true);

  if (!idea) return null;

  // Labels/placeholders come from the SAME authored field hooks the Step
  // Runner renders for 1.1, so the two edit surfaces always read alike.
  const namingFields = FIELD_HOOKS[NAMING_STEP_ID] ?? [];
  const nameMeta = namingFields.find((f) => f.key === "productName");
  const linerMeta = namingFields.find((f) => f.key === "oneLiner");

  // Dirty = a draft differs from the stored value. The Save CTA exists ONLY
  // then; committing (below) makes stored catch up, so it disappears again.
  const dirty = name !== storedName || liner !== storedLiner;

  /** Dispatch SET_FIELD for THIS idea if the draft differs; true when it did. */
  const commitField = (key: "productName" | "oneLiner", value: string): boolean => {
    if ((idea.fields[key] ?? "") === value) return false;
    dispatch({ type: "SET_FIELD", ideaIndex, key, value });
    return true;
  };
  /** Save is the ONLY writer (no blur commits): changed field(s) + one flush,
   *  then back to read mode. flushNow is optional-called defensively — test
   *  harnesses that stub the context may omit it. */
  const save = () => {
    const changedName = commitField("productName", name);
    const changedLiner = commitField("oneLiner", liner);
    if (changedName || changedLiner) void game.flushNow?.();
    setEditingName(false);
    setEditingLiner(false);
  };

  // The delete affordance is HIDDEN for an idea referenced by ANY business
  // record — ARCHIVED included (deleting one would orphan the record and
  // deadlock unarchive; the reducer refuses too) — and for an id-less legacy
  // idea (nothing to tombstone this session). Belt-and-suspenders both ways.
  const belongsToBusiness = (game.businesses ?? []).some((b) => b.ideaId === idea.id);
  const canOfferDelete = Boolean(idea.id) && !belongsToBusiness;
  // Type-to-confirm gate: the child's first name, case-insensitive, trimmed.
  // Some accounts carry an EMPTY firstName (the profile can arrive blank); an
  // empty required word would make the gate pass instantly, so fall back to
  // requiring the word DELETE instead.
  const requiredWord = (game.profile?.firstName ?? "").trim() || "DELETE";
  const usesNameGate = Boolean((game.profile?.firstName ?? "").trim());
  const typedOk = deleteText.trim().toLowerCase() === requiredWord.toLowerCase();

  const resetDeleteFlow = () => {
    setDeleteStage("idle");
    setDeleteText("");
    setDeleteRefused(null);
  };
  const confirmDelete = () => {
    if (!idea.id || !typedOk) return;
    // deleteIdea dispatches + kicks a flush and answers honestly (the
    // promoteIdea refusal pattern). Optional-called defensively for stubbed
    // test contexts. A refusal shows the fitting kid-friendly note instead of
    // closing: the tombstone cap being full, or the idea having become a
    // business's in another tab mid-flow.
    if (game.deleteIdea?.(idea.id)) {
      onClose();
      return;
    }
    const capFull =
      (game.deletedIdeaIds?.length ?? 0) >= TOMBSTONE_CAP &&
      !(game.deletedIdeaIds ?? []).includes(idea.id);
    setDeleteRefused(capFull ? "cap" : "business");
  };

  const sectionLabel =
    "mb-1.5 block font-mono text-[10.5px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]";
  const bubble =
    "min-h-[44px] flex-1 whitespace-normal break-words rounded-[10px] border-2 border-[hsl(25_34%_20%/0.12)] bg-white px-3.5 py-3 text-sm leading-relaxed";
  const inputClass =
    "w-full rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-3.5 py-3 text-sm text-[hsl(25_34%_20%)] outline-none focus:border-sell";
  const editButton =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_55%_97%)] text-[hsl(25_20%_38%)] hover:border-[hsl(25_34%_20%/0.4)] hover:text-[hsl(25_34%_20%)]";

  return (
    <div className="fixed inset-0 z-[55] flex bg-[hsl(25_34%_20%/0.55)] sm:items-center sm:justify-center sm:p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Idea #${ideaIndex + 1}`}
        tabIndex={-1}
        className="fp-rise flex h-full w-full flex-col overflow-y-auto bg-[hsl(40_55%_97%)] outline-none sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-full sm:max-w-[560px] sm:rounded-3xl sm:border-2 sm:border-[hsl(25_34%_20%/0.15)] sm:shadow-[0_8px_0_rgba(120,80,40,.1)]"
        style={{ animation: "fp-rise .3s cubic-bezier(.22,1,.36,1) both" }}
      >
        <header className="flex items-start justify-between gap-4 border-b-2 border-[hsl(25_34%_20%/0.1)] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[hsl(14_78%_44%)]">
              Idea #{ideaIndex + 1}
            </p>
            <h2 className="mt-1 font-display text-xl font-black leading-tight text-[hsl(25_34%_20%)]">
              {ideaSummaryName(game, ideaIndex)}
            </h2>
            <p className="mt-1 font-mono text-[10px] text-[hsl(25_20%_38%)]">
              {ideaProgressLabel(game, ideaIndex)}
            </p>
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

        <div className="flex flex-1 flex-col px-5 pb-7 pt-5 sm:px-6">
          {/* ── Name ─────────────────────────────────────────────────── */}
          {editingName ? (
            <>
              <label htmlFor="fp-idea-summary-name" className={sectionLabel}>
                {nameMeta?.label ?? "Product name"}
              </label>
              <input
                id="fp-idea-summary-name"
                maxLength={IDEA_NAME_MAX_CHARS}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={nameMeta?.placeholder}
                autoFocus
                className={`min-h-[44px] ${inputClass}`}
              />
            </>
          ) : (
            <>
              <p className={sectionLabel}>{nameMeta?.label ?? "Product name"}</p>
              <div className="flex items-start gap-2">
                <p
                  data-testid="fp-idea-name-bubble"
                  className={bubble}
                  style={{ color: name ? "hsl(25 34% 20%)" : "hsl(25 34% 20% / .45)" }}
                >
                  {name || "Not named yet"}
                </p>
                <button
                  type="button"
                  aria-label="Edit name"
                  onClick={() => setEditingName(true)}
                  className={editButton}
                >
                  <Pencil size={18} aria-hidden />
                </button>
              </div>
            </>
          )}

          {/* ── One-liner ("idea") ───────────────────────────────────── */}
          {editingLiner ? (
            <>
              <label htmlFor="fp-idea-summary-liner" className={`mt-[18px] ${sectionLabel}`}>
                {linerMeta?.label ?? "Your one-liner"}
              </label>
              <textarea
                id="fp-idea-summary-liner"
                rows={3}
                maxLength={SITE_ONE_LINER_MAX_CHARS}
                value={liner}
                onChange={(e) => setLiner(e.target.value)}
                placeholder={linerMeta?.placeholder}
                autoFocus
                className={`resize-y ${inputClass}`}
              />
              {isPublicSiteEnabled() ? (
                <p className="mt-1.5 text-[12px] text-[hsl(25_20%_38%)]">
                  This goes on your public page. No phone numbers, addresses, or last names.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p className={`mt-[18px] ${sectionLabel}`}>{linerMeta?.label ?? "Your one-liner"}</p>
              <div className="flex items-start gap-2">
                <p
                  data-testid="fp-idea-liner-bubble"
                  className={bubble}
                  style={{ color: liner ? "hsl(25 34% 20%)" : "hsl(25 34% 20% / .45)" }}
                >
                  {liner || "No description yet"}
                </p>
                <button
                  type="button"
                  aria-label="Edit idea"
                  onClick={() => setEditingLiner(true)}
                  className={editButton}
                >
                  <Pencil size={18} aria-hidden />
                </button>
              </div>
            </>
          )}

          {/* Dirty-gated Save: exists only while a draft differs from the
              stored value, docked bottom-right (sticky so it stays reachable
              while the full-screen mobile dialog scrolls). */}
          {dirty ? (
            <div className="pointer-events-none sticky bottom-4 mt-6 flex justify-end">
              <button
                type="button"
                onClick={save}
                className="pointer-events-auto min-h-[48px] rounded-2xl bg-verified px-7 font-display text-lg font-black text-white shadow-[0_5px_0_hsl(150_52%_26%)] transition hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[0_2px_0_hsl(150_52%_26%)] focus:outline-none focus-visible:ring-4 focus-visible:ring-verified/40"
              >
                Save
              </button>
            </div>
          ) : null}

          {/* ── Delete this idea (Change #7) ─────────────────────────────
              A quiet affordance docked bottom-left, hidden for the promoted
              business idea. Two steps: inline confirm, then type-to-confirm
              (first name, case-insensitive; DELETE fallback when the profile
              has no first name). Cancel at every step; X/Escape cancel too. */}
          {canOfferDelete ? (
            <div className="mt-auto flex justify-start pt-8">
              {deleteStage === "idle" ? (
                <button
                  type="button"
                  onClick={() => {
                    setDeleteStage("confirm");
                    setDeleteText("");
                    setDeleteRefused(null);
                  }}
                  className="min-h-[44px] rounded-xl px-2 text-left text-sm font-bold text-[hsl(4_72%_42%)] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(4_72%_42%/0.4)]"
                >
                  Delete this idea
                </button>
              ) : (
                <div className="w-full rounded-[10px] border-2 border-[hsl(4_72%_42%/0.35)] bg-[hsl(4_80%_97%)] p-4">
                  {deleteStage === "confirm" ? (
                    <>
                      <p className="text-sm leading-relaxed text-[hsl(25_34%_20%)]">
                        Delete {storedName || "this idea"}? Everything about this idea goes
                        away forever. This cannot be undone.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={resetDeleteFlow}
                          className="min-h-[44px] rounded-xl border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-5 text-sm font-bold text-[hsl(25_34%_20%)] hover:border-[hsl(25_34%_20%/0.4)]"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteStage("type")}
                          className="min-h-[44px] rounded-xl bg-[hsl(4_72%_42%)] px-5 text-sm font-bold text-white hover:bg-[hsl(4_72%_36%)]"
                        >
                          Continue
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <label
                        htmlFor="fp-idea-delete-confirm"
                        className="block text-sm font-bold text-[hsl(25_34%_20%)]"
                      >
                        {usesNameGate
                          ? "Type your first name to delete."
                          : "Type DELETE to delete."}
                      </label>
                      <input
                        id="fp-idea-delete-confirm"
                        value={deleteText}
                        onChange={(e) => setDeleteText(e.target.value)}
                        autoFocus
                        className={`mt-2 min-h-[44px] ${inputClass}`}
                      />
                      {deleteRefused ? (
                        <p className="mt-2 text-sm text-[hsl(4_72%_42%)]">
                          {deleteRefused === "cap"
                            ? "You have removed a lot of ideas. This one cannot be deleted right now."
                            : "This idea belongs to a business, so it cannot be deleted."}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={resetDeleteFlow}
                          className="min-h-[44px] rounded-xl border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-5 text-sm font-bold text-[hsl(25_34%_20%)] hover:border-[hsl(25_34%_20%/0.4)]"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={confirmDelete}
                          disabled={!typedOk}
                          className="min-h-[44px] rounded-xl bg-[hsl(4_72%_42%)] px-5 text-sm font-bold text-white hover:bg-[hsl(4_72%_36%)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function Factory({
  switcherOpen: controlledSwitcherOpen,
  onSwitcherOpenChange,
}: {
  /** When provided (App threads these), the SwitcherDialog is CONTROLLED by
   *  App-level state — the GlobalNav's idea chip is the opener, and the
   *  open-state lives above the stage render. When absent (test mounts), the
   *  internal useState below keeps the dialog fully self-contained. */
  switcherOpen?: boolean;
  onSwitcherOpenChange?: (open: boolean) => void;
} = {}) {
  const game = useGame();
  const { dispatch } = game;
  const [walkTo, setWalkTo] = useState<WalkIntent | null>(null);
  const [floorView, setFloorView] = useState<FloorView>("phases");
  // Overlay intents owned HERE (not the reducer): pure UI open-state that no
  // reducer action ever needs to drive, held above the breakpoint conditional
  // mount so both survive the lg swap (see PromoteBusiness's doc comment).
  const [promoteOpen, setPromoteOpen] = useState(false);
  // Which idea the summary dialog shows, BY STABLE ID (null = closed). Same
  // placement rule as promoteOpen: Factory never unmounts across lg, so the
  // open-state survives the breakpoint swap; the slots inside CriterionFloor
  // reach it through the SAME onWalk intent channel as every other card tap.
  // IDENTITY, not index (Change #7 review P1): a cross-tab deletion can
  // reindex `ideas` under the open dialog via UNION_REMOTE — an index would
  // silently swap the dialog onto a DIFFERENT idea. The current index is
  // re-resolved from the id on every render, and the dialog closes itself
  // when the id no longer resolves (the idea was deleted remotely).
  const [ideaSummary, setIdeaSummary] = useState<string | null>(null);
  const ideaSummaryIndex =
    ideaSummary !== null ? game.ideas.findIndex((idea) => idea.id === ideaSummary) : -1;
  useEffect(() => {
    // Close the dialog when its idea disappears (remote deletion): without
    // this reset the stale non-null id would keep the floor inert forever.
    if (ideaSummary !== null && !game.ideas.some((idea) => idea.id === ideaSummary)) {
      setIdeaSummary(null);
    }
  }, [ideaSummary, game.ideas]);
  // The "Improve First Profit" suggestion modal (Change #9): pure UI
  // open-state, same placement rule as promoteOpen (survives the lg swap).
  const [improveOpen, setImproveOpen] = useState(false);
  const [internalSwitcherOpen, setInternalSwitcherOpen] = useState(false);
  const switcherOpen = controlledSwitcherOpen ?? internalSwitcherOpen;
  const setSwitcherOpen = onSwitcherOpenChange ?? setInternalSwitcherOpen;

  // Race-proof arrival (unit review FIX 1a): the floor variants fire their
  // arrival timer ~550ms after the tap, during which the game state may have
  // moved (a switch, a remote union, a completed task). The variants therefore
  // call a STABLE wrapper that reads the CURRENT implementation from a ref
  // refreshed every render, so arrival always computes against live state —
  // never the closure captured when the walk started.
  const onArrivedImpl = (intent: WalkIntent) => {
    switch (intent.kind) {
        case "openPhaseFloor":
          setFloorView(intent.phase);
          break;
        case "openPromote":
          setPromoteOpen(true);
          break;
        case "openRoom":
          dispatch({ type: "OPEN_ROOM", room: intent.room });
          break;
        case "enterCriterion": {
          const entry = roomEntryFor(game, intent.stepId);
          if (entry.action === "enter") {
            dispatch({ type: "SET_ACTIVE_IDEA", ideaIndex: entry.ideaIndex });
            dispatch({ type: "OPEN_RUNNER", stepId: intent.stepId, index: entry.index });
          } else if (entry.action === "pick") {
            dispatch({ type: "SET_PICK_FOR", pickFor: intent.stepId });
          }
          // "noop" → nothing (no eligible idea)
          break;
        }
        case "openIdea":
          // A filled "Your Ideas" slot opens the idea SUMMARY dialog (2026-08-03
          // rule 2) — never direct path entry. The path stays reachable through
          // the room cards and the coach; the dialog itself edits name/one-liner.
          // Resolved BY ID against LIVE state at arrival (Change #7 review P1):
          // if the idea was deleted (e.g. a cross-tab union landed during the
          // ~550ms walk) the intent no-ops instead of opening a swapped idea.
          if (game.ideas.some((idea) => idea.id === intent.ideaId)) {
            setIdeaSummary(intent.ideaId);
          }
          break;
        case "createIdea":
          // The idea's stable id is minted at this caller boundary (Unit 7).
          dispatch({ type: "CREATE_IDEA", ideaId: crypto.randomUUID() });
          break;
      }
    setWalkTo(null);
  };
  const onArrivedRef = useRef(onArrivedImpl);
  onArrivedRef.current = onArrivedImpl;
  const onArrived = useCallback((intent: WalkIntent) => onArrivedRef.current(intent), []);

  // Cancel any in-flight walk (FIX 1b/1c): clearing walkTo makes both floor
  // variants' [walkTo] effect cleanup run, which clears their arrival timer —
  // the intent never fires.
  const cancelWalk = useCallback(() => setWalkTo(null), []);

  // One lifted overlay truth (unit review FIX 5): the reducer-owned overlays
  // (runner / room / celebration / picker) plus the two Factory-owned ones.
  // Every overlay here is a modal takeover (full-screen below sm, floating
  // aria-modal dialog from sm up), so while ANY is open the floor container
  // goes `inert` and the floating helpers hide.
  const anyOverlayOpen =
    Boolean(game.runnerOpen || game.room || game.celebrate || game.pickFor) ||
    promoteOpen ||
    ideaSummary !== null ||
    improveOpen ||
    switcherOpen;
  // React 18's types don't know the `inert` attribute yet; apply it through a
  // spread so the DOM gets the real attribute without a ts-expect-error.
  const inertProps = (anyOverlayOpen ? { inert: "" } : {}) as React.HTMLAttributes<HTMLDivElement>;

  return (
    <main className="flex h-[100dvh] w-full flex-col gap-3 overflow-hidden bg-[hsl(38_46%_95%)] p-3 text-ink sm:gap-4 sm:p-5">
      <div className="relative min-h-0 flex-1" {...inertProps}>
        <FactoryFloor
          walkTo={walkTo}
          onArrived={onArrived}
          onWalk={setWalkTo}
          floorView={floorView}
          onBack={() => {
            // Back cancels any in-flight walk (FIX 1b): a walk started from
            // this floor must not arrive onto the floor we just left.
            cancelWalk();
            setFloorView("phases");
          }}
        />
        {/* The ONE bottom-right dock (Change #9): the former CoachButton dock
            classes, now flex-col so the blue Improve CTA stacks above the green
            coach with a small gap — both visible, both tappable, never
            overlapping, on every floor view (this mounts above the floorView
            switch AND the lg breakpoint conditional). Both hide while any
            overlay is open, same rule as before. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-7 z-40 flex flex-col items-end gap-2 px-4 lg:bottom-11 lg:px-6">
          {!anyOverlayOpen ? <ImproveFpCta onOpen={() => setImproveOpen(true)} /> : null}
          <NextStepCoach onWalk={setWalkTo} overlayOpen={anyOverlayOpen} />
        </div>
        {/* Ask-once birth-year card (Unit 3): non-modal, above the breakpoint
            conditional like the coach, so it survives the lg variant swap. */}
        <GradeAsk overlayOpen={anyOverlayOpen} />
      </div>

      <StepRunner />
      <Celebration />
      <RoomDialog />
      <PickerDialog />
      <PromoteBusiness open={promoteOpen} onClose={() => setPromoteOpen(false)} />
      <SwitcherDialog
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        onSwitched={cancelWalk}
      />
      {improveOpen ? <ImproveAppModal onClose={() => setImproveOpen(false)} /> : null}
      {ideaSummaryIndex >= 0 ? (
        // Keyed per idea ID so the local drafts reset when a different slot
        // opens — and SURVIVE a union-driven reindex of the same idea (the id
        // is stable where an index key would remount and drop drafts).
        // ideaIndex is the resolved-CURRENT index, so SET_FIELD dispatches
        // inside always address the right idea even after a reindex.
        <IdeaSummaryDialog
          key={ideaSummary}
          ideaIndex={ideaSummaryIndex}
          onClose={() => setIdeaSummary(null)}
        />
      ) : null}
    </main>
  );
}
