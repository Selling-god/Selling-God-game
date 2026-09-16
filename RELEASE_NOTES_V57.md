# RIFT DECK V57 — Battle Phase Cinematic

Version: 5.7.0  
Deploy ID: `RIFT-V570-BATTLE-PHASE-FX-20260916`

## Why this release exists
V56 had the right systems (PP, persistent HP/status, 10-wave recovery, turn-cost fusion), but battle events arriving through SSE were rendered independently. Each update could restart its own delay at zero, so move announcements, impact FX, damage/status messages, and reward transitions overlapped. The result was a battle that felt much faster and flatter than intended.

V57 changes the client from overlapping event playback to a serialized battle timeline.

## Battle pacing and message box
- Added a single queued battle timeline shared by all incoming room events.
- Added a persistent bottom battle dialog with typewriter-style narration.
- Typical order is now: move announcement -> move animation -> hit/miss/result -> status result -> next action.
- Added explicit narration for:
  - missed moves
  - critical hits
  - super-effective / resisted hits
  - damage results
  - poison, burn, paralysis, sleep, freeze
  - status damage and recovery
  - paralysis/sleep/freeze action denial
  - BREAK / boss shield break
  - passives / held-item triggers
  - victory / defeat
- Battle->reward rendering waits for the queued battle timeline instead of cutting the final messages off.

## Stronger move FX
V57 keeps all existing original monster images and adds a high-DPI canvas FX layer on top of the existing DOM effects.

Distinct FX families include slash, claw, bite, rush, bullet, beam, thunder, flame, ice, wave, cyclone, root, spore, toxin, shadow, meteor, quake, time, mirror, music, heal, and guard. Signature moves use higher intensity, more particles, and longer impact timing.

## Status effects
- Added visible status cinematics for poison, burn, paralysis, sleep, freeze, stat up/down, BREAK, shielding, and recovery.
- Paralysis uses crackling/jitter feedback.
- Sleep uses floating Z effects.
- Freeze uses frost/ice feedback.
- Poison and burn use persistent colored particle feedback.
- Stat changes get clear up/down visual feedback.

## Enemy status mechanics
Enemy monsters can now actually receive and resolve major status conditions such as sleep, freeze, and paralysis. Status can prevent an enemy action, and the reason is narrated in the battle dialog.

## Reward/result presentation
- Rebuilt the post-battle result into a slower two-part layout: message panel + reward content.
- Added explicit messages for victory, skill learning, reward selection, and preparation for the next battle.
- Slowed automatic continuation so the player can read the result and rewards.

## Preserved V56 systems
- 205 original monsters and existing image assets unchanged.
- 205 species signature moves retained.
- PP-based moves retained.
- HP / PP / major status persist between waves.
- Full HP / PP / status recovery at each 10-wave boundary retained.
- `기술 / 융합 / 교대 / 봉인` battle menu retained.
- Fusion still consumes one action and combines two monsters, including move-pool selection.
- Held items, capture, co-op, resume, evolution/form systems, and segmented boss HP remain active.

## Deployment
This release is a Node Web Service, not a Static Site.

Expected health endpoint:
- version: `5.7.0`
- deployId: `RIFT-V570-BATTLE-PHASE-FX-20260916`
