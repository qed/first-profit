/**
 * The append-only ledger list, shared by The Checkout Booth and The Sales Room
 * (handoff §Rooms). Rows are the session's `state.ledger`:
 *   🤝 backings gold-tinted, 💵 sales green-tinted, each showing payer + amount.
 *
 * The rendered list is CAPPED at the most-recent CAP rows (newest first). The real
 * ledger lives append-only in fp_ledger and PostgREST silently truncates large
 * selects (~1000 rows); an unbounded client list is a foot-gun once a player has
 * hundreds of rows, so we never render more than CAP here (the server-side
 * aggregate for full totals is tracked as later work in the plan).
 */
import type { LedgerEntry } from "../../state/gameCore";

/** Most-recent rows rendered. Keeps the DOM bounded regardless of ledger length. */
export const LEDGER_RENDER_CAP = 50;

/** kind → the row's label, matching the prototype's product copy. */
function productFor(kind: LedgerEntry["kind"]): string {
  return kind === "backing" ? "Invest in me · store credit" : "First sale";
}

/** Whole-dollar (or up-to-2dp) display of an integer-cent amount. */
function formatDollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function LedgerList({
  ledger,
  emptyText,
}: {
  ledger: LedgerEntry[];
  /** When set, renders this line while the ledger is empty; omit to render nothing. */
  emptyText?: string;
}) {
  if (ledger.length === 0) {
    return emptyText ? (
      <p className="mt-2 text-[12.5px] text-[hsl(25_20%_38%)]">{emptyText}</p>
    ) : null;
  }

  // Newest first, bounded to the render cap.
  const rows = ledger.slice(-LEDGER_RENDER_CAP).reverse();

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {rows.map((row) => {
        const backing = row.kind === "backing";
        return (
          <div
            key={row.id}
            className="flex items-center gap-2.5 rounded-[10px] border border-[hsl(25_34%_20%/0.12)] bg-white px-3 py-2.5"
          >
            <span
              className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] text-xs"
              style={{ background: backing ? "hsl(41 88% 52% / .18)" : "hsl(150 52% 42% / .15)" }}
              aria-hidden
            >
              {backing ? "🤝" : "💵"}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-[hsl(25_34%_20%)]">
              <b>{row.payer || "A backer"}</b> · {productFor(row.kind)}
            </span>
            <span className="shrink-0 font-mono text-[13px] font-semibold text-[hsl(25_34%_20%)]">
              ${formatDollars(row.amountCents)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
