# Continue KX CORPORATE from V10.0

Use this package as the source baseline. Read `SOURCE_OF_TRUTH_V1000.md` first.

Product direction:
- serious, extreme-realism online company management simulation
- no fixed ending; evolving management targets
- depth should live in the systems, not in cluttered explanatory UI
- desktop/tablet/mobile must avoid clipping and overlap
- no scroll jumps, accidental taps, duplicate money actions, or silent data resets
- BOT companies need distinct strategies and reactions
- revenue/cost/payroll/tax/debt/cashflow/product/people/supply/M&A/control systems should remain connected
- online communication should eventually extend into contracts, alliances, joint ventures, and M&A negotiation

Quality rule:
A feature is not “done” because it executes. It is done only when its state, numbers, interactions, failure handling, reload behavior, and responsive layout remain coherent.

Always run `npm run release` before packaging a patch. Do not claim zero bugs from automation alone; live multi-user/staging playtests are also required before a paid Steam launch.


## Commercial-quality rule added at final V10 gate
Treat small player-visible inconsistencies as release blockers. Do not expose raw database/auth/schema errors. Do not fabricate local success for server-authoritative cash, shares, or talent actions. Any stale/degraded state must preserve the last known-good snapshot and identify that it is delayed. A successful build is not enough: all 17 company workspaces must render cleanly and the live launch gate must still be completed.
