/**
 * The real-world SETUP GUIDE overlay (PP2 Unit 7, R24.10).
 *
 * Renders the CHOSEN provider's real-world walkthrough: the concrete steps a
 * parent-kid team takes to go live for real. The framing is parent-controlled:
 * for an under-13 founder a PARENT owns the account and the payouts (Stripe /
 * Shopify Payments require an 18+ account holder), the kid runs the business on
 * those rails. This is guidance only; First Profit processes no money.
 *
 * The steps are sourced from src/data/providers.ts (provider.setup), which is
 * sourced from artifacts/checkout-booth-comparison.md. First Profit Pay has no
 * external setup (provider.setup is empty), so it renders an explicit
 * "nothing to set up" state, never an empty panel.
 *
 * Overlay conventions (mirrors ProviderSwitchCoach / the room dialogs): fixed
 * scrim, role="dialog" aria-modal, tabIndex -1 panel, focus-on-open,
 * Escape-to-dismiss, useFocusTrap, full-screen < sm / floating >= sm. Mobile-first
 * ~390px; the dismiss control is >= 44px. No em dashes in copy. Provider name +
 * step copy are rendered as JSX text (React default escaping), never
 * dangerouslySetInnerHTML.
 */
import { useEffect, useRef } from "react";
import { PROVIDERS, type ProviderId } from "../../data/providers";
import { useFocusTrap } from "../../lib/useFocusTrap";

export function SetupGuide({
  providerId,
  onDismiss,
}: {
  providerId: ProviderId;
  onDismiss: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  useFocusTrap(panelRef, true);

  // Unknown/stale id -> fall back to the raw id for the name; treat as no steps
  // (mirrors the display-path unknown-id fallback elsewhere in the booth).
  const provider = PROVIDERS[providerId];
  const name = provider ? provider.name : providerId;
  const steps = provider ? provider.setup : [];
  const hasSteps = steps.length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex bg-[hsl(25_34%_20%/0.55)] sm:items-center sm:justify-center sm:p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fp-setup-title"
        tabIndex={-1}
        className="flex h-full w-full flex-col overflow-y-auto border-t-4 border-build bg-[hsl(40_55%_97%)] px-6 py-9 outline-none sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-full sm:max-w-[460px] sm:rounded-3xl sm:p-8 sm:shadow-[0_12px_32px_rgba(30,24,16,.2)]"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-build">Set it up for real</p>
        <h2
          id="fp-setup-title"
          className="mt-2 font-display text-[26px] font-black leading-[1.15] text-[hsl(25_34%_20%)]"
        >
          {hasSteps ? `Go live with ${name}` : `${name} is ready to go`}
        </h2>

        {hasSteps ? (
          <>
            <p className="mt-3 text-[14px] leading-[1.55] text-[hsl(25_34%_20%)]">
              A parent owns the account and the payouts, and you run the business on top. Cards need
              an adult account holder, so a parent sets these up with you.
            </p>
            <ol className="mt-5 flex flex-col gap-3">
              {steps.map((s, i) => (
                <li
                  key={s.title}
                  className="flex gap-3 rounded-2xl border-2 border-[hsl(25_34%_20%/0.15)] bg-white p-4"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-build font-mono text-[13px] font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-display text-[15px] font-bold text-[hsl(25_34%_20%)]">{s.title}</p>
                    <p className="mt-0.5 text-[13px] leading-[1.5] text-[hsl(25_20%_38%)]">{s.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <div className="mt-3">
            <p className="text-[14px] leading-[1.55] text-[hsl(25_34%_20%)]">
              There is nothing to set up. First Profit Pay is the easy button: no account to open, no
              bank to connect, no store to build. It just works, which is why it takes the biggest cut
              of every sale.
            </p>
            <p className="mt-3 text-[13px] leading-[1.5] text-[hsl(25_20%_38%)]">
              Want to keep more of your money? Compare providers again and pick one you build for real.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={onDismiss}
          className="mt-6 inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-build px-5 font-display text-base font-bold text-white hover:brightness-110"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
