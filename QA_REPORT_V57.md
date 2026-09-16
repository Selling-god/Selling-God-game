# RIFT DECK V57 QA Report

## Automated validation
Project tested from the full V57 tree.

### Static checks
`npm run check`
- JavaScript syntax checks: PASS
- 205 monster catalog: PASS
- 205 unique species signature moves: PASS
- move FX family coverage >= 18: PASS
- sleep/freeze move coverage: PASS
- serialized battle timeline tokens: PASS
- bottom narration system: PASS
- high-DPI move canvas FX: PASS
- status cinematics: PASS
- reward V57 layout: PASS
- Render Web Service configuration: PASS

Observed static result:
`V57_STATIC_OK monsters=205 signatures=205 fxFamilies=21 sleep=3 freeze=7`

### Dynamic server test
`npm test`
- build/version/deploy check: PASS
- monster-only loadout: PASS
- turn-cost fusion: PASS
- fusion partner removal / lineage: PASS
- legacy card combat disabled: PASS
- PP decrements after use: PASS
- PP persists to next wave: PASS
- HP / status / PP reset after wave 10: PASS
- resume API returns active expedition: PASS
- V57 runtime server flow: PASS

Observed build result:
`BUILD_OK v5.7.0 deploy=RIFT-V570-BATTLE-PHASE-FX-20260916 cards=315 items=128 enemies=205 floors=50`

Observed V57 flow result:
`V57_BATTLE_PHASE_FX_OK ... signatures=205 fxFamilies=21`

## Visual/browser note
A local headless-browser screenshot smoke test could not be completed because the execution environment blocks local 127.0.0.1 browser navigation by policy. Therefore this report does not claim pixel-perfect browser screenshot QA. Syntax, build, server, battle-system, fusion, persistence, recovery, and resume tests were executed successfully.
