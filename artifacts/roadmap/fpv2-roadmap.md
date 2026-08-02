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

- **fpv2 user-flow testing milestone** — get a walkable signup→child→play flow on
  firstprofit.school for testing. the120-side handoff:
  `docs/handoffs/2026-08-02-the120-enable-fpv2-signup-testing.md`. First Profit side:
  flip `VITE_ENABLE_SIGNUP` for the test window.
- **Slice B go-live remainder** (piece #2 → live): flip `VITE_ENABLE_SIGNUP`, RLS
  re-probe, live-Workspace acceptance run. Mostly credential-gated / human-owned.

## Notes

- Pieces #4 and #5 are the open, sequenceable work; **#6 is blocked behind #5**.
- Legend: ✅ shipped · 📝 requirements parked · ⬜ not started (needs its own plan).
