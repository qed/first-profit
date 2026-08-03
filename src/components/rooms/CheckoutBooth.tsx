/**
 * The Checkout Booth room body (PP2 Unit 4). The old First Profit-branded Stripe
 * mock is retired; the booth now teaches the provider-choice lesson.
 *
 * Two states:
 *   - NO provider chosen yet  -> the ProviderComparison lesson is the booth's
 *     primary content (the choice is available the moment the booth is first
 *     reachable, R24.3, and is NOT gated behind logging a sale).
 *   - A provider ALREADY chosen -> a compact chosen-provider SUMMARY (name, its
 *     per-sale fee, "you chose this") plus a "Compare providers again" entry that
 *     re-opens the comparison.
 *
 * SWITCH flow + coach beat (Unit 6, R24.6): re-opening the comparison and
 * choosing a DIFFERENT provider is a real switch (old id != new id) and shows the
 * ProviderSwitchCoach reflection overlay. Choosing the SAME provider is a no-op
 * (the reducer no-ops a same-id SET_PROVIDER, and no coach fires). Dismissing the
 * coach returns to the chosen summary with the NEW provider active. Past sales are
 * UNTOUCHED: each ledger row carries its own Unit 5 fee snapshot, so a switch
 * never rewrites history.
 *
 * The append-only Ledger list (the sale record) stays visible in both states.
 * Mobile-first at ~390px; no em dashes.
 */
import { useState } from "react";
import { useGame } from "../../state/GameContext";
import { LedgerList } from "./LedgerList";
import { LogSaleForm } from "./LogSaleForm";
import { ProviderComparison, feeLabel, subscriptionLabel } from "./ProviderComparison";
import { ProviderSwitchCoach } from "./ProviderSwitchCoach";
import { SetupGuide } from "./SetupGuide";
import { PROVIDERS, type Provider, type ProviderId } from "../../data/providers";

/** ~30-day month in ms, for the directional "subscription so far" proxy. */
const MS_PER_MONTH = 30 * 24 * 60 * 60 * 1000;

/**
 * A LIGHT, directional "subscription so far" estimate for the chosen provider:
 * months elapsed since `chosenAt` times the monthly subscription. This is a
 * proxy, NOT a P&L (the real money-out accounting is deferred to Criterion 4.2).
 *
 * Returns `null` for a no-subscription provider (First Profit Pay), so the caller
 * shows nothing. Guards the elapsed term: a non-finite or non-positive elapsed
 * (a chosenAt in the future, or clock skew) clamps to 0, never negative. Pure +
 * exported so the proxy is unit-testable; Date.now() stays in the caller (a view),
 * out of the gameCore reducer.
 */
export function estimateSubscriptionSoFarCents(
  provider: Provider | undefined,
  chosenAt: number,
  now: number,
): number | null {
  if (!provider || provider.subscriptionCents == null) return null;
  const elapsed = now - chosenAt;
  if (!Number.isFinite(elapsed) || elapsed <= 0) return 0;
  const months = elapsed / MS_PER_MONTH;
  return Math.round(provider.subscriptionCents * months);
}

/** "$0", "$12", "$1,040" — whole-dollar display of an integer-cent amount. */
function formatWholeDollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

export function CheckoutBooth() {
  const { chosenProvider, ledger } = useGame();
  // Re-open the comparison over an existing choice ("compare again"). Simple
  // local toggle.
  const [comparing, setComparing] = useState(false);
  // The in-flight switch the coach beat is reflecting on, or null. Captured at
  // choose time (old id from the pre-dispatch closure vs the newly chosen id).
  const [switchCoach, setSwitchCoach] = useState<{ from: ProviderId; to: ProviderId } | null>(null);
  // Whether the real-world SetupGuide overlay for the chosen provider is open.
  const [setupOpen, setSetupOpen] = useState(false);

  const showComparison = !chosenProvider || comparing;

  // Fires from ProviderComparison AFTER it dispatched SET_PROVIDER. This closure
  // still holds the PRE-dispatch chosenProvider, so an existing id that differs
  // from the new one is a real switch -> raise the coach beat. First-ever choice
  // (no prior provider) and same-provider re-pick raise nothing.
  const handleChoose = (newId: ProviderId) => {
    const oldId = chosenProvider?.providerId;
    setComparing(false);
    if (oldId && oldId !== newId) {
      setSwitchCoach({ from: oldId, to: newId });
    }
  };

  return (
    <div>
      {switchCoach && (
        <ProviderSwitchCoach
          oldProviderId={switchCoach.from}
          newProviderId={switchCoach.to}
          ledger={ledger}
          onDismiss={() => setSwitchCoach(null)}
        />
      )}
      {setupOpen && chosenProvider && (
        <SetupGuide providerId={chosenProvider.providerId} onDismiss={() => setSetupOpen(false)} />
      )}
      {showComparison ? (
        <div>
          {chosenProvider && (
            <button
              type="button"
              onClick={() => setComparing(false)}
              className="mb-3 inline-flex min-h-[44px] items-center px-1 font-mono text-xs text-[hsl(25_20%_38%)] hover:text-[hsl(25_34%_20%)]"
            >
              ← Back to my provider
            </button>
          )}
          <ProviderComparison onChoose={handleChoose} />
        </div>
      ) : (
        <>
          <ChosenSummary onCompareAgain={() => setComparing(true)} onSetup={() => setSetupOpen(true)} />
          {/* Log real sales through the chosen provider (fee modeled per row). */}
          <div className="mt-4">
            <LogSaleForm onChooseProvider={() => setComparing(true)} />
          </div>
        </>
      )}

      {/* The ledger only appears once there is a row to show; the empty state is
          deliberately silent (owner request, 2026-08-02). */}
      {ledger.length > 0 && (
        <div className="mt-4">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]">Ledger</p>
          <LedgerList ledger={ledger} emptyText="" />
        </div>
      )}
    </div>
  );
}

/**
 * The chosen-provider summary. `provider` may be undefined at runtime if a stale
 * or unknown id was persisted, so the name falls back to the raw id (rendered as
 * JSX text via React default escaping, never dangerouslySetInnerHTML).
 */
function ChosenSummary({
  onCompareAgain,
  onSetup,
}: {
  onCompareAgain: () => void;
  onSetup: () => void;
}) {
  const { chosenProvider } = useGame();
  if (!chosenProvider) return null;
  const provider = PROVIDERS[chosenProvider.providerId];
  const name = provider ? provider.name : chosenProvider.providerId;

  // Light, directional "subscription so far" proxy (null for a no-subscription
  // provider like First Profit Pay). Date.now() is read here at render (a view),
  // never in the gameCore reducer; the helper guards a non-positive elapsed.
  const subSoFarCents = estimateSubscriptionSoFarCents(provider, chosenProvider.chosenAt, Date.now());

  return (
    <div className="w-full rounded-[16px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[hsl(25_20%_38%)]">
        Your payment provider
      </p>
      <p className="mt-1 font-display text-[22px] font-black text-[hsl(25_34%_20%)]">{name}</p>
      {provider && (
        <p className="mt-1 text-[13px] text-[hsl(25_20%_38%)]">
          {feeLabel(provider)} · {subscriptionLabel(provider)}
        </p>
      )}
      <p className="mt-2 text-[13px] leading-[1.5] text-[hsl(25_34%_20%)]">
        You chose this. It collects your money on every sale.
      </p>

      {subSoFarCents != null && (
        <div className="mt-3 rounded-[12px] border-2 border-[hsl(25_34%_20%/0.12)] bg-[hsl(40_55%_97%)] p-3.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]">
            Subscription so far (estimate)
          </p>
          <p className="mt-0.5 text-[15px] font-bold text-[hsl(25_34%_20%)]">
            about {formatWholeDollars(subSoFarCents)} so far
          </p>
          <p className="mt-1 text-[12px] leading-[1.5] text-[hsl(25_20%_38%)]">
            A rough guess from how long ago you chose, not real accounting. The true money out lands in
            your P&L later.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={onSetup}
        className="mt-3.5 flex min-h-[44px] w-full items-center justify-center rounded-[10px] bg-build px-5 text-sm font-semibold text-white hover:brightness-110"
      >
        Set it up for real
      </button>
      <button
        type="button"
        onClick={onCompareAgain}
        className="mt-2.5 flex min-h-[44px] w-full items-center justify-center rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_55%_97%)] px-5 text-sm font-semibold text-[hsl(25_34%_20%)] hover:border-[hsl(25_34%_20%/0.4)]"
      >
        Compare providers again
      </button>
    </div>
  );
}
