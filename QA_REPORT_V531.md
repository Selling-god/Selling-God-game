# RIFT DECK V53.1 QA REPORT

- Version: 5.3.1
- Deploy ID: RIFT-V531-RUNMOD-HOTFIX-20260915
- Main fix: client `runMod(run,key)` helper restored before battle capture UI renders.
- Cache-bust: `/app.js?v=RIFT-V531-RUNMOD-HOTFIX-20260915`

## Reproduced failure
Previous V53 client could throw:
`ReferenceError: runMod is not defined`
from `battleCaptureChanceUi()` while entering battle. This interrupted `renderBattle()` and made the encounter appear stuck.

## Fix verification
- `node --check public/app.js`: PASS
- `scripts/v531-client-runtime-test.js`: PASS
- Full `npm test`: PASS
- 315 cards / 128 items / 205 monsters / 615 forms retained
- V52 classic battle regression: PASS
- V53 held item regression: PASS
- V53.1 runMod/capture bonus regression: PASS (`captureBonus=0.16` sample)
- 50-floor run, multiplayer, auth, cloud room, combat, capture, evolution, rift rewrite: PASS

## Build result
`BUILD_OK v5.3.1 deploy=RIFT-V531-RUNMOD-HOTFIX-20260915 cards=315 items=128 enemies=205 floors=50`
