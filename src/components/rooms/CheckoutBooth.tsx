/**
 * The Checkout Booth room body (handoff §Rooms): an "Invest in me" offer card, an
 * "Open the live checkout ↗" button that opens the mock Stripe overlay
 * (OPEN_CHECKOUT), and the append-only Ledger list with its empty state.
 */
import { useGame } from "../../state/GameContext";
import { LedgerList } from "./LedgerList";

export function CheckoutBooth() {
  const { profile, ledger, dispatch } = useGame();
  const handle = profile.handle || "you";

  return (
    <div>
      <div className="rounded-[16px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white p-5 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[hsl(25_20%_38%)]">
          Product 1 of 1 · live
        </p>
        <p className="mt-1 font-display text-[22px] font-black text-[hsl(25_34%_20%)]">Invest in me</p>
        <p className="mt-1 text-[13px] text-[hsl(25_20%_38%)]">
          Backers get double their money as store credit.
        </p>
        <button
          type="button"
          onClick={() => dispatch({ type: "OPEN_CHECKOUT" })}
          className="mt-3.5 inline-flex min-h-[44px] items-center justify-center rounded-[10px] bg-build px-6 text-sm font-semibold text-white hover:brightness-110"
        >
          Open the live checkout ↗
        </button>
        <p className="mt-2.5 font-mono text-[10.5px] text-[hsl(25_20%_38%)]">
          pay.firstprofit.school/{handle} · Stripe, via the First Profit account
        </p>
      </div>

      <div className="mt-4">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]">Ledger</p>
        <LedgerList ledger={ledger} emptyText="Empty so far. The first row is the whole point of Phase 1." />
      </div>
    </div>
  );
}
