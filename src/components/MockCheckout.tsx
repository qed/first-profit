/**
 * The mock Stripe checkout overlay (handoff §G, screenshot 06). Opened by
 * `checkoutOpen`; rendered from Factory (App-level state, above the breakpoint
 * conditional). Two panes on desktop, STACKED to one column on mobile.
 *
 *   left  = product summary: avatar initial, "Back <name>", $ amount, credit
 *           line, a $10/$25/$50 amount picker, payout disclaimer.
 *   right = card form: name on card (editable); test card 4242 fields read-only.
 *
 * On Pay: a success state (stamp-in checkmark, "<payer> backed <name>.", credit
 * line) AND a caller-minted ADD_LEDGER {kind:'backing'} row — the id + timestamp
 * are stamped HERE, never in gameCore. The backing lands in the ledger and, via
 * backingSumCents, updates the HUD Sales stat. The sync layer persists it with
 * source='mock'.
 *
 * This is clearly a MOCK: the "Test mode · powered by Stripe · no real charge"
 * label is REQUIRED and must stay. CLOSE_CHECKOUT dismisses.
 *
 * Overlay conventions mirror StepRunner / MockCheckout siblings: full-screen
 * below sm, floating from sm; aria-modal; Escape-to-close; the fp-rise / fp-stamp
 * animations are zeroed under prefers-reduced-motion in src/index.css.
 */
import { useEffect, useRef, useState } from "react";
import { useGame } from "../state/GameContext";

const AMOUNTS = [10, 25, 50] as const;

export function MockCheckout() {
  const { checkoutOpen, profile, dispatch } = useGame();

  const [amount, setAmount] = useState<number>(25);
  const [payerName, setPayerName] = useState("");
  const [paid, setPaid] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => dispatch({ type: "CLOSE_CHECKOUT" });

  // Reset the local form each time the overlay opens (fresh backing every time).
  useEffect(() => {
    if (checkoutOpen) {
      setAmount(25);
      setPayerName("");
      setPaid(false);
    }
  }, [checkoutOpen]);

  // Focus the dialog on open and wire Escape → CLOSE_CHECKOUT.
  useEffect(() => {
    if (!checkoutOpen) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutOpen]);

  if (!checkoutOpen) return null;

  const firstName = profile.firstName || "Founder";
  const handle = profile.handle || "you";
  const initial = (firstName.trim()[0] || "F").toUpperCase();
  const credit = amount * 2;
  const backerLabel = payerName.trim() || "A backer";

  const pay = () => {
    dispatch({
      type: "ADD_LEDGER",
      id: crypto.randomUUID(),
      kind: "backing",
      payer: backerLabel,
      amountCents: amount * 100,
      createdAt: new Date().toISOString(),
    });
    setPaid(true);
  };

  return (
    <div className="fixed inset-0 z-[70] flex bg-[hsl(25_34%_20%/0.6)] sm:items-center sm:justify-center sm:p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Mock Stripe checkout"
        tabIndex={-1}
        className="fp-rise flex h-full w-full flex-col overflow-y-auto bg-white outline-none sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-full sm:max-w-[840px] sm:rounded-2xl sm:shadow-[0_24px_64px_rgba(0,0,0,.3)]"
        style={{ animation: "fp-rise .3s cubic-bezier(.22,1,.36,1) both" }}
      >
        <div className="flex items-center justify-between border-b border-[hsl(40_14%_89%)] px-5 py-3">
          <span className="min-w-0 truncate font-mono text-xs text-[hsl(30_6%_52%)]">
            🔒 pay.firstprofit.school/{handle}
          </span>
          <button
            type="button"
            onClick={close}
            aria-label="Close checkout"
            className="shrink-0 rounded-md px-2 py-1 text-[15px] text-[hsl(30_6%_52%)] hover:bg-[hsl(40_24%_96%)]"
          >
            ✕
          </button>
        </div>

        {paid ? (
          <div className="px-8 py-12 text-center">
            <span
              className="fp-stamp mx-auto inline-flex h-[60px] w-[60px] items-center justify-center rounded-full text-[28px]"
              style={{
                background: "hsl(150 52% 42% / .12)",
                color: "hsl(150 52% 36%)",
                animation: "fp-stamp .55s cubic-bezier(.34,1.56,.64,1) both",
              }}
              aria-hidden
            >
              ✓
            </span>
            <h2 className="mt-4 font-display text-[26px] font-extrabold text-[hsl(30_12%_12%)]">
              {backerLabel} backed {firstName}.
            </h2>
            <p className="mt-2 text-sm text-[hsl(30_8%_34%)]">
              ${amount}.00 received · ${credit} store credit issued
            </p>
            <p className="mt-1 font-mono text-xs text-[hsl(30_6%_52%)]">
              It just landed in the ledger and the $1,000 bar.
            </p>
            <button
              type="button"
              onClick={close}
              className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-[10px] bg-[hsl(30_12%_12%)] px-7 text-sm font-semibold text-white"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2">
            {/* Left — product summary */}
            <div className="border-b border-[hsl(40_14%_89%)] bg-[hsl(40_30%_99%)] p-7 sm:border-b-0 sm:border-r">
              <div className="flex items-center gap-2.5">
                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-sell font-display text-sm font-extrabold text-white">
                  {initial}
                </span>
                <span className="text-sm font-semibold text-[hsl(30_12%_12%)]">
                  {firstName}'s first company
                </span>
              </div>
              <p className="mt-6 text-sm text-[hsl(30_8%_34%)]">Back {firstName}</p>
              <p className="mt-1 font-mono text-[34px] font-bold leading-none text-[hsl(30_12%_12%)]">
                ${amount}.00
              </p>
              <p className="mt-1 text-[13px] text-[hsl(30_8%_34%)]">
                Invest in me · you get <b>${credit} in store credit</b>
              </p>
              <div className="mt-4 flex gap-2">
                {AMOUNTS.map((amt) => {
                  const selected = amount === amt;
                  return (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setAmount(amt)}
                      aria-pressed={selected}
                      className={`min-h-[44px] flex-1 rounded-[10px] font-mono text-sm font-semibold ${
                        selected
                          ? "border-2 border-build bg-[hsl(217_74%_56%/0.08)]"
                          : "border border-[hsl(40_10%_80%)] bg-white"
                      }`}
                    >
                      ${amt}
                    </button>
                  );
                })}
              </div>
              <p className="mt-5 text-[11.5px] leading-[1.55] text-[hsl(30_6%_52%)]">
                Paid to First Profit on behalf of {firstName} (parent-controlled payout). Store credit is a
                promise to deliver later.
              </p>
            </div>

            {/* Right — card form */}
            <div className="p-7">
              <p className="text-sm font-semibold text-[hsl(30_12%_12%)]">Pay with card</p>
              <div className="mt-3.5 flex flex-col gap-2.5">
                <input
                  aria-label="Name on card"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                  placeholder="Name on card"
                  className="w-full rounded-lg border border-[hsl(40_10%_80%)] px-3 py-2.5 text-sm outline-none focus:border-build"
                />
                <div className="overflow-hidden rounded-lg border border-[hsl(40_10%_80%)]">
                  <input
                    aria-label="Card number"
                    value="4242 4242 4242 4242"
                    readOnly
                    className="w-full border-0 border-b border-[hsl(40_10%_80%)] px-3 py-2.5 font-mono text-sm text-[hsl(30_6%_52%)]"
                  />
                  <div className="grid grid-cols-2">
                    <input
                      aria-label="Card expiry"
                      value="12 / 28"
                      readOnly
                      className="w-full border-0 border-r border-[hsl(40_10%_80%)] px-3 py-2.5 font-mono text-sm text-[hsl(30_6%_52%)]"
                    />
                    <input
                      aria-label="Card CVC"
                      value="424"
                      readOnly
                      className="w-full border-0 px-3 py-2.5 font-mono text-sm text-[hsl(30_6%_52%)]"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={pay}
                  className="mt-1.5 min-h-[46px] rounded-lg bg-build px-5 text-[15px] font-semibold text-white hover:brightness-110"
                >
                  Pay ${amount}.00
                </button>
                <p className="text-center font-mono text-[10.5px] text-[hsl(30_6%_52%)]">
                  Test mode · powered by Stripe · no real charge
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
