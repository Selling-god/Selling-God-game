# KX CORPORATE V10.0 Steam Quality Gate

V10 treats small interaction/data defects as release defects, not cosmetic issues.

## Automated gate
`npm run release` must pass all of these:
- build all supported static deployment roots
- JavaScript syntax and duplicate-function audit
- undefined render-function audit
- signed profit/loss display checks
- shareholder / takeover ownership invariants
- passive shareholders vs hostile takeover distinction
- stale snapshot protection
- duplicate-submit guards
- navigation / page-jump regression checks
- legacy service-worker/cache retirement checks
- responsive M&A layout checks
- player-facing backend/internal error sanitization checks
- inline-handler / raw-error leakage checks
- 17-workspace render matrix (no exception / NaN / undefined leakage)
- deployment file hash synchronization
- VM game-logic regression tests

## Still required before paid Steam launch
Automated tests cannot prove the absence of every runtime bug. Before paid release, use a production Supabase staging project and complete:
1. 60-minute fresh-account playthrough on Windows desktop.
2. 60-minute returning-account playthrough after browser/app restart.
3. Two-user concurrent session: CEO Lounge, company rankings, market/M&A state.
4. Network interruption/reconnect during a company action.
5. Double-click / rapid-click attempts on every money-moving action.
6. 1366x768, 1920x1080, tablet, and phone visual pass for clipping/overlap.
7. Save/reload checks before and after payroll, tax, project, hiring, M&A, and market transactions.
8. At least 10 outside testers with no verbal instructions; record every place they stop or misunderstand.

Paid Steam launch is a release decision only after those live checks are clean or all discovered blockers are fixed.
