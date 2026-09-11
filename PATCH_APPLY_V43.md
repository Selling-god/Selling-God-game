# RIFT DECK v4.3 Progression / Move / Evolution / Reward Patch

## Apply
Copy the files in this patch over the project root, preserving folders.

Changed runtime files:
- `server.js`
- `data/move-library.js` (new)
- `public/app.js`
- `public/styles.css`
- `public/index.html`

No other project files need to be replaced.

## Main changes
- Monster EXP is now awarded at **battle settlement only**. Using a move or spell no longer levels a monster every turn.
- Fresh run monsters begin at Lv.5 and can grow to Lv.100.
- Expanded original move library: **1,104 moves** generated from RIFT DECK's 12 elements / 20 archetypes / universal schools.
- Each species has **23 level-up move milestones + 32 Tech Disc candidates** (55 possible move choices per species, while keeping 4 active move slots).
- New move prompts appear only when a real move-learning milestone is crossed; Warden/Boss Tech Disc prompts remain separate.
- Natural evolution thresholds use monster point cost (1P starters evolve at Lv.16; stronger monsters later). GENE early evolution remains supported.
- Evolution now has a full-screen multi-stage cinematic using the project's own monster form sprites.
- Battle victory flow now emphasizes **EXP settlement -> level/move/evolution events -> reward selection**.
- Post-battle reward UI is redesigned as a roguelite modifier/sigil selection screen with party EXP bars and reroll controls, rather than a card-grid upgrade screen.
- The previous 10-wave biome / 5W Warden / 10W boss / field-support wave patch is preserved.

## QA completed
- Full existing project test suite: PASS
- Move library: 1,104 unique IDs
- All 205 monsters: 23 level moves + 32 Tech Disc candidates
- Per-action XP check: PASS (no XP from using a spell)
- Lv.8 milestone learning prompt: PASS
- Lv.16 starter natural evolution + event order + sprite payload: PASS

## Note
The implementation studies roguelite battle-flow concepts from PokeRogue but does not copy its source code, names, or assets. RIFT DECK keeps its own spell, GENE, Resonance, Rift Bloom, fusion, monster art, and combat systems.
