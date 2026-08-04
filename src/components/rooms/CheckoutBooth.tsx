/**
 * The Checkout Booth room body. Simplified 2026-08-03 (owner spec): the booth
 * offers ONLY First Profit Pay. The three-provider comparison, the log-a-real-
 * sale card, the "set it up for real" walkthrough entry, and the "compare
 * providers again" re-entry are all gone from this room. The provider DATA in
 * src/data/providers.ts is untouched (fee modeling elsewhere depends on it);
 * only this room's UI narrows.
 *
 * Two states, both now headed by the provider's brand mark (First Profit's own
 * LogoMark for First Profit Pay) and both closing with the SAME `UNLOCK_LINE`
 * notice, so the room says exactly one thing about what the booth offers:
 *   - NO provider chosen (the norm now) -> a single First Profit Pay card with
 *     the fee/hold subhead and the unlock notice. Nothing here writes
 *     chosenProvider; there is no unlock logic in this room.
 *   - A provider ALREADY chosen (legacy accounts; the reducer keeps
 *     SET_PROVIDER + chosenProvider) -> a compact chosen summary (mark + name +
 *     fee line + the subscription-so-far proxy for subscription providers). It
 *     has no actions; this room mints no new choices.
 *
 * Copy retired 2026-08-04 (owner spec): the room tagline "Your checkout page
 * opens when you have a product and a price." (deleted at the ROOM_META call
 * site in src/screens/Factory.tsx), the locked pseudo-button that repeated it,
 * and "You chose this. It collects your money on every sale."
 *
 * The append-only Ledger list (existing sale records) stays visible in both
 * states. Mobile-first at ~390px; no em dashes; 44px tap targets.
 */
import { Lock } from "lucide-react";
import { useGame } from "../../state/GameContext";
import { LedgerList } from "./LedgerList";
import { feeLabel, subscriptionLabel } from "./ProviderComparison";
import { ProviderLogo } from "./ProviderLogo";
import { PROVIDERS, type Provider } from "../../data/providers";

/** The booth card's fee/hold subhead. Exact copy per owner spec, 2026-08-03. */
export const FPP_SUBHEAD = "5% of every sale. 90 day hold before transfer.";

/**
 * THE one message of this room (owner spec, 2026-08-04). It replaces both the
 * old room tagline and the old "You chose this" line, and it renders in BOTH
 * booth states so they can never disagree about what the booth offers.
 */
export const UNLOCK_LINE = "You can unlock a live checkout page in the app.";

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

  return (
    <div>
      {chosenProvider ? <ChosenSummary /> : <FirstProfitPayCard />}

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
 * The unlock notice: the ONE thing this room says right now, so it is styled to
 * be read first — full-measure panel, lock icon, display face at 17px. Shared
 * by both booth states. Static copy; nothing here unlocks anything (the real
 * unlock lives in the app), so it is a <p>, never a dead disabled button.
 */
function UnlockNotice() {
  return (
    <div className="mt-4 flex items-start gap-3 rounded-[14px] border-2 border-[hsl(217_74%_56%/0.35)] bg-[hsl(217_74%_56%/0.08)] p-4">
      <Lock size={20} aria-hidden className="mt-0.5 shrink-0 text-build" />
      <p className="font-display text-[17px] font-bold leading-[1.4] text-[hsl(25_34%_20%)]">
        {UNLOCK_LINE}
      </p>
    </div>
  );
}

/**
 * The single First Profit Pay card: the First Profit logo + name, the exact
 * fee/hold subhead, and the unlock notice. The old locked pseudo-button is
 * gone (2026-08-04): it looked pressable but never was, and its label repeated
 * the retired "when you have a product and a price" claim.
 */
function FirstProfitPayCard() {
  const fpp = PROVIDERS.first_profit_pay;
  return (
    <div className="w-full rounded-[16px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white p-5">
      <div className="flex items-center gap-3">
        <ProviderLogo id={fpp.id} className="h-9 w-9 shrink-0" />
        <p className="font-display text-[20px] font-black text-[hsl(25_34%_20%)]">{fpp.name}</p>
      </div>
      <p className="mt-2 text-[14px] font-semibold text-[hsl(25_34%_20%)]">{FPP_SUBHEAD}</p>
      <p className="mt-1 text-[13px] leading-[1.5] text-[hsl(25_20%_38%)]">
        This is where your money will come in.
      </p>

      <UnlockNotice />
    </div>
  );
}

/**
 * The chosen-provider summary for legacy accounts that already chose (this room
 * writes no NEW choices). `provider` may be undefined at runtime if a stale or
 * unknown id was persisted, so the name falls back to the raw id (rendered as
 * JSX text via React default escaping, never dangerouslySetInnerHTML). A chosen
 * First Profit Pay shows the same fee/hold subhead as the card, so the two
 * states never disagree about the fee.
 */
function ChosenSummary() {
  const { chosenProvider } = useGame();
  if (!chosenProvider) return null;
  const provider = PROVIDERS[chosenProvider.providerId];
  const name = provider ? provider.name : chosenProvider.providerId;
  const isFpp = chosenProvider.providerId === "first_profit_pay";

  // Light, directional "subscription so far" proxy (null for a no-subscription
  // provider like First Profit Pay). Date.now() is read here at render (a view),
  // never in the gameCore reducer; the helper guards a non-positive elapsed.
  const subSoFarCents = estimateSubscriptionSoFarCents(provider, chosenProvider.chosenAt, Date.now());

  return (
    <div className="w-full rounded-[16px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white p-5">
      {/* The brand mark the card state always had (First Profit's own LogoMark
          for First Profit Pay); this state used to show a bare name. */}
      <div className="flex items-center gap-3">
        <ProviderLogo id={chosenProvider.providerId} className="h-9 w-9 shrink-0" />
        <p className="font-display text-[20px] font-black text-[hsl(25_34%_20%)]">{name}</p>
      </div>
      {provider && (
        <p className="mt-2 text-[13px] text-[hsl(25_20%_38%)]">
          {isFpp ? FPP_SUBHEAD : `${feeLabel(provider)} · ${subscriptionLabel(provider)}`}
        </p>
      )}

      <UnlockNotice />

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
    </div>
  );
}
