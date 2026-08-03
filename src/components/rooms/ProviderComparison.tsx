/**
 * The Checkout Booth provider-comparison lesson (PP2 Unit 4, R24.1/R24.2).
 *
 * The student's first money decision: WHICH service collects their money. The
 * three providers (PROVIDER_IDS order: the First Profit Pay strawman first, then
 * the real Replit / Shopify options) render as STACKED CARDS (never a wide table)
 * so the whole comparison fits a ~390px phone with no horizontal scroll. Each
 * card shows the per-sale fee, the monthly subscription, the effort, who holds
 * the money, and a "Choose <name>" action that dispatches SET_PROVIDER.
 *
 * First Profit Pay is a REAL, pickable option framed AS A PROVIDER ("First
 * Profit Pay"), not the First Profit course. All copy is sourced from
 * src/data/providers.ts and contains no em dashes.
 *
 * Display-safety: provider name + id are rendered as JSX text (React default
 * escaping); no dangerouslySetInnerHTML. Cards iterate the canonical PROVIDERS
 * map so every id is known here.
 */
import { useGame } from "../../state/GameContext";
import { PROVIDER_IDS, PROVIDERS, type Provider, type ProviderId } from "../../data/providers";
import { ProviderLogo } from "./ProviderLogo";

/** "50% of every sale" (no flat) or "2.9% + 30c per sale" (percent + flat). */
export function feeLabel(provider: Provider): string {
  const percent = provider.fee.percentBps / 100;
  if (provider.fee.flatCents === 0) return `${percent}% of every sale`;
  return `${percent}% + ${provider.fee.flatCents}c per sale`;
}

/** "$25/mo" for a subscription, or "No monthly fee" when there is none. */
export function subscriptionLabel(provider: Provider): string {
  if (provider.subscriptionCents == null) return "No monthly fee";
  return `$${provider.subscriptionCents / 100}/mo`;
}

/** The card's single cost line: "50% of every sale" or "2.9% + 30c per sale + $5/mo". */
export function costLine(provider: Provider): string {
  if (provider.subscriptionCents == null) return feeLabel(provider);
  return `${feeLabel(provider)} + ${subscriptionLabel(provider)}`;
}

export function ProviderComparison({ onChoose }: { onChoose?: (id: ProviderId) => void }) {
  const { dispatch } = useGame();

  const choose = (id: ProviderId) => {
    // Timestamp is stamped here (the gameCore module stays Date.now()-free).
    dispatch({ type: "SET_PROVIDER", providerId: id, chosenAt: Date.now() });
    onChoose?.(id);
  };

  return (
    <div>
      <div className="flex flex-col gap-3">
        {PROVIDER_IDS.map((id) => {
          const provider: Provider = PROVIDERS[id];
          return (
            <div
              key={id}
              className="w-full rounded-[16px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white p-4"
            >
              <div className="flex items-center gap-3">
                <ProviderLogo id={id} className="h-8 w-8 shrink-0" />
                <p className="font-display text-[18px] font-black text-[hsl(25_34%_20%)]">
                  {provider.name}
                </p>
              </div>
              <p className="mt-2 text-[14px] font-semibold text-[hsl(25_34%_20%)]">
                {costLine(provider)}
              </p>
              <p className="mt-0.5 text-[12.5px] leading-[1.5] text-[hsl(25_20%_38%)]">
                {provider.pitch}
              </p>

              <button
                type="button"
                onClick={() => choose(id)}
                className="mt-3.5 flex min-h-[44px] w-full items-center justify-center rounded-[10px] bg-build px-5 text-sm font-semibold text-white hover:brightness-110"
              >
                Choose {provider.name}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
