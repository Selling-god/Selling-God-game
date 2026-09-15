# RIFT DECK V54 - Signature Moves, RIFT LINK, Readable Battle Pacing

Release: 5.4.0
Deploy ID: RIFT-V540-SIGNATURE-TACTIC-PACING-20260915

## What changed

- Battle pacing is intentionally slower and staged. A combat update now keeps the old battlefield visible while the move animation resolves, then applies the new HP/status UI.
- Normal move timing is roughly 1.05-1.15 seconds per action. Signature and heavy moves are roughly 1.5 seconds before the next action is presented.
- Battle input is locked while choreography is resolving, preventing accidental double inputs.
- Post-battle READY state auto-continues after a short countdown. The Next Battle button remains only as an optional fast-forward.
- All 205 monster species have one unique signature move. Signature move IDs and names are unique per species.
- Existing saves are migrated in combat: if a monster has no species signature move, it is inserted into its active move set.
- Initial move sets now contain one species signature move plus shared learnset moves.
- Move FX are split into 21 visual families including flame, meteor, slash, claw, bite, rush, wave, cyclone, bullet, beam, thunder, toxin, shadow, time, mirror, root, quake, ice, spore, heal, and guard.
- FX metadata is deterministic per move/species: family, variant, tempo, and hit count.
- Move buttons show element, move class, accuracy/cooldown, power, and effect/debuff chips.
- Enemy status panels show active burn, shock, weak, vulnerable, seal, and BREAK states.
- Combat feedback shows move element, signature marker, damage/heal/guard result, applied debuffs, and RIFT LINK amplification.
- Enemy heavy attacks use that enemy species' signature move name and visual family.

## RIFT LINK replaces the old low-value spell feel

The battle command formerly presented as a generic spell action is now RIFT LINK TACTIC.

- It does not consume the monster's action.
- Same-element tactic -> next monster move +20% and BREAK +6.
- Different-element tactic -> next monster move +10% and BREAK +3.
- The battle UI gives contextual recommendations for same-element links, healing, and status combos.
- Existing card/deck data remains compatible; no art re-upload is required.

## Effect clarity

Move previews explicitly show possible effects such as burn, shock, weak, vulnerable, intent seal, BREAK, lifesteal, splash, guard, heal, and resonance. After the hit, the floating result panel reports what actually landed.

## Compatibility

- No monster image files were replaced in this patch.
- Existing V53.2 save/profile data is retained.
- Held items, resume, capture, evolution, 50-floor progression, multiplayer, and cloud room behavior remain enabled.
