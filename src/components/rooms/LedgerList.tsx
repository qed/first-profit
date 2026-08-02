/**
 * The append-only ledger list, shared by The Checkout Booth and The Sales Room
 * (handoff §Rooms). Rows are the session's `state.ledger`:
 *   💵 sales green-tinted, each showing payer + amount.
 *
 * PP2 Unit 3 retired the `backing` kind, so every row is a `sale`. Unit 5
 * re-lays this out to a gross -> fee -> net row.
 *
 * The rendered list is CAPPED at the most-recent CAP rows (newest first). The real
 * ledger lives append-only in fp_ledger and PostgREST silently truncates large
 * selects (~1000 rows); an unbounded client list is a foot-gun once a player has
 * hundreds of rows, so we never render more than CAP here (the server-side
 * aggregate for full totals is tracked as later work in the plan).
 */
import type { LedgerEntry } from "../../state/gameCore";
import { PROVIDERS, type ProviderId } from "../../data/providers";

/** Most-recent rows rendered. Keeps the DOM bounded regardless of ledger length. */
export const LEDGER_RENDER_CAP = 50;

/** Whole-dollar (or up-to-2dp) display of an integer-cent amount. */
function formatDollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * A row's provider display label. Known ids map to the provider name; an unknown
 * (non-null) id falls back to the raw id string. A null providerId (legacy /
 * un-modeled row) has no label. Always rendered as JSX text (React default
 * escaping), never dangerouslySetInnerHTML.
 */
function providerLabel(providerId: string | null | undefined): string | null {
  if (!providerId) return null;
  const provider = PROVIDERS[providerId as ProviderId];
  return provider ? provider.name : providerId;
}

/** One compact label/value amount cell in the gross -> fee -> net breakdown. */
function AmountCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="block font-mono text-[9px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]">
        {label}
      </span>
      <span className="block truncate font-mono text-[12.5px] font-semibold text-[hsl(25_34%_20%)]">
        {value}
      </span>
    </div>
  );
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

  // Newest first, bounded to the render cap. Sort by createdAt rather than array
  // position: an in-session ledger is append-ordered (oldest->newest), but after
  // a reload loadLedger returns rows created_at DESC and SET_LEDGER stores them
  // verbatim, so a position-based slice(-CAP).reverse() would flip the order and
  // (past the cap) drop the NEWEST rows. Sorting on createdAt is order-source
  // independent, so the cap always keeps the newest CAP rows, newest first.
  const rows = [...ledger]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    .slice(0, LEDGER_RENDER_CAP);

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {rows.map((row) => {
        const gross = row.grossCents ?? row.amountCents;
        const fee = row.feeCents ?? 0;
        const net = row.netCents ?? gross;
        const label = providerLabel(row.providerId);
        // A legacy / un-modeled row (no provider, no fee) shows gross only. No
        // fee/net breakdown to render, so it reads gracefully as "no fee".
        const modeled = fee > 0 || row.providerId != null;

        return (
          <div
            key={row.id}
            className="rounded-[10px] border border-[hsl(25_34%_20%/0.12)] bg-white px-3 py-2.5"
          >
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] text-xs"
                style={{ background: "hsl(150 52% 42% / .15)" }}
                aria-hidden
              >
                💵
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-[hsl(25_34%_20%)]">
                <b>{row.payer || "A backer"}</b>
              </span>
              {label ? (
                <span className="max-w-[45%] shrink truncate rounded-[6px] bg-[hsl(40_55%_97%)] px-1.5 py-0.5 font-mono text-[10px] text-[hsl(25_20%_38%)]">
                  {label}
                </span>
              ) : null}
            </div>

            {modeled ? (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <AmountCell label="Gross" value={`$${formatDollars(gross)}`} />
                <AmountCell label="Fee" value={`-$${formatDollars(fee)}`} />
                <AmountCell label="Net" value={`$${formatDollars(net)}`} />
              </div>
            ) : (
              <div className="mt-2">
                <AmountCell label="Amount" value={`$${formatDollars(gross)}`} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
