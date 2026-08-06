/**
 * All staff-page copy in ONE object, for review — the convention the staff
 * screen has followed since Change #9. It moved out of StaffSuggestions.tsx in
 * Unit 3 (the two-tab shell) purely so the shell and both tabs can share it
 * without a circular import.
 *
 * Two conventions worth keeping:
 *  - ONE string per label. `suggestionsTitle` names both the tab button and the
 *    panel heading; a separate "tab label" key would be a copy of it, free to
 *    drift.
 *  - Per-tab strings are NAMESPACED (`suggestionsLoading`, not `loading`), so
 *    the Watchtower's own trio in Unit 5 lands beside them instead of on top
 *    of them.
 */
export const STAFF_COPY = {
  // ONE page title, identical signed-out and signed-in: the h1 lives in the
  // shell, so every view (sign-in, refusal, tabs) renders beneath it.
  title: "First Profit Staff Page",
  signInTitle: "Staff sign-in",
  email: "Email",
  password: "Password",
  showPassword: "Show password",
  hidePassword: "Hide password",
  signIn: "Sign in",
  signOut: "Sign out",
  refusal: "This page is for First Profit staff.",
  signInFailed: "Sign-in failed. Check the email and password.",
  signInIncomplete: "Enter the email and password.",
  retry: "Retry",

  // Tab labels — each is also its panel's h2.
  suggestionsTitle: "Suggestions",
  watchtowerTitle: "Watchtower",

  // Suggestions tab.
  suggestionsLoading: "Loading suggestions…",
  suggestionsLoadFailed: "Could not load suggestions. Try again.",
  suggestionsEmpty: "No suggestions yet.",

  // Watchtower tab — the flow board (Unit 5).
  //
  // Two copy obligations are LOAD-BEARING here and must survive any edit:
  //
  //  1. SURVIVORSHIP. The median is computed only over ideas that actually
  //     COMPLETED the task; ideas abandoned before finishing it are invisible to
  //     it, and the slowest are the likeliest to be abandoned — so it
  //     systematically UNDERSTATES difficulty. It must never be worded as "how
  //     long this task takes", and it must point at the stalled column, which
  //     counts precisely the ideas the median cannot see.
  //  2. THREE DIFFERENT BLANKS. "—" (not measurable here), "withheld" (a median
  //     exists but too few children back it) and a zero are three different
  //     facts, and staff act differently on each. Never collapse them.
  watchtowerLoading: "Loading the flow board…",
  watchtowerLoadFailed: "Could not load the flow board. Try again.",
  watchtowerRefreshFailed:
    "Could not refresh. The numbers below are from the last successful load.",
  watchtowerEmpty: "No ideas have reached this step yet.",
  // A cohort of ZERO children is NOT a quiet cohort. Saying "nobody has reached
  // this step" over a payload with no children in it is a positive claim about
  // data we do not have — and it is exactly what a mis-scoped endpoint returns.
  watchtowerNoCohort:
    "The endpoint returned no children at all. That is not the same as a quiet cohort — read it as a fault in the request or the roster, not as “nobody has started”.",
  // The same argument one step along: children ARE present and not one of their
  // saves could be read. `noCohort` is false, so without its own state this
  // showed the mild "nothing here yet" line with the real cause as one bullet at
  // the bottom of the caveat block. The likeliest cause is a DOC_VERSION bump
  // shipped in first-profit before the120 redeployed — two constants, two repos,
  // two deploys, no parity gate — and the board must say so loudly.
  watchtowerAllUnreadable:
    "Every child's save was unreadable. That is not a quiet cohort — it usually means the two repos disagree about the save format (a DOC_VERSION bump deployed on one side only). The numbers below are empty because nothing could be read, not because nobody has started.",
  watchtowerRefresh: "Refresh",
  watchtowerRefreshing: "Refreshing…",
  watchtowerLastUpdated: "Last updated",

  // Selectors. Two levels, phase then step, so at most one step's ~5 unit tasks
  // are ever on screen (owner's framing).
  watchtowerPhaseLabel: "Phase",
  watchtowerCriterionLabel: "Step",

  // The table.
  watchtowerCaptionLead: "Flow through step",
  watchtowerCaptionTail:
    "One row per unit task. The unit counted is the IDEA, not the child — a child with two ideas counts twice.",
  /** The median's caveat in one line, IN the caption — the full note is below
   *  the fold on a phone, and a caveat nobody reaches is not a caveat. */
  watchtowerCaptionMedianShort: "Median counts only ideas that finished; read it beside Stalled.",
  watchtowerColTask: "Unit task",
  watchtowerColThroughput: "Ideas through",
  watchtowerColMedian: "Median time for ideas that got through",
  watchtowerColActive: "Sitting here now",
  // The DEFINITION, not half of it. At launch most of this column is the second
  // clause, and a staff member who reads only "30+ days" will go nudge a child
  // who started yesterday.
  watchtowerColStalled: "Stalled (30+ days or no usable timestamp)",

  // Durations. Coarse by design — the stamps come from a child's own device
  // clock, so a figure to the minute asserts a precision the data lacks. The
  // strings live here rather than inline in the formatter so the board's whole
  // vocabulary is reviewable in one place.
  watchtowerDurationUnderHour: "under 1h",
  watchtowerDurationHourSuffix: "h",
  watchtowerDurationDaySuffix: "d",

  // The median's caveat. This is the sentence the whole column depends on.
  watchtowerMedianCaveat:
    "Median time for ideas that got through — NOT how long this task takes. Ideas that stalled or were abandoned before finishing it are not counted, and the slowest ideas are the likeliest to be abandoned, so this number understates the real difficulty. Read it beside the stalled column, which counts exactly the ideas this median cannot see.",
  /** The glyph AND its explanation live together, so they cannot drift apart. */
  watchtowerNotMeasurable: "—",
  /** A screen reader announces a bare em dash as "dash", or skips it — which is
   *  indistinguishable from an empty cell. The word rides along, hidden. */
  watchtowerNotMeasurableSr: "not measurable",
  watchtowerMedianNoneNote:
    "“—” means not measurable here: this task has no task before it to measure from, or no idea has a timestamp on both.",
  watchtowerMedianWithheld: "withheld",
  watchtowerMedianWithheldNote:
    "“withheld” means a median exists but fewer than 2 children are behind it. A median over one child is that child's own timing, so it is not published here. It is not a zero and not an “—”.",
  // A "—" produced by DROPPED samples is a THIRD thing: there WAS something to
  // measure and every measurement was unusable. The none-note describes the
  // wrong cause for it, so the cell says which. The count appears beside a REAL
  // median too: a row where 3 of 8 pairs survived looks clean without it, and
  // the 5 rejections are the finding.
  watchtowerMedianDroppedLabel: "timings unusable",
  watchtowerMedianDroppedNote:
    "“timings unusable” counts measurements that existed and were rejected — a clock the server had to correct, a clock set backwards, or a task and the one before it stamped at the same instant. Beside a “—” it means every measurement was rejected. Beside a median it means that median rests on fewer measurements than the task saw, and a large count is itself the finding.",
  watchtowerSampleLead: "n=",
  watchtowerSampleChildren: "children",
  // Breadth alone does not catch concentration: five honest children plus one
  // child with six ideas reads as six of six contributors.
  watchtowerSampleMaxOneChildLead: "up to",
  watchtowerSampleMaxOneChildTail: "from one child",

  // The stalled column — the surviving form of the old stuck list.
  watchtowerStalledNote:
    "Stalled = no completion in the last 30 days, or no timestamp we can trust. These are the ideas to nudge. Open a count to see who.",
  watchtowerStalledLaunchNote:
    "The cohort went live on 2026-08-04, so early on this column is mostly ideas with no usable timestamp rather than ideas that have gone quiet.",
  // Per-row, under the count: at launch this split IS the stalled column, and it
  // is the difference between "three quiet children" and "three broken clocks".
  watchtowerStalledClamped: "clock ahead",
  watchtowerStalledUncorroborated: "unbacked",
  watchtowerStalledSplitNote:
    "Under a stalled count, “clock ahead” means the device clock was set forward so the recency is this request's clock rather than the child's work, and “unbacked” means a recent-looking timestamp that no completion supports. Neither is a child who simply went quiet.",

  // The one thing on this board that can actually fail.
  watchtowerMonotonicLead: "These numbers disagree with themselves: more ideas are through",
  watchtowerMonotonicTail:
    "than through the task before it, which cannot happen. Something is wrong with this board — treat every number here as unreliable until it clears.",
  watchtowerMonotonicAction: "Refresh; if it persists, report it before acting on this step.",

  // Footer. Read as a summary, NOT as validation: the placement walk is total
  // and single-valued, so these always add up even when the board is wrong.
  watchtowerFooterActive: "sitting",
  watchtowerFooterStalled: "stalled",
  watchtowerFooterBefore: "not here yet",
  watchtowerFooterAfter: "past this step",
  watchtowerFooterLive: "ideas live",

  // Cohort caveats. These exist so ABSENCE is visible — a child who contributes
  // nothing must be COUNTED, never merely missing. The section renders even when
  // every count is zero: "nothing is hidden" and "we did not check" must not look
  // the same.
  watchtowerCaveatsTitle: "What this board cannot see",
  watchtowerCaveatNone: "Nothing — every child's save was read and counted.",
  // Written as noun phrases with the count appended ("label: N") rather than
  // "N children …", so one child and seven children read equally well without a
  // pluralisation rule per string.
  watchtowerCaveatUnreadable:
    "Children whose save could not be read — counted nowhere below, neither as started nor as stalled",
  watchtowerCaveatTruncated:
    "Children whose save was too large to read fully — their ideas ARE counted, but something may be missing from them",
  watchtowerCaveatSkippedIdeas:
    "Children with ideas the server skipped as malformed — those ideas are missing from every number below",
  watchtowerCaveatNoUnits: "Children with no ideas at all yet",
  watchtowerCaveatUncorroborated:
    "Ideas that look recently active but whose timestamp no completion backs — counted as stalled, not sitting",
  watchtowerCaveatOutsideRequest:
    "Ideas whose most recent work is in another step — their recency comes from completions this view cannot show",
  // The WIP columns have no structural defence the way the median does (the
  // median is taken per child first). This caveat is that defence.
  watchtowerCaveatWipConcentration:
    "Most ideas held by ONE child — above the app's own limit of 5, so a single save can inflate a “sitting here now” count",
  // Rejected-by-this-page counts. A payload element this page cannot read is
  // COUNTED here rather than filtered away in silence; silent filtering makes
  // every number a quiet fraction of the cohort while staying self-consistent.
  watchtowerCaveatRejectedChildren:
    "Children the endpoint sent in a shape this page could not read — counted nowhere below",
  watchtowerCaveatRejectedIdeas:
    "Ideas dropped as unreadable (missing or invalid position) — missing from every number below",
  watchtowerCaveatRejectedBusinesses: "Businesses dropped as unreadable",

  // The drill-down — the ONLY place a username appears on this page.
  watchtowerDrillOpen: "show who",
  watchtowerDrillClose: "Close",
  watchtowerDrillActiveTitle: "Sitting here now",
  watchtowerDrillStalledTitle: "Stalled here",
  watchtowerDrillIdeasSuffix: "ideas",
  // The caveat block says "abnormal docs: 3" and the roster says three names;
  // without this marker nobody can join the two. Rendered per name, because the
  // server's flag is per child.
  watchtowerDrillTruncated: "abnormal save",
  // The roster collapses per child, so a count of 5 can name 3 people. Stating
  // both numbers turns unexplained arithmetic into a fact.
  watchtowerDrillChildrenSuffix: "children",
} as const;
