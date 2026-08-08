/**
 * A · Landing page (parents, `/`) — fpv03 S01 (U1), rebuilt from
 * artifacts/fpv03/export-package/screenshots/S01-fp-home-top.png and
 * S01-fp-home-bottom.png.
 *
 * HQ skin: warm paper hsl(40 30% 99%), ink text. Sections: 2-col hero with the
 * rotated AZEAP browser-frame mockup + floating "Payment received" card, then
 * the "How the game is played" two-column section (YOU DO THIS · build a real
 * business / THE GAME DOES THIS · your story gets drawn) with the shared
 * example Carousel (task card ↔ graphic-novel panel), a "Start your story"
 * CTA, and the footer.
 *
 * CTA model (fpv03 U1, flow M1): production parent signup is the120's /start
 * funnel, so every Start-Building-class CTA is a plain LINK to
 * `getStartFunnelUrl()` (derived from VITE_T120_API_URL). The old
 * VITE_ENABLE_SIGNUP stage routing no longer drives the landing CTAs; the
 * in-repo signup stage remains reachable only via its own flows. `startUrl`
 * stays a prop so routing is unit-testable without env stubs.
 *
 * Copy rule (global product rule): NO em dashes anywhere.
 *
 * Mobile-first (CLAUDE.md, ~390px): base classes are the mobile layout,
 * desktop layered on with `sm:`/`lg:`. Root carries `overflow-x-hidden` so the
 * rotated mockup/cards never introduce a horizontal scrollbar. Only the two
 * governing breakpoints (sm 640, lg 1024).
 */
import { useGame } from "../state/GameContext";
import { getStartFunnelUrl } from "../config";
import { Carousel } from "../components/Carousel";
import panelIntro from "../assets/fpv03/panel-intro.jpg";
import panelCosts from "../assets/fpv03/panel-costs.jpg";
import panelMarketResearch from "../assets/fpv03/panel-market-research.jpg";
import panelAiProcess from "../assets/fpv03/panel-ai-process.jpg";
import panelShowcase from "../assets/fpv03/panel-showcase.jpg";

/** The five example task-to-panel pairs in the "How the game is played"
 * carousel. Static marketing content: each pairs a (fictional but true-to-
 * curriculum) unit-task recap card with the graphic-novel panel the game drew
 * for it. The showcase example matches the S01 mock verbatim. */
const EXAMPLES = [
  {
    id: "01",
    kicker: "Meet the hero",
    title: "Who are you?",
    sections: [
      {
        heading: "Name and basics",
        body: "My name is Peter Parker. I am nine years old.",
      },
      {
        heading: "Likes and dislikes",
        body: "I like playing soccer, hanging out with my friends, going on vacations, and learning about stocks and businesses.",
      },
      {
        heading: "Background and future",
        body: "My first business was selling comic books door to door. I would also love to have a secret undercover job as a geologist.",
      },
    ],
    tag: "The Visionary CEO, age 9",
    caption: "Every story starts with a hero. This one is me.",
    image: panelIntro,
    alt: "Graphic-novel panel introducing the kid founder as the hero of the story",
  },
  {
    id: "118",
    kicker: "The market research",
    title: "Twelve Real Answers",
    sections: [
      {
        heading: null,
        body: "I asked twelve real people what they actually struggle with, and wrote down their words, not mine.",
      },
      {
        heading: "How it came together",
        body: "A script, a notebook, and the courage to ask. Three said the same thing, and that became my product.",
      },
      {
        heading: "Questions & Answers",
        body: "The surprise was how much people want to help a kid with a real question.",
      },
    ],
    tag: "The Investigator, age 11",
    caption: "Twelve conversations later, I knew what people would pay for.",
    image: panelMarketResearch,
    alt: "Graphic-novel panel of the kid interviewing neighbors for market research",
  },
  {
    id: "121",
    kicker: "The cost sheet",
    title: "What It Really Costs",
    sections: [
      {
        heading: null,
        body: "I listed every cost of making one unit, and found my real profit for the first time.",
      },
      {
        heading: "How it came together",
        body: "Materials, packaging, the card fee. The number at the bottom was smaller than I hoped, so I fixed the price.",
      },
      {
        heading: "Questions & Answers",
        body: "Profit is what is left AFTER everything. That one line changed my price.",
      },
    ],
    tag: "The Numbers Kid, age 10",
    caption: "My first cost sheet. Profit is what is left after everything.",
    image: panelCosts,
    alt: "Graphic-novel panel of the kid working out product costs at a desk",
  },
  {
    id: "132",
    kicker: "The AI process",
    title: "My Robot Assistant",
    sections: [
      {
        heading: null,
        body: "I taught an AI to do the boring part of my process, and checked its work like a boss would.",
      },
      {
        heading: "How it came together",
        body: "I wrote the steps down first. If you cannot explain the job, you cannot delegate it.",
      },
      {
        heading: "Questions & Answers",
        body: "The AI is fast and wrong sometimes. The checking is my job.",
      },
    ],
    tag: "The Systems Builder, age 12",
    caption: "I delegated the boring part. Checking the work is still mine.",
    image: panelAiProcess,
    alt: "Graphic-novel panel of the kid supervising an AI helper on a computer",
  },
  {
    id: "124",
    kicker: "The showcase pitch",
    title: "The Event",
    sections: [
      {
        heading: null,
        body: "In a graduation ceremony with friends, family and future investors, I told the story of my first $10K in profits and future plans to a room full of people.",
      },
      {
        heading: "How it came together",
        body: "I picked a date. I sent invitations. I arranged the venue (my backyard). I set up AV to have everything recorded.",
      },
      {
        heading: "Questions & Answers",
        body: "The best part was when people asked questions and I knew my business inside-out.",
      },
    ],
    tag: "The Visionary CEO, age 9",
    caption: "After my first $10,000 in profit, I organized an event to showcase my progress.",
    image: panelShowcase,
    alt: "Graphic-novel panel of the kid presenting to a backyard audience at a podium",
  },
] as const;

/** The green Fraunces CTA with the design system's hard shadow, as a link to
 * the live enrollment funnel. */
function StartLink({
  href,
  children,
  size = "md",
}: {
  href: string;
  children: string;
  size?: "md" | "lg";
}) {
  const sizing =
    size === "lg" ? "min-h-[56px] px-8 text-[19px]" : "min-h-[52px] px-6 text-lg";
  return (
    <a
      href={href}
      className={`inline-flex items-center justify-center rounded-2xl bg-verified font-display font-bold text-white shadow-[0_6px_0_hsl(150_52%_26%)] transition-transform hover:-translate-y-0.5 active:translate-y-px active:shadow-[0_3px_0_hsl(150_52%_26%)] ${sizing}`}
    >
      {children}
    </a>
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

/** One example pair: the unit-task recap card beside the panel the game drew.
 * Stacks vertically on mobile, two columns from lg. */
function ExampleSlide({ example }: { example: (typeof EXAMPLES)[number] }) {
  return (
    <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-[1fr_auto_1.05fr] lg:gap-4">
      <div className="rounded-2xl border border-[hsl(40_14%_89%)] bg-white p-6 shadow-[0_1px_3px_rgba(30,24,16,0.06)] sm:p-7">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-grow">
          {example.id} · {example.kicker}
        </p>
        <h3 className="mt-2 font-display text-xl font-bold">{example.title}</h3>
        <div className="mt-3 rounded-xl border border-[hsl(40_14%_89%)] bg-[hsl(40_24%_97%)] px-4 py-3.5">
          {example.sections.map((s, i) => (
            <div key={i} className={i > 0 ? "mt-3" : undefined}>
              {s.heading && (
                <p className="text-[13.5px] font-bold text-ink">{s.heading}</p>
              )}
              <p className="mt-0.5 text-sm leading-[1.6] text-[hsl(30_8%_34%)]">{s.body}</p>
            </div>
          ))}
        </div>
      </div>

      <span aria-hidden className="hidden items-center font-mono text-lg text-[hsl(30_6%_52%)] lg:flex">
        →
      </span>

      <div className="relative rounded-xl border border-[hsl(40_14%_89%)] bg-[hsl(40_24%_97%)] p-4 pb-3 shadow-[0_1px_3px_rgba(30,24,16,0.06)]">
        <span className="absolute -top-3 left-4 z-10 -rotate-3 rounded-sm bg-scale px-2.5 py-1 font-hand text-[15px] font-bold text-ink shadow-[0_2px_4px_rgba(30,24,16,0.18)]">
          {example.tag}
        </span>
        <img
          src={example.image}
          alt={example.alt}
          loading="lazy"
          className="w-full rounded-md border border-[hsl(40_14%_86%)] object-cover"
        />
        <p className="mt-2.5 px-1 font-hand text-[17px] leading-[1.35] text-[hsl(30_8%_28%)]">
          {example.caption}
        </p>
      </div>
    </div>
  );
}

export function Landing({ startUrl }: { startUrl?: string } = {}) {
  // useGame keeps the component inside the provider contract (GlobalNav owns
  // the Log In routing); the landing itself no longer dispatches stages.
  useGame();
  const href = startUrl ?? getStartFunnelUrl();

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[hsl(40_30%_99%)] text-ink">
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
            First Profit turns starting a real business into a guided game. Real
            customers, real money changing hands, one fifteen-minute task at a
            time. Every completed task builds a panel in a custom graphic novel.
          </p>
          <div className="mt-7 flex gap-3">
            <StartLink href={href}>Start Building →</StartLink>
          </div>
          <p className="mt-3.5 font-mono text-[11px] text-[hsl(30_6%_52%)]">
            Free while we test
          </p>
        </div>

        {/* Hero right: rotated browser-frame mockup + floating payment card. The
            container reserves bottom room (mb) for the -bottom floating card so
            it never overlaps the section below. */}
        <div className="relative mb-16 lg:mb-14">
          <div className="-rotate-[1.5deg] overflow-hidden rounded-2xl border border-[hsl(40_14%_89%)] bg-white shadow-[0_4px_12px_rgba(30,24,16,0.06),0_12px_32px_rgba(30,24,16,0.08)]">
            <div className="flex items-center gap-1.5 border-b border-[hsl(40_14%_89%)] bg-[hsl(40_24%_96%)] px-3 py-2.5">
              <span className="h-[9px] w-[9px] rounded-full bg-sell" />
              <span className="h-[9px] w-[9px] rounded-full bg-scale" />
              <span className="h-[9px] w-[9px] rounded-full bg-grow" />
              {/* Illustrative mockup URL (Unit 6 truth-alignment): "your-name"
                  reads as the placeholder it is; it is on the120's reserved
                  list so it can never become someone's real page. */}
              <span className="ml-2 rounded-md bg-white px-2.5 py-0.5 font-mono text-[11px] text-[hsl(30_6%_52%)]">
                firstprofit.school/your-name
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

      {/* How the game is played (fpv03 S01 bottom) */}
      <section className="border-t border-[hsl(40_14%_89%)] bg-[hsl(40_24%_97%)] px-5 py-16 sm:px-8 lg:py-[72px]">
        <div className="mx-auto max-w-[1120px]">
          <h2 className="text-center font-display text-[32px] font-extrabold tracking-[-0.01em] sm:text-[40px]">
            How the game is played
          </h2>

          <div className="mx-auto mt-8 grid max-w-[880px] grid-cols-1 gap-6 text-center sm:grid-cols-2 sm:gap-10">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-sell">
                You do this
              </p>
              <h3 className="mt-1.5 font-display text-xl font-bold">Build a real business</h3>
              <p className="mx-auto mt-1.5 max-w-[38ch] text-sm leading-[1.6] text-[hsl(30_8%_34%)]">
                Take steps and complete unit tasks to pitch, sell, build, and
                grow, one small win at a time.
              </p>
            </div>
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-build">
                The game does this
              </p>
              <h3 className="mt-1.5 font-display text-xl font-bold">Your story gets drawn</h3>
              <p className="mx-auto mt-1.5 max-w-[38ch] text-sm leading-[1.6] text-[hsl(30_8%_34%)]">
                You are the hero of your own graphic novel, created panel by
                panel as your business gets built.
              </p>
            </div>
          </div>

          <Carousel
            ariaLabel="Example tasks and story panels"
            className="mx-auto mt-10 max-w-[1000px] sm:px-14 lg:px-0"
            // The five dots walk the five phase colors, Sell through Scale.
            dotColors={["bg-sell", "bg-build", "bg-validate", "bg-grow", "bg-scale"]}
            slides={EXAMPLES.map((example) => (
              <ExampleSlide key={example.id} example={example} />
            ))}
          />

          <div className="mt-10 text-center">
            <StartLink href={href} size="lg">
              Start your story
            </StartLink>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1120px] flex-col gap-2 px-5 py-5 font-mono text-[11px] text-[hsl(30_6%_52%)] sm:flex-row sm:justify-between sm:px-8">
        <span>First Profit</span>
        <span>
          <span className="text-sell">Sell</span> → <span className="text-build">Build</span> →{" "}
          <span className="text-validate">Validate</span> → <span className="text-grow">Grow</span> →{" "}
          <span className="text-scale">Scale</span>
        </span>
      </footer>
    </main>
  );
}
