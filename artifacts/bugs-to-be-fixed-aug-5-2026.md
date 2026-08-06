# Bugs To Be Fixed — Aug 5, 2026

Source: "FirstProfit, First Look" Google Doc (tester feedback from Tsenguun, Pietro, and Edgar; Steve's tab was empty as of Aug 6, 2026).
Testers were Quinn, Scarlett, and Robin's accounts on https://firstprofit.school/.

Severity scale: **P0** = blocks users / data-losing · **P1** = major UX or correctness issue · **P2** = polish / clarity.

---

## Authentication & Session

### BUG-001 · First-login failure with valid credentials (403) — **P0**
- **Reported by:** Tsenguun, Pietro (independently reproduced)
- **Symptom:** First login attempt with correct credentials (e.g. `robin@firstprofit.school` / `iloveschool`) fails with "Hmm, that username and password do not match…". On one MacBook (Chrome) all kids' credentials failed with a **403**.
- **Repro environments (Pietro):** Chrome on MSI laptop (normal tab); Brave on MacBook Air M4 2025; Chrome on MacBook M1 2023. **Not** reproduced in Chrome incognito on a Lenovo T14.
- **Workarounds observed:** second attempt succeeded (no cache clear) on MSI + Brave/MacBook Air; restarting Chrome fixed the MacBook M1; incognito worked where normal tabs failed.
- **Suspected causes (Tsenguun):** cached bad CORS preflight result, or backend changes served against stale cached values.
- **Related observation (Pietro):** two people can log into the same profile simultaneously, but only on devices that don't exhibit the login bug — may share a root cause.

### BUG-002 · Pasted password (Ctrl+V) rejected on login — **P1**
- **Reported by:** Edgar
- **Symptom:** Logging in with a copy-pasted password fails; typing the same password manually works. Possible whitespace/composition handling issue in the password field.

### BUG-003 · Session token expires mid-session, no refresh — **P1**
- **Reported by:** Tsenguun
- **Symptom:** Auth session token expired midway through play; user gets kicked/blocked. No silent refresh.
- **Suggested fix (from doc):** implement refresh-token flow.

---

## Onboarding

### BUG-004 · "See your live checkout" button does nothing — **P1**
- **Reported by:** Tsenguun
- **Symptom:** Button in onboarding is inert. If it isn't meant to be clickable it shouldn't look like a button.

---

## Idea Room / Tasks & Steps

### BUG-005 · "Next task" button skips all steps within a task — **P1**
- **Reported by:** Tsenguun
- **Symptom:** Steps for each of the 5 tasks appear in the left sidebar, but the green "Next task" button jumps straight to the next task, bypassing every step. Suggestion from doc: green button should advance to the next **step** within the current task, not the next task.

### BUG-006 · Criterion passes without completing any steps — **P1**
- **Reported by:** Tsenguun
- **Symptom:** Passed the Criterion without doing any of the steps. Completion gating isn't enforced.

### BUG-007 · "Founder File" cannot be found — **P1**
- **Reported by:** Tsenguun
- **Symptom:** The Founder File referenced in the flow isn't discoverable in the UI.

### BUG-008 · "New Idea" creates an idea even when dismissed — **P1**
- **Reported by:** Tsenguun
- **Symptom:** Pressing "New Idea" creates the idea even if dismissed on the first task; there's no way to delete ideas.
- **Related UI issues:** "Not named" cards need a distinct empty-state card variant (currently they look like no idea was created); the idea grid card UI only updates once an idea is named.

---

## Phases / Progression

### BUG-009 · Phase 2 starts silently after Phase 1 — **P1**
- **Reported by:** Tsenguun
- **Symptom:** After finishing "1.5 The Outreach Room", Phase 2 begins immediately with no warning or celebration/transition, and the background page still shows Phase 1 while working in Phase 2.

---

## Dashboard / Your Site

### BUG-010 · "Your site" card shows "live" chip when site isn't live — **P2**
- **Reported by:** Tsenguun
- **Symptom:** The "live" chip is static/incorrect. Make the chip reflect actual site status.

---

## Copy & Clarity

### BUG-011 · "You can take real money today" copy is unclear — **P2**
- **Reported by:** Pietro
- **Symptom:** Not enough context for what the phrase means; "Invest in who?" also unclear. Review this copy for kid-level clarity.

---

## Non-bug notes from the doc

- **Process suggestions (Pietro):** record screens during test sessions; evolve the bug log format as new bug types appear (technical, UX design, …).

## Suggested fix order

1. **BUG-001** first-login 403 (blocks every new user's first impression)
2. **BUG-003** session expiry / refresh token
3. **BUG-005 / BUG-006** step skipping + criterion gating (undermines the curriculum)
4. **BUG-002** password paste, **BUG-004** dead checkout button, **BUG-008** idea creation/deletion
5. **BUG-007** Founder File discoverability, **BUG-009** phase transition
6. **BUG-010** live chip, **BUG-011** copy clarity
