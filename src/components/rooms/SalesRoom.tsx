/**
 * The Sales Room room body (handoff §Rooms; criterion 1.2's room "market"): a
 * "Log a sale" form (customer + amount). On submit it mints the id + timestamp
 * HERE (caller-side, never in gameCore) and dispatches ADD_LEDGER {kind:'sale'}.
 *
 * The core auto-completes 1.2's last task for the active idea when a sale is
 * logged (and fires the 1.2 celebration when that was the last task) — this is
 * where 1.2.last completes per the handoff. The sync layer persists the row with
 * source='mock'.
 *
 * Validation: amount must be > 0 and within the mock cap ($1000 = 100000 cents,
 * matching the DB insert policy's amount bound). Cents are integers.
 */
import { useRef, useState } from "react";
import { useGame } from "../../state/GameContext";
import { LedgerList } from "./LedgerList";

/** Mock cap in cents, matching the fp_ledger insert policy's amount bound. */
const SALE_CAP_CENTS = 100000;

/** Parse a free-text dollar amount into integer cents, or null if invalid. */
function parseAmountCents(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (cleaned === "") return null;
  const dollars = parseFloat(cleaned);
  if (!Number.isFinite(dollars)) return null;
  const cents = Math.round(dollars * 100);
  if (cents <= 0 || cents > SALE_CAP_CENTS) return null;
  return cents;
}

export function SalesRoom() {
  const { ledger, dispatch } = useGame();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  // Synchronous in-flight guard: a fast double-click on "Log the sale" must not
  // dispatch two distinct sale rows before the cleared inputs re-render. The ref
  // flips before the dispatch; typing a new sale (onChange) re-arms it.
  const submittingRef = useRef(false);

  const cents = parseAmountCents(amount);
  const disabled = name.trim() === "" || cents === null;

  const logSale = () => {
    if (submittingRef.current) return;
    if (name.trim() === "" || cents === null) return;
    submittingRef.current = true;
    dispatch({
      type: "ADD_LEDGER",
      id: crypto.randomUUID(),
      kind: "sale",
      payer: name.trim(),
      amountCents: cents,
      createdAt: new Date().toISOString(),
    });
    setName("");
    setAmount("");
  };

  const onNameChange = (value: string) => {
    submittingRef.current = false;
    setName(value);
  };
  const onAmountChange = (value: string) => {
    submittingRef.current = false;
    setAmount(value);
  };

  return (
    <div>
      <p className="text-[13.5px] leading-[1.6] text-[hsl(25_20%_38%)]">
        When money actually changes hands, log it here. Your parent audits every row against real money
        received.
      </p>

      <div className="mt-3.5 rounded-[14px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white p-4">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]">Log a sale</p>
        <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_6rem]">
          <input
            aria-label="Customer name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Customer (not family)"
            className="w-full rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] px-3 py-2.5 text-sm outline-none focus:border-sell"
          />
          <input
            aria-label="Sale amount in dollars"
            inputMode="decimal"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder="$12"
            className="w-full rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] px-3 py-2.5 font-mono text-sm outline-none focus:border-sell"
          />
        </div>
        <button
          type="button"
          onClick={logSale}
          disabled={disabled}
          className="mt-2.5 min-h-[44px] w-full rounded-[10px] bg-[hsl(25_34%_20%)] text-sm font-semibold text-[hsl(40_55%_97%)] hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Log the sale
        </button>
      </div>

      <LedgerList ledger={ledger} />
    </div>
  );
}
