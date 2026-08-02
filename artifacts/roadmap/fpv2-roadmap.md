# fpv2 roadmap

Living index of the fpv2 build. Per-piece requirements/brainstorm docs live
alongside this file in `artifacts/roadmap/`.

_Last updated: 2026-08-02_

```
┌─────┬────────────────────────────────┬───────────────────────────────────────────────────────────────────────────┬─────────────────────────┐
│  #  │             Piece              │                                   What                                     │         Status          │
├─────┼────────────────────────────────┼───────────────────────────────────────────────────────────────────────────┼─────────────────────────┤
│ 1   │ Slice A — game on real         │ fpv2 game, existing-child login, player profiles + RLS, mock checkout      │ ✅ Shipped              │
│     │ accounts                       │ (Payment Phase 1)                                                          │                         │
├─────┼────────────────────────────────┼───────────────────────────────────────────────────────────────────────────┼─────────────────────────┤
│     │                                │ signup + verify + consent + child creation + username login (no email),    │ ✅ Built + deployed     │
│ 2   │ Slice B — Start Building       │ parent emails, R28 erasure. Username re-scope shipped.                      │ (gated off; awaiting    │
│     │                                │                                                                            │ flag flip + RLS probe)  │
├─────┼────────────────────────────────┼───────────────────────────────────────────────────────────────────────────┼─────────────────────────┤
│     │                                │ ★ Checkout Booth "which provider do you use?" lesson. FP Pay = 50% fee;     │ ✅ SHIPPED to prod      │
│ 3   │ Payment Phase 2                │ student compares providers + picks one. 7 units, fp_ledger fee columns     │ 2026-08-02 (#5 + #127   │
│     │                                │ migration applied. Per-sale fee modeled gross→fee→net.                     │ merged; live)           │
├─────┼────────────────────────────────┼───────────────────────────────────────────────────────────────────────────┼─────────────────────────┤
│ 4   │ Payment Phase 3                │ live money, real payouts (Connect/KYC), public launch                      │ ⬜ Own plan             │
├─────┼────────────────────────────────┼───────────────────────────────────────────────────────────────────────────┼─────────────────────────┤
│ 5   │ /fp retirement                 │ retire old child-facing surface at parity (redirect-first). Brainstorm     │ 📝 Requirements parked  │
│     │                                │ done: redirect + surface-delete, primarily the120 work.                    │ (not started)           │
├─────┼────────────────────────────────┼───────────────────────────────────────────────────────────────────────────┼─────────────────────────┤
│     │ Student email addresses        │ provision real Workspace mailboxes for all students under                  │ ⬜ Own branch + own     │
│ 6   │ (firstprofit.school) ⭐        │ firstprofit.school; move every student domain off the120.school;           │ review, after /fp       │
│     │                                │ auth-mail-guard update; re-introduce R12/R13                               │ retirement              │
└─────┴────────────────────────────────┴───────────────────────────────────────────────────────────────────────────┴─────────────────────────┘
```

## Per-piece docs

- **#5 /fp retirement** — `artifacts/roadmap/2026-08-02-fp-child-retirement-requirements.md`
  (redirect-first; retire old `/fp` child surface once fpv2 is the only child door)

## Active side-tracks (not roadmap pieces)

- **FP login + account-creation link-out** (achieves the user-flow testing goal) —
  account model decided 2026-08-02: fpv2 = game + login (username/password) only;
  account creation lives at the120 `/start`. Retire the redundant in-SPA signup flow
  + add a "Create Account" link on the login page →
  `https://the120.school/start?src=fplogin`. Requirements:
  `docs/brainstorms/2026-08-02-fp-login-account-creation-requirements.md`.
  (Supersedes the old flag-flip "testing milestone" + the the120 signup-enable
  handoff, both now marked superseded.)
- **Slice B go-live remainder** — with the in-SPA signup retired, the FP CTA cutover
  is moot; any remaining go-live items (RLS re-probe, etc.) live on the120 side.

## Notes

- **Piece #2 reframe (2026-08-02):** the Slice B *in-SPA signup front-end* is being
  retired — account creation moved to the120 `/start`; fpv2 keeps username/password
  login + a "Create Account" link out. The signup *backend* (`/api/fp/signup*`) and
  username login remain. "Awaiting flag flip" no longer applies. See the login
  link-out side-track above.
- Pieces #4 and #5 are the open, sequenceable work; **#6 is blocked behind #5**.
- Legend: ✅ shipped · 📝 requirements parked · ⬜ not started (needs its own plan).
