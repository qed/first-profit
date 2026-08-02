/**
 * A minimal focus trap for the fpv2 modal dialogs (StepRunner, Celebration,
 * the room dialog). While `active`, Tab / Shift+Tab cycle between
 * the first and last focusable element INSIDE the panel, so a keyboard user can
 * never tab out of an `aria-modal` dialog into the scrim'd floor behind it.
 *
 * Scope: this is the Tab-cycling half only. Each dialog keeps its own
 * focus-on-open and Escape-to-close wiring (unchanged). The panel itself carries
 * tabIndex={-1} and is excluded from the cycle by the selector below, so an
 * empty-but-focused panel still traps (we refocus the panel).
 */
import { useEffect, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        // Nothing tabbable inside — keep focus pinned to the panel.
        e.preventDefault();
        node.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey) {
        // Going backwards off the first element (or from the panel shell) wraps to last.
        if (activeEl === first || activeEl === node || !node.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else if (activeEl === last) {
        // Going forwards off the last element wraps to first.
        e.preventDefault();
        first.focus();
      }
    };

    node.addEventListener("keydown", onKey);
    return () => node.removeEventListener("keydown", onKey);
  }, [ref, active]);
}
