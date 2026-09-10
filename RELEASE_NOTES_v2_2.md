# RIFT DECK : ABYSS EXPEDITION v2.2

## Cloud account / persistence
- Supabase Auth based account registration and login.
- Simple game account ID + password flow. The server maps the account ID to an internal Supabase Auth identity.
- HTTP-only session cookies; service-role keys are never exposed to the browser.
- Logged-in progression uses the Supabase Auth user UUID as the authoritative profile ID.
- Persistent collection, deck, prism, dust, seals, gacha pity, dungeon records, journey records and difficulty clears.
- Last-20 expedition history is stored on each cloud profile.
- Active rooms/runs are snapshotted to `rift_rooms` and restored after a Render process restart.
- Guest progress can be adopted by the account on first login/signup from the same browser.
- Logout and cloud-save status added to the profile page.
- Authenticated identity overrides client-supplied profile IDs for room and combat actions.

## Combat feel / VFX
- Three strengths of screen shake.
- Short visual hit-stop on impacts.
- Damage, heal and block floating numbers.
- Element-colored impact particles for all 12 card elements.
- Slash/impact streak effects.
- Card-cast clone animation from hand toward the target.
- Enemy hit recoil, flash and death animation.
- Player damage vignette/flash.
- Summoned unit entrance effect.
- Enemy phase, turn, boss encounter, victory and defeat center banners.
- Animated enemy intent and boss aura.
- Slowly moving combat background for depth.
- Staggered reward-card/item reveal.
- FX on/off switch plus reduced-motion accessibility fallback.
- WebAudio upgraded to layered procedural cues for card casts, impacts, shields, heals, summons, bosses, rewards and victory.
- Shield-break burst and enemy lunge feedback added for incoming damage.

## Existing content retained
- 315 cards, 48 run items, 55 enemies/bosses, 5 biomes.
- 50-floor dungeon, Normal/Hard/Hell.
- 1-4 player server-authoritative co-op.
- Per-floor card/item reward selection.
- Journey capture, rerun gacha, collection/deck building.
