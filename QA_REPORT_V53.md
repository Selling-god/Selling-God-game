# RIFT DECK V53 QA REPORT

## Build
- Version: 5.3.0
- Deploy ID: RIFT-V53-HELD-ITEMS-20260915
- Cards: 315
- Items: 128
- Monsters: 205
- Dungeon floors: 50

## New V53 checks
- encounter-start client route: PASS
- automatic route POST removed from renderRoute: PASS
- stale vote idempotent handling inherited from V52: PASS
- top run money HUD token: PASS
- battle money HUD token: PASS
- held item endpoint: PASS
- held item persisted on run monster: PASS
- held item copied into battle combatant: PASS
- held item definitions i121-i128 exposed through /api/meta: PASS
- item count >=128: PASS
- existing image assets reused: PASS

## Full regression suite
`npm test` final run: PASS

Passed suites:
- BUILD
- SMOKE
- MULTIPLAYER (4 players)
- COMBAT
- COMBAT DEPTH
- 50 FLOOR
- AUTH
- CLOUD ROOM
- FUN LOOP
- VISUAL FIRST
- EXPEDITION HUNT / IN-BATTLE CAPTURE
- GAME FEEL
- V40 MONSTER EVOLUTION
- V41 ACTIVE MONSTER
- V42 RIFT REWRITE
- V52 CLASSIC BATTLE
- V53 HELD ITEM
- V47 PREMIUM LOOP

Final console markers included:
- `BUILD_OK v5.3.0 deploy=RIFT-V53-HELD-ITEMS-20260915 cards=315 items=128 enemies=205 floors=50`
- `V53_HELD_ITEM_OK items=128 encounterManual=true moneyHud=true held=i121`
