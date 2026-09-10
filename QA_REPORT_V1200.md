# QA report - V12.0 Reality Consistency

Automated release gate covers:
- JavaScript syntax and release marker
- undefined render-function references
- Steam smoke checks
- business-logic invariants
- founder/outside/hostile ownership reconciliation
- explicit path required for founder control loss
- active share-count and organization-headcount consistency
- finance/accounting sanity checks
- startup-loading contract and route integrity
- 17 workspace render matrix
- NaN/undefined leakage, duplicate DOM IDs and empty buttons
- deployment-root synchronization

`npm run release` passed after the V12 changes.

Remaining manual QA before a paid Steam launch still includes real Supabase concurrency, two-user simultaneous economic actions, interrupted network transactions, multi-hour sessions, save/reconnect across devices and first-time-user playtests.
