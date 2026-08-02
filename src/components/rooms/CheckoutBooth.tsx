/**
 * The Checkout Booth room body (PP2 Unit 4). The old First Profit-branded Stripe
 * mock is retired; the booth now teaches the provider-choice lesson.
 *
 * Two states:
 *   - NO provider chosen yet  -> the ProviderComparison lesson is the booth's
 *     primary content (the choice is available the moment the booth is first
 *     reachable, R24.3 — it is NOT gated behind logging a sale).
 *   - A provider ALREADY chosen -> a compact chosen-provider SUMMARY (name, its
 *     per-sale fee, "you chose this") plus a "Compare providers again" entry that
 *     re-opens the comparison. The full SWITCH flow + coach beat is Unit 6; here
 *     the re-open is intentionally simple (choosing a different provider already
 *     works via SET_PROVIDER from Unit 3).
 *
 * The append-only Ledger list (the sale record) stays visible in both states.
 * Mobile-first at ~390px; no em dashes.
 */
import { useState } from "react";
import { useGame } from "../../state/GameContext";
import { LedgerList } from "./LedgerList";
import { LogSaleForm } from "./LogSaleForm";
import { ProviderComparison, feeLabel } from "./ProviderComparison";
import { PROVIDERS } from "../../data/providers";

export function CheckoutBooth() {
  const { chosenProvider, ledger } = useGame();
  // Re-open the comparison over an existing choice ("compare again"). Simple
  // local toggle; the switch coach beat is Unit 6.
  const [comparing, setComparing] = useState(false);

  const showComparison = !chosenProvider || comparing;

  return (
    <div>
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
          <ProviderComparison onChoose={() => setComparing(false)} />
        </div>
      ) : (
        <>
          <ChosenSummary onCompareAgain={() => setComparing(true)} />
          {/* Log real sales through the chosen provider (fee modeled per row). */}
          <div className="mt-4">
            <LogSaleForm onChooseProvider={() => setComparing(true)} />
          </div>
        </>
      )}

      <div className="mt-4">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]">Ledger</p>
        <LedgerList ledger={ledger} emptyText="Empty so far. The first row is the whole point of Phase 1." />
      </div>
    </div>
  );
}

/**
 * The chosen-provider summary. `provider` may be undefined at runtime if a stale
 * or unknown id was persisted, so the name falls back to the raw id (rendered as
 * JSX text via React default escaping, never dangerouslySetInnerHTML).
 */
function ChosenSummary({ onCompareAgain }: { onCompareAgain: () => void }) {
  const { chosenProvider } = useGame();
  if (!chosenProvider) return null;
  const provider = PROVIDERS[chosenProvider.providerId];
  const name = provider ? provider.name : chosenProvider.providerId;

  return (
    <div className="w-full rounded-[16px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[hsl(25_20%_38%)]">
        Your payment provider
      </p>
      <p className="mt-1 font-display text-[22px] font-black text-[hsl(25_34%_20%)]">{name}</p>
      {provider && (
        <p className="mt-1 text-[13px] text-[hsl(25_20%_38%)]">{feeLabel(provider)}</p>
      )}
      <p className="mt-2 text-[13px] leading-[1.5] text-[hsl(25_34%_20%)]">
        You chose this. It collects your money on every sale.
      </p>
      <button
        type="button"
        onClick={onCompareAgain}
        className="mt-3.5 flex min-h-[44px] w-full items-center justify-center rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_55%_97%)] px-5 text-sm font-semibold text-[hsl(25_34%_20%)] hover:border-[hsl(25_34%_20%/0.4)]"
      >
        Compare providers again
      </button>
    </div>
  );
}
