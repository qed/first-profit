/**
 * A · Landing page (parents, `/`) — recreated from the design handoff §A and the
 * `First Profit Flow.dc.html` prototype, pixel-faithfully.
 *
 * HQ skin: warm paper hsl(40 30% 99%), ink text. Sections: nav, 2-col hero with
 * the rotated AZEAP browser-frame mockup + floating "Payment received" card, the
 * dark Path section (5 phase cards), the "Day one takes ten minutes" 3-step row
 * with the coach/verifier banner, and the parchment CTA band.
 *
 * CTA cutover (Slice B Unit 10, Plan Revision 11 — "no half-live window"): every
 * "Start Building" CTA routes to `login` by DEFAULT (Slice A behavior). When the
 * `VITE_ENABLE_SIGNUP` flag is on (`isSignupEnabled`, flipped only after the
 * [T120] signup backend is verified live) the same CTAs route to `signup`. The
 * flag defaults OFF so merging/deploying this branch never cuts over on its own;
 * flipping it is the deliberate, reversible go-live step. `signupEnabled` is a
 * prop (defaulting to the resolved flag) purely so the routing is unit-testable.
 *
 * Copy rule (global product rule): NO em dashes anywhere. The handoff uses "·"
 * middots and commas/periods; this file matches that exactly.
 *
 * Mobile-first (CLAUDE.md, ~390px): base classes are the mobile layout (single
 * column, mockup scales down), desktop is layered on with `sm:`/`lg:`. The root
 * carries `overflow-x-hidden` so the rotated mockup/cards never introduce a
 * horizontal scrollbar. Only the two governing breakpoints (sm 640, lg 1024).
 */
import { useGame } from "../state/GameContext";
import { isSignupEnabled } from "../config";

/** Logo mark: five ascending steps, one per phase color (adapted from
 * assets/logo-mark.svg). Inline so it inherits `height` from the className. */
function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 -6 300 276"
      className={className}
      role="img"
      aria-label="First Profit logo mark, five ascending steps, one per phase"
    >
      <path d="M18 260 L58 260 L58 196 L18 210 Z" fill="hsl(14 78% 54%)" />
      <path d="M18 210 L58 196 L44 184 L4 198 Z" fill="hsl(14 80% 67%)" />
      <path d="M74 260 L114 260 L114 148 L74 162 Z" fill="hsl(217 74% 56%)" />
      <path d="M74 162 L114 148 L100 136 L60 150 Z" fill="hsl(217 78% 69%)" />
      <path d="M130 260 L170 260 L170 100 L130 114 Z" fill="hsl(265 52% 58%)" />
      <path d="M130 114 L170 100 L156 88 L116 102 Z" fill="hsl(265 56% 70%)" />
      <path d="M186 260 L226 260 L226 52 L186 66 Z" fill="hsl(150 52% 42%)" />
      <path d="M186 66 L226 52 L212 40 L172 54 Z" fill="hsl(150 45% 56%)" />
      <path d="M242 260 L282 260 L282 10 L242 24 Z" fill="hsl(41 88% 52%)" />
      <path d="M242 24 L282 10 L268 -2 L228 12 Z" fill="hsl(45 92% 65%)" />
    </svg>
  );
}

const PHASES = [
  { index: 1, name: "Sell", promise: "Learn to confidently sell anything.", color: "hsl(14 78% 54%)" },
  { index: 2, name: "Build", promise: "Ship a real thing people can buy.", color: "hsl(217 74% 56%)" },
  { index: 3, name: "Validate", promise: "Prove it works before you scale it.", color: "hsl(265 52% 58%)" },
  { index: 4, name: "Grow", promise: "Get to your first $1,000 in sales.", color: "hsl(150 52% 42%)" },
  { index: 5, name: "Scale", promise: "Build the plan to $10,000 in profit.", color: "hsl(41 88% 52%)" },
] as const;

const STEPS = [
  {
    n: "1",
    color: "hsl(14 78% 54%)",
    title: "They claim their page",
    body: "A live website at firstprofit.school/their-name, saying exactly one true thing. It fills in as the business becomes real.",
  },
  {
    n: "2",
    color: "hsl(217 74% 56%)",
    title: "The money booth switches on",
    body: "Stripe checkout through the First Profit account, so you never wire up a merchant account. Payouts land in your parent-controlled account.",
  },
  {
    n: "3",
    color: "hsl(150 52% 42%)",
    title: "One task at a time",
    body: 'A big green Next Step button walks them through 125 unit tasks. Each ends with a "done when" line you can answer yes or no.',
  },
] as const;

/** The green Fraunces CTA with the design system's hard shadow. */
function StartBuildingButton({
  onClick,
  size = "md",
}: {
  onClick: () => void;
  size?: "md" | "lg";
}) {
  const sizing =
    size === "lg"
      ? "min-h-[56px] px-8 text-[19px]"
      : "min-h-[52px] px-6 text-lg";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-2xl bg-verified font-display font-bold text-white shadow-[0_6px_0_hsl(150_52%_26%)] transition-transform hover:-translate-y-0.5 active:translate-y-px active:shadow-[0_3px_0_hsl(150_52%_26%)] ${sizing}`}
    >
      Start Building →
    </button>
  );
}

/** Miniature AZEAP site inside the hero browser frame (approximated with divs;
 * this is a static picture of the kid's real product, not a live site). */
function AzeapMockup() {
  return (
    <div className="bg-[#FDFBF3] px-[22px] pb-6 pt-5">
      <div className="flex items-center justify-between pb-3">
        <span className="flex items-center gap-[7px]">
          <span className="flex h-[22px] w-[22px] -rotate-3 items-center justify-center rounded-[5px] border border-[rgba(31,41,55,0.8)] bg-[#F2C14E] font-hand text-[13px] font-bold text-[#1F2937]">
            A
          </span>
          <span className="flex flex-col">
            <span className="font-display text-[12px] font-bold leading-none tracking-[-0.01em] text-[#1F2937]">
              AZEAP
            </span>
            <span className="mt-px text-[6.5px] uppercase tracking-[0.14em] text-[#7C7768]">
              Almost zero effort
            </span>
          </span>
        </span>
        <span className="rounded-[5px] bg-[#E0603A] px-[9px] py-1 text-[8.5px] font-semibold text-white">
          Get an invite
        </span>
      </div>
      <div className="px-0 pb-1 pt-1.5 text-center">
        <span className="inline-flex -rotate-1 items-center gap-1 rounded-full border border-[rgba(31,41,55,0.15)] bg-white px-2 py-0.5 text-[6.5px] font-semibold uppercase tracking-[0.14em] text-[#7C7768]">
          <span className="h-1 w-1 rounded-full bg-[#E0603A]" />
          Almost Zero Effort Activity Planner
        </span>
        <p className="mt-[7px] font-display text-[17px] font-bold leading-[1.15] tracking-[-0.01em] text-[#1F2937]">
          Your kids' activities, planned before your coffee goes <i>cold</i>.
        </p>
        <p className="mx-auto mt-[5px] max-w-[36ch] text-[9px] leading-[1.5] text-[#7C7768]">
          You didn't sign up to run a small logistics company. AZEAP quietly sorts it out.
        </p>
        <span className="mt-2 inline-block rounded-[5px] bg-[#E0603A] px-3 py-[5px] text-[8.5px] font-semibold text-white">
          Poke at the demo planner ↓
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          {
            rot: "-rotate-2",
            tab: "#6E9BC5",
            title: "The Week",
            lines: ["✓ Swim, Mon 4:15", "✓ Piano, Tue 4:15", "✓ Thu: nothing, on purpose"],
          },
          {
            rot: "rotate-1",
            tab: "#7FB29A",
            title: "The Carpool",
            lines: ["✓ Priya drives Mon", "✓ You drive Sat", "✓ Dey family: swim meet"],
          },
          {
            rot: "rotate-3",
            tab: "#F2C14E",
            title: "The Gear",
            lines: ["✓ Shin guards", "✓ Goggles", "✓ Snack that is not a snack"],
          },
        ].map((card) => (
          <div
            key={card.title}
            className={`relative ${card.rot} rounded-[7px] border border-[#DDD8C8] bg-white p-2 shadow-[0_1px_0_#E7E2D2,0_14px_30px_-18px_rgba(31,41,55,0.35)]`}
          >
            <span
              className="absolute -top-1 left-[10px] h-[7px] w-[26px] -rotate-2 rounded-[2px] opacity-80"
              style={{ background: card.tab }}
            />
            <p className="border-b border-dashed border-[#DDD8C8] pb-1 font-display text-[9px] font-semibold text-[#1F2937]">
              {card.title}
            </p>
            <p className="mt-1 text-[7px] leading-[1.7] text-[rgba(31,41,55,0.8)]">
              {card.lines.map((l, i) => (
                <span key={i}>
                  {l}
                  {i < card.lines.length - 1 && <br />}
                </span>
              ))}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Landing({ signupEnabled = isSignupEnabled() }: { signupEnabled?: boolean } = {}) {
  const { dispatch } = useGame();
  // The Start Building cutover (Rev 11): flag OFF -> login (Slice A, no half-live
  // window); flag ON -> signup, flipped only once the [T120] backend is live.
  const onStartBuilding = () =>
    dispatch({ type: "SET_STAGE", stage: signupEnabled ? "signup" : "login" });

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[hsl(40_30%_99%)] text-ink">
      {/* Nav */}
      <nav className="mx-auto flex max-w-[1120px] items-center justify-between px-5 py-5 sm:px-8">
        <div className="flex items-center gap-2.5">
          <LogoMark className="h-7 w-auto" />
          <span className="text-[15px] font-extrabold tracking-[0.02em]">FIRST PROFIT</span>
        </div>
        <div className="flex items-center gap-3 sm:gap-5">
          <span className="hidden text-[13px] text-[hsl(30_6%_52%)] sm:inline">
            Home Study Edition · v1 tester preview
          </span>
          <button
            type="button"
            onClick={onStartBuilding}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-ink px-[18px] text-sm font-medium text-white transition-colors hover:bg-[hsl(30_12%_22%)]"
          >
            Start Building
          </button>
        </div>
      </nav>

      {/* Hero */}
      <header className="mx-auto grid max-w-[1120px] grid-cols-1 items-center gap-14 px-5 pb-16 pt-12 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14 lg:pb-[72px] lg:pt-16">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-sell">
            For families · ages 8 to 16
          </p>
          <h1 className="mt-3.5 font-display text-[40px] font-extrabold leading-[1.05] tracking-[-0.02em] sm:text-5xl lg:text-[56px]">
            Your kid's first $1,000, earned for real.
          </h1>
          <p className="mt-5 max-w-[52ch] text-[17px] leading-[1.65] text-[hsl(30_8%_34%)] [text-wrap:pretty]">
            First Profit turns starting a real, tiny business into a guided game.
            Real customers, real money changing hands, one fifteen-minute task at
            a time. You are the coach and the verifier, never the doer.
          </p>
          <div className="mt-7 flex gap-3">
            <StartBuildingButton onClick={onStartBuilding} />
          </div>
          <p className="mt-3.5 font-mono text-[11px] text-[hsl(30_6%_52%)]">
            Free while we test · a parent sets up every account
          </p>
        </div>

        {/* Hero right: rotated browser-frame mockup + floating payment card. The
            container reserves bottom room (mb) for the -bottom floating card so
            it never overlaps the dark section below. */}
        <div className="relative mb-16 lg:mb-14">
          <div className="-rotate-[1.5deg] overflow-hidden rounded-2xl border border-[hsl(40_14%_89%)] bg-white shadow-[0_4px_12px_rgba(30,24,16,0.06),0_12px_32px_rgba(30,24,16,0.08)]">
            <div className="flex items-center gap-1.5 border-b border-[hsl(40_14%_89%)] bg-[hsl(40_24%_96%)] px-3 py-2.5">
              <span className="h-[9px] w-[9px] rounded-full bg-sell" />
              <span className="h-[9px] w-[9px] rounded-full bg-scale" />
              <span className="h-[9px] w-[9px] rounded-full bg-grow" />
              <span className="ml-2 rounded-md bg-white px-2.5 py-0.5 font-mono text-[11px] text-[hsl(30_6%_52%)]">
                firstprofit.school/cedric
              </span>
            </div>
            <AzeapMockup />
          </div>
          <div className="absolute -bottom-14 right-[-14px] flex rotate-2 items-center gap-3 rounded-xl border border-[hsl(40_14%_89%)] bg-white px-4 py-3 shadow-[0_4px_12px_rgba(30,24,16,0.1)]">
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-[hsl(150_52%_42%/0.12)] text-base text-[hsl(150_52%_36%)]">
              ✓
            </span>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[hsl(30_6%_52%)]">
                Payment received
              </p>
              <p className="text-sm font-semibold">
                Helen Rosenfeld subscribed · <span className="font-mono">$25</span> / month
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Dark Path section */}
      <section className="bg-ink px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-[1120px]">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-[hsl(41_74%_60%)]">
            The Path · five phases, 25 criteria, 125 unit tasks
          </p>
          <h2 className="mt-2.5 font-display text-[28px] font-bold text-white sm:text-[32px]">
            Every criterion is a real thing that happened, verified yes or no.
          </h2>
          <div className="mt-9 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
            {PHASES.map((ph) => (
              <div
                key={ph.name}
                className="rounded-[14px] bg-[hsl(30_12%_16%)] px-[18px] py-5"
                style={{ borderTop: `4px solid ${ph.color}` }}
              >
                <p className="font-mono text-xs font-semibold" style={{ color: ph.color }}>
                  0{ph.index}
                </p>
                <p className="mt-1.5 font-display text-xl font-bold text-white">{ph.name}</p>
                <p className="mt-1.5 text-[13px] leading-[1.5] text-[hsl(30_6%_70%)]">
                  {ph.promise}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Day one takes ten minutes */}
      <section className="mx-auto max-w-[1120px] px-5 py-16 sm:px-8 lg:py-[72px]">
        <h2 className="font-display text-[28px] font-bold sm:text-[32px]">
          Day one takes ten minutes.
        </h2>
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="rounded-2xl border border-[hsl(40_14%_89%)] bg-white p-[26px] shadow-[0_1px_3px_rgba(30,24,16,0.06)]"
            >
              <p className="font-mono text-[13px] font-semibold" style={{ color: s.color }}>
                {s.n}
              </p>
              <h3 className="mt-2 font-display text-xl font-bold">{s.title}</h3>
              <p className="mt-2 text-sm leading-[1.6] text-[hsl(30_8%_34%)]">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-[hsl(40_14%_89%)] bg-[hsl(40_24%_96%)] px-6 py-5 sm:flex-row sm:items-center sm:gap-6">
          <span className="font-display text-lg font-extrabold sm:whitespace-nowrap">
            Your role: coach and verifier.
          </span>
          <p className="text-sm leading-[1.55] text-[hsl(30_8%_34%)]">
            You keep it safe, hold the evidence standard, and resist fixing things.
            A parent is present for all in-person selling, controls every account
            and payment, and signs off anything published. There is no partial credit.
          </p>
        </div>
      </section>

      {/* Parchment CTA band */}
      <section className="border-t border-[hsl(40_14%_89%)] bg-[hsl(38_46%_95%)]">
        <div className="mx-auto flex max-w-[1120px] flex-col items-start gap-8 px-5 py-16 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-display text-[30px] font-extrabold leading-tight text-[hsl(25_34%_20%)] sm:text-4xl">
              The game is the real business.
              <br />
              The app keeps score.
            </h2>
            <p className="mt-2.5 text-[15px] text-[hsl(25_20%_38%)]">
              Set up takes one parent, one kid, and about four minutes.
            </p>
          </div>
          <StartBuildingButton onClick={onStartBuilding} size="lg" />
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1120px] flex-col gap-2 px-5 py-5 font-mono text-[11px] text-[hsl(30_6%_52%)] sm:flex-row sm:justify-between sm:px-8">
        <span>First Profit · Home Study Edition</span>
        <span>Sell → Build → Validate → Grow → Scale</span>
      </footer>
    </main>
  );
}
