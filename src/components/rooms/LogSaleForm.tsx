/**
 * Log a REAL sale through the chosen payment provider (PP2 Unit 5, R24.7).
 *
 * The student logs a sale their parent has verified really happened (First
 * Profit processes NO money). On submit it mints the ledger id + timestamp HERE
 * (caller-side; gameCore stays Date.now()-free) and dispatches ADD_LEDGER
 * {kind:'sale', grossCents}. The reducer models the fee/net through the CHOSEN
 * provider and snapshots providerId onto the row (see gameCore ADD_LEDGER).
 *
 * No-provider routing (R24.3/R24.5): a sale must never be logged un-modeled, so
 * with NO provider chosen this renders a prompt that routes the student to the
 * comparison FIRST instead of the form. The form only appears once a provider is
 * chosen, so every logged sale carries a real fee snapshot.
 *
 * Validation: amount must parse to a positive integer-cent value within the sale
 * cap; an empty/zero/negative/non-numeric amount is rejected (submit disabled).
 * Mobile-first at ~390px: full-width inputs, >=48px input height, >=44px submit.
 */
import { useRef, useState } from "react";
import { useGame } from "../../state/GameContext";

/** Sale cap in cents, matching the fp_ledger insert policy's amount bound. */
const SALE_CAP_CENTS = 100000;

/** Parse a free-text dollar amount into positive integer cents, or null if invalid. */
export function parseAmountCents(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (cleaned === "") return null;
  const dollars = parseFloat(cleaned);
  if (!Number.isFinite(dollars)) return null;
  const cents = Math.round(dollars * 100);
  if (cents <= 0 || cents > SALE_CAP_CENTS) return null;
  return cents;
}

export function LogSaleForm({ onChooseProvider }: { onChooseProvider?: () => void }) {
  const { chosenProvider, dispatch } = useGame();
  const [payer, setPayer] = useState("");
  const [amount, setAmount] = useState("");
  // Synchronous in-flight guard: a fast double-click must not dispatch two rows
  // before the cleared inputs re-render. Flipped before dispatch; typing re-arms.
  const submittingRef = useRef(false);

  // No provider chosen yet: do NOT let a sale be logged un-modeled. Route the
  // student to the comparison first (the choice is available from the start).
  if (!chosenProvider) {
    return (
      <div className="w-full rounded-[14px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white p-4">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]">
          Log a sale
        </p>
        <p className="mt-2 text-[13px] leading-[1.5] text-[hsl(25_34%_20%)]">
          Choose a payment provider first. Every sale is logged through the provider that collects
          your money, so you can see the fee it takes.
        </p>
        <button
          type="button"
          onClick={() => onChooseProvider?.()}
          className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-[10px] bg-build px-5 text-sm font-semibold text-white hover:brightness-110"
        >
          Choose a provider first
        </button>
      </div>
    );
  }

  const cents = parseAmountCents(amount);
  const disabled = payer.trim() === "" || cents === null;

  const logSale = () => {
    if (submittingRef.current) return;
    if (payer.trim() === "" || cents === null) return;
    submittingRef.current = true;
    // Mint id + timestamp at the caller boundary; the reducer models fee/net from
    // the chosen provider and snapshots providerId. `mock` is omitted so this is a
    // REAL sale (completes 1.2 + fires the first-sale celebration).
    dispatch({
      type: "ADD_LEDGER",
      id: crypto.randomUUID(),
      kind: "sale",
      payer: payer.trim(),
      amountCents: cents,
      grossCents: cents,
      createdAt: new Date().toISOString(),
    });
    setPayer("");
    setAmount("");
  };

  const onPayerChange = (value: string) => {
    submittingRef.current = false;
    setPayer(value);
  };
  const onAmountChange = (value: string) => {
    submittingRef.current = false;
    setAmount(value);
  };

  return (
    <div className="w-full rounded-[14px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white p-4">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]">
        Log a real sale
      </p>
      <p className="mt-1.5 text-[12.5px] leading-[1.5] text-[hsl(25_20%_38%)]">
        Log a sale that really happened and your parent has verified. First Profit never touches the
        money. Your provider collects it and takes its fee.
      </p>
      <div className="mt-3 flex flex-col gap-2.5">
        <input
          aria-label="Customer name"
          value={payer}
          onChange={(e) => onPayerChange(e.target.value)}
          placeholder="Customer (not family)"
          className="min-h-[48px] w-full rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] px-3 py-2.5 text-sm outline-none focus:border-sell"
        />
        <input
          aria-label="Sale amount in dollars"
          inputMode="decimal"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          placeholder="$12"
          className="min-h-[48px] w-full rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] px-3 py-2.5 font-mono text-sm outline-none focus:border-sell"
        />
      </div>
      <button
        type="button"
        onClick={logSale}
        disabled={disabled}
        className="mt-3 min-h-[44px] w-full rounded-[10px] bg-[hsl(25_34%_20%)] text-sm font-semibold text-[hsl(40_55%_97%)] hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Log the sale
      </button>
    </div>
  );
}
