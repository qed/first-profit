/**
 * The provider-SWITCH coach / reflection beat (PP2 Unit 6, R24.6).
 *
 * Shown ONLY on a real switch: the student re-opened the comparison and chose a
 * DIFFERENT provider than the one they had. Choosing the SAME provider never
 * reaches here (CheckoutBooth guards old !== new; the reducer no-ops a same-id
 * SET_PROVIDER). The beat NAMES the lesson:
 *
 *   - switching AWAY from First Profit Pay -> the strong lesson: FPP was taking
 *     half of every sale; the new provider keeps almost all of it.
 *   - switching TO First Profit Pay (from a real one) -> a gentle heads-up that
 *     it takes half.
 *   - switching between two real providers -> a lighter reflection: their fees
 *     are close, so choose on features/effort, not the fee.
 *
 * When there are past sales, it also surfaces the CONCRETE lesson from the
 * ledger: how much the student has actually paid in fees so far vs what the NEW
 * provider would have taken on the SAME sales (each row carries its own fee
 * snapshot, so this is exact history, never a recompute of past rows).
 *
 * Past sales are UNTOUCHED by a switch (the Unit 5 fee snapshot lives per row);
 * this component is display-only and dispatches nothing.
 *
 * Overlay conventions (mirrors Celebration / the room dialogs): fixed scrim,
 * role="dialog" aria-modal, tabIndex -1 panel, focus-on-open, Escape-to-dismiss,
 * useFocusTrap, full-screen < sm / floating >= sm. Mobile-first ~390px; the
 * dismiss control is >= 44px. No em dashes in copy.
 */
import { useEffect, useRef } from "react";
import {
  PROVIDERS,
  computeFee,
  providerById,
  type ProviderId,
} from "../../data/providers";
import type { LedgerEntry } from "../../state/gameCore";
import { useFocusTrap } from "../../lib/useFocusTrap";

/** Whole-dollar (or up-to-2dp) display of an integer-cent amount. */
function formatDollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export interface SwitchReflection {
  /** Number of past sale rows the reflection is drawn from. */
  saleCount: number;
  /** Fees actually paid so far, summed from each row's own snapshot (cents). */
  feesPaidCents: number;
  /** What the NEW provider would have taken on the same gross sales (cents). */
  feesUnderNewCents: number;
}

/**
 * Compute the ledger-derived reflection: fees actually paid so far (from each
 * row's OWN snapshot, so past rows are read as-is, never recomputed) vs what the
 * NEW provider would have charged on the same gross amounts. Pure + exported so
 * the number is unit-testable.
 *
 * Only rows that carry a REAL fee snapshot (a chosen provider recorded a per-row
 * fee: providerId != null AND feeCents != null) take part in the comparison, and
 * they take part in ALL THREE outputs (saleCount + both sums) together. A legacy
 * row (pre-Unit-5: only amountCents) or a sale logged before any provider was
 * chosen never incurred a provider fee, so it contributes $0 to feesPaidCents;
 * counting its gross toward feesUnderNewCents would put a positive "would take"
 * next to a $0 "paid" — self-contradictory. Excluding such rows from all three
 * keeps the "on the same sales" framing truthful; if none qualify, saleCount is 0
 * and the caller omits the panel.
 *
 * Guard (#2): an unknown newProviderId makes providerById return undefined at
 * runtime; computeFee would then dereference provider.fee and white-screen the
 * room (no ErrorBoundary in src). Skip the fee comparison entirely in that case
 * (saleCount stays 0 -> no panel), mirroring the display path's unknown-id
 * fallback (providerName -> raw id).
 */
export function computeSwitchReflection(
  ledger: LedgerEntry[],
  newProviderId: ProviderId,
): SwitchReflection {
  const newProvider = providerById(newProviderId);
  let feesPaidCents = 0;
  let feesUnderNewCents = 0;
  let saleCount = 0;
  if (newProvider) {
    for (const row of ledger) {
      if (row.kind !== "sale") continue;
      // No provider snapshot -> the row never incurred a provider fee; it has no
      // place in a "you paid X, new would take Y" comparison. Skip it entirely.
      if (row.providerId == null || row.feeCents == null) continue;
      saleCount += 1;
      const gross = row.grossCents ?? row.amountCents;
      feesPaidCents += row.feeCents;
      feesUnderNewCents += computeFee(gross, newProvider).feeCents;
    }
  }
  return { saleCount, feesPaidCents, feesUnderNewCents };
}

const FPP: ProviderId = "first_profit_pay";

/** Provider display name, falling back to the raw id for an unknown one. */
function providerName(id: ProviderId): string {
  return PROVIDERS[id] ? PROVIDERS[id].name : id;
}

export function ProviderSwitchCoach({
  oldProviderId,
  newProviderId,
  ledger,
  onDismiss,
}: {
  oldProviderId: ProviderId;
  newProviderId: ProviderId;
  ledger: LedgerEntry[];
  onDismiss: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  useFocusTrap(panelRef, true);

  const oldName = providerName(oldProviderId);
  const newName = providerName(newProviderId);

  const leavingFpp = oldProviderId === FPP && newProviderId !== FPP;
  const enteringFpp = newProviderId === FPP && oldProviderId !== FPP;

  let eyebrow: string;
  let headline: string;
  let body: string;
  if (leavingFpp) {
    eyebrow = "You just learned the lesson";
    headline = "Now you keep almost all of it";
    body = `You just learned why founders compare providers. First Profit Pay was taking half of every sale. ${newName} keeps almost all of your money and charges a small fee instead.`;
  } else if (enteringFpp) {
    eyebrow = "Heads up";
    headline = "First Profit Pay takes half";
    body = `First Profit Pay is the easy button, but it keeps half of every sale. Most founders pick a provider like ${oldName} that lets them keep almost all of their money.`;
  } else {
    eyebrow = "Nice compare";
    headline = "The fees are close here";
    body = `${oldName} and ${newName} charge almost the same small fee per sale. Pick the one that fits how you want to build, not the fee.`;
  }

  const reflection = computeSwitchReflection(ledger, newProviderId);
  // Only surface the concrete number once there is real history to reflect on.
  const showReflection = reflection.saleCount > 0;

  return (
    <div className="fixed inset-0 z-[60] flex bg-[hsl(25_34%_20%/0.55)] sm:items-center sm:justify-center sm:p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fp-switch-title"
        tabIndex={-1}
        className="flex h-full w-full flex-col overflow-y-auto border-t-4 border-build bg-[hsl(40_55%_97%)] px-6 py-9 outline-none sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-full sm:max-w-[460px] sm:rounded-3xl sm:p-8 sm:shadow-[0_12px_32px_rgba(30,24,16,.2)]"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-build">{eyebrow}</p>
        <h2
          id="fp-switch-title"
          className="mt-2 font-display text-[26px] font-black leading-[1.15] text-[hsl(25_34%_20%)]"
        >
          {headline}
        </h2>
        <p className="mt-3 text-[14px] leading-[1.55] text-[hsl(25_34%_20%)]">{body}</p>

        {showReflection ? (
          <div className="mt-5 rounded-2xl border-2 border-[hsl(25_34%_20%/0.15)] bg-white p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]">
              Your sales so far
            </p>
            <dl className="mt-2 flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[13px] text-[hsl(25_20%_38%)]">Fees you paid</dt>
                <dd className="font-mono text-[15px] font-bold text-[hsl(25_34%_20%)]">
                  ${formatDollars(reflection.feesPaidCents)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[13px] text-[hsl(25_20%_38%)]">{newName} would have taken</dt>
                <dd className="font-mono text-[15px] font-bold text-[hsl(25_34%_20%)]">
                  ${formatDollars(reflection.feesUnderNewCents)}
                </dd>
              </div>
            </dl>
            <p className="mt-2.5 text-[12.5px] leading-[1.5] text-[hsl(25_20%_38%)]">
              Those past sales keep the fee they were charged. The change starts with your next sale.
            </p>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onDismiss}
          className="mt-6 inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-build px-5 font-display text-base font-bold text-white hover:brightness-110"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
