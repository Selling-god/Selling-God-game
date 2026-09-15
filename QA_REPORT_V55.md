# RIFT DECK V55 QA REPORT

## Build / syntax

- `node --check server.js` PASS
- `node --check public/app.js` PASS
- `node --check data/move-library.js` PASS
- `npm run check` PASS
- catalog: cards 315 / items 128 / monsters 205

## Full regression

`npm test` PASS.

Verified suites:

- SMOKE_OK
- MULTI_OK (4 players)
- COMBAT_OK
- COMBAT_DEPTH_OK
- FIFTY_FLOOR_OK
- AUTH_OK
- CLOUD_ROOM_OK
- FUN_LOOP_OK
- VISUAL_FIRST_OK
- EXPEDITION_HUNT_OK
- GAME_FEEL_OK
- V40_MONSTER_EVOLUTION_OK
- V41_ACTIVE_MONSTER_OK
- V42_RIFT_REWRITE_OK
- V52_CLASSIC_BATTLE_OK
- V53_HELD_ITEM_OK
- V531_CLIENT_RUNTIME_OK
- V532_BATTLEFLOW_RESUME_OK
- V54_SIGNATURE_PACING_OK
- V55_STATUS_COMMAND_RESUME_OK
- V51_PREMIUM_LOOP_OK

## V55 regression targets

### Reward crash
- `nextRerollCost()` exists in the client.
- Reward reroll cost no longer raises `ReferenceError` during post-battle render.

### Resume
- Profile `activeRoomId` is used even when the client no longer has a loaded room object.
- Server stores `activeRoomSnapshot` fallback.
- V55 integration test creates a battle room, stops the server, restarts with the same profile store, calls `/api/rooms/resume`, and restores the same active run.

### Battle FX
- Combat FX is not globally disabled by OS reduced-motion preference.
- Status theater functions are present for burn, poison, shock, attack down, defense down, seal, break, guard, heal and buffs.
- Tactic command has its own cast banner and status FX.

### Move readability
- 2x2 desktop move grid has content-sized rows and scrolling fallback.
- Mobile uses a one-column move list.
- Type/effect tags are visible without clipping.

### Signature moves
- 205 species receive signature moves.
- V54 signature pacing suite remains PASS after V55 changes.
